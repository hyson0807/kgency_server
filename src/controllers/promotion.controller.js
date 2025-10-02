const { supabase } = require('../config/database');

/**
 * 프로모션 코드 사용 (토큰 지급)
 */
const redeemCode = async (req, res) => {
  const userId = req.user.userId;
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      success: false,
      error: '프로모션 코드를 입력해주세요.'
    });
  }

  // 코드를 대문자로 변환하여 대소문자 구분 없이 처리
  const normalizedCode = code.trim().toUpperCase();

  try {
    // 1. 프로모션 코드 조회 및 검증
    const { data: promoCode, error: promoError } = await supabase
      .from('promotion_codes')
      .select('*')
      .eq('code', normalizedCode)
      .single();

    if (promoError || !promoCode) {
      return res.status(404).json({
        success: false,
        error: '유효하지 않은 프로모션 코드입니다.'
      });
    }

    // 2. 활성화 여부 확인
    if (!promoCode.is_active) {
      return res.status(400).json({
        success: false,
        error: '이 프로모션 코드는 더 이상 사용할 수 없습니다.'
      });
    }

    // 3. 유효 기간 확인
    const now = new Date();
    const validFrom = new Date(promoCode.valid_from);
    const validUntil = promoCode.valid_until ? new Date(promoCode.valid_until) : null;

    if (now < validFrom) {
      return res.status(400).json({
        success: false,
        error: '아직 사용할 수 없는 프로모션 코드입니다.'
      });
    }

    if (validUntil && now > validUntil) {
      return res.status(400).json({
        success: false,
        error: '만료된 프로모션 코드입니다.'
      });
    }

    // 4. 중복 사용 확인 (이 유저가 이미 사용했는지)
    const { data: existingUsage, error: usageCheckError } = await supabase
      .from('promotion_code_usages')
      .select('id')
      .eq('promotion_code_id', promoCode.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (usageCheckError) {
      console.error('Usage check error:', usageCheckError);
      return res.status(500).json({
        success: false,
        error: '프로모션 코드 확인 중 오류가 발생했습니다.'
      });
    }

    if (existingUsage) {
      return res.status(400).json({
        success: false,
        error: '이미 사용한 프로모션 코드입니다.'
      });
    }

    // 5. 전체 사용 제한 확인
    if (promoCode.usage_limit !== null) {
      const { count: totalUsageCount, error: countError } = await supabase
        .from('promotion_code_usages')
        .select('id', { count: 'exact', head: true })
        .eq('promotion_code_id', promoCode.id);

      if (countError) {
        console.error('Count error:', countError);
        return res.status(500).json({
          success: false,
          error: '프로모션 코드 확인 중 오류가 발생했습니다.'
        });
      }

      if (totalUsageCount >= promoCode.usage_limit) {
        return res.status(400).json({
          success: false,
          error: '프로모션 코드 사용 가능 횟수가 초과되었습니다.'
        });
      }
    }

    // 6. 토큰 지급 처리 (트랜잭션)
    // 6-1. user_tokens 테이블에서 현재 잔액 조회 또는 생성
    const { data: tokenData, error: tokenFetchError } = await supabase
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenFetchError) {
      console.error('Token fetch error:', tokenFetchError);
      return res.status(500).json({
        success: false,
        error: '토큰 정보 조회 중 오류가 발생했습니다.'
      });
    }

    let currentBalance = 0;
    if (!tokenData) {
      // 토큰 레코드가 없으면 생성
      const { error: createError } = await supabase
        .from('user_tokens')
        .insert({
          user_id: userId,
          balance: 0
        });

      if (createError) {
        console.error('Token creation error:', createError);
        return res.status(500).json({
          success: false,
          error: '토큰 정보 생성 중 오류가 발생했습니다.'
        });
      }
    } else {
      currentBalance = tokenData.balance;
    }

    const newBalance = currentBalance + promoCode.token_amount;

    // 6-2. token_transactions에 거래 기록 생성
    const { data: transaction, error: transactionError } = await supabase
      .from('token_transactions')
      .insert({
        user_id: userId,
        amount: promoCode.token_amount,
        type: 'admin_gift',
        description: `프로모션 코드: ${normalizedCode}`,
        metadata: {
          promotion_code_id: promoCode.id,
          promotion_code: normalizedCode
        }
      })
      .select()
      .single();

    if (transactionError || !transaction) {
      console.error('Transaction creation error:', transactionError);
      return res.status(500).json({
        success: false,
        error: '토큰 지급 중 오류가 발생했습니다.'
      });
    }

    // 6-3. user_tokens 잔액 업데이트
    const { error: balanceUpdateError } = await supabase
      .from('user_tokens')
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (balanceUpdateError) {
      console.error('Balance update error:', balanceUpdateError);
      return res.status(500).json({
        success: false,
        error: '토큰 잔액 업데이트 중 오류가 발생했습니다.'
      });
    }

    // 6-4. promotion_code_usages에 사용 기록 저장
    const { error: usageRecordError } = await supabase
      .from('promotion_code_usages')
      .insert({
        promotion_code_id: promoCode.id,
        user_id: userId,
        token_transaction_id: transaction.id
      });

    if (usageRecordError) {
      console.error('Usage record error:', usageRecordError);
      // 이미 토큰은 지급되었으므로, 로그만 남기고 성공 처리
      // (unique constraint 위반 등의 경우)
    }

    // 7. 성공 응답
    return res.status(200).json({
      success: true,
      data: {
        tokens_received: promoCode.token_amount,
        new_balance: newBalance,
        message: `${promoCode.token_amount}개의 토큰이 지급되었습니다!`
      }
    });

  } catch (error) {
    console.error('Redeem code error:', error);
    return res.status(500).json({
      success: false,
      error: '프로모션 코드 처리 중 오류가 발생했습니다.'
    });
  }
};

module.exports = {
  redeemCode
};
