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

    // 4. 사용자별 사용 횟수 확인 (usage_per_user 체크)
    const { count: userUsageCount, error: usageCheckError } = await supabase
      .from('promotion_code_usages')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_code_id', promoCode.id)
      .eq('user_id', userId);

    if (usageCheckError) {
      console.error('Usage check error:', usageCheckError);
      return res.status(500).json({
        success: false,
        error: '프로모션 코드 확인 중 오류가 발생했습니다.'
      });
    }

    if (userUsageCount >= promoCode.usage_per_user) {
      return res.status(400).json({
        success: false,
        error: `이 프로모션 코드는 ${promoCode.usage_per_user}번까지만 사용 가능합니다.`
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
    // 6-1. user_tokens 테이블에서 현재 잔액 조회
    const { data: tokenData, error: tokenFetchError } = await supabase
      .from('user_tokens')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenFetchError) {
      console.error('Token fetch error:', tokenFetchError);
      return res.status(500).json({
        success: false,
        error: '토큰 정보 조회 중 오류가 발생했습니다.'
      });
    }

    const currentBalance = tokenData?.balance || 0;
    const newBalance = currentBalance + promoCode.token_amount;

    // 6-2. token_transactions에 거래 기록 먼저 생성 (balance 업데이트 전)
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
        error: '토큰 거래 기록 생성 중 오류가 발생했습니다.'
      });
    }

    // 6-3. promotion_code_usages에 사용 기록 저장 (balance 업데이트 전)
    const { error: usageRecordError } = await supabase
      .from('promotion_code_usages')
      .insert({
        promotion_code_id: promoCode.id,
        user_id: userId,
        token_transaction_id: transaction.id
      });

    if (usageRecordError) {
      console.error('Usage record error:', usageRecordError);
      return res.status(500).json({
        success: false,
        error: '프로모션 코드 사용 기록 저장 중 오류가 발생했습니다.'
      });
    }

    // 6-4. user_tokens 잔액 업데이트 (모든 검증 통과 후 마지막에)
    const { error: balanceUpdateError } = await supabase
      .from('user_tokens')
      .upsert({
        user_id: userId,
        balance: newBalance,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (balanceUpdateError) {
      console.error('Balance update error:', balanceUpdateError);
      return res.status(500).json({
        success: false,
        error: '토큰 잔액 업데이트 중 오류가 발생했습니다.'
      });
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
