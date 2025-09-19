const { supabase } = require('../config/database');

/**
 * 회사용 토큰 정보 조회
 */
const getTokenInfo = async (req, res) => {
  try {
    const companyId = req.user.userId;

    // 사용자 토큰 잔액 조회
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('balance, updated_at, created_at')
      .eq('user_id', companyId)
      .single();

    if (tokenError && tokenError.code !== 'PGRST116') {
      console.error('Token fetch error:', tokenError);
      return res.status(500).json({
        success: false,
        error: '토큰 정보 조회 중 오류가 발생했습니다.'
      });
    }

    // 토큰 레코드가 없으면 생성
    let balance = 0;
    let lastUpdated = new Date().toISOString();

    if (!tokenData) {
      const { data: newToken, error: createError } = await supabase
        .from('user_tokens')
        .insert({
          user_id: companyId,
          balance: 10 // 초기 토큰 10개 지급
        })
        .select()
        .single();

      if (createError) {
        console.error('Token creation error:', createError);
        return res.status(500).json({
          success: false,
          error: '토큰 계정 생성 중 오류가 발생했습니다.'
        });
      }

      balance = newToken.balance;
      lastUpdated = newToken.updated_at || newToken.created_at;
    } else {
      balance = tokenData.balance;
      lastUpdated = tokenData.updated_at || tokenData.created_at;
    }

    // 오늘 사용한 토큰 계산
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const { data: todayTransactions, error: transactionError } = await supabase
      .from('token_transactions')
      .select('amount')
      .eq('user_id', companyId)
      .eq('type', 'spend')
      .gte('created_at', startOfDay)
      .lt('created_at', endOfDay);

    if (transactionError) {
      console.error('Today transactions fetch error:', transactionError);
      // 오류가 있어도 계속 진행 (used_today는 0으로 설정)
    }

    const usedToday = todayTransactions?.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) || 0;

    const tokenInfo = {
      balance,
      used_today: usedToday,
      daily_limit: 50,
      last_updated: lastUpdated
    };

    res.json({
      success: true,
      data: tokenInfo
    });
  } catch (error) {
    console.error('Token info fetch error:', error);
    res.status(500).json({
      success: false,
      error: '토큰 정보 조회 중 오류가 발생했습니다.'
    });
  }
};

/**
 * 토큰 사용 (프로필 열람 등)
 */
const spendTokens = async (req, res) => {
  try {
    const companyId = req.user.userId;
    const { amount, purpose, target_id } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: '올바른 토큰 수량을 입력해주세요.'
      });
    }

    // 현재 토큰 잔액 확인
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('balance')
      .eq('user_id', companyId)
      .single();

    if (tokenError) {
      console.error('Token balance check error:', tokenError);
      return res.status(500).json({
        success: false,
        error: '토큰 잔액 확인 중 오류가 발생했습니다.'
      });
    }

    if (!tokenData || tokenData.balance < amount) {
      return res.status(400).json({
        success: false,
        error: '토큰 잔액이 부족합니다.'
      });
    }

    // 트랜잭션 시작
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 토큰 사용 기록 저장
    const { error: transactionError } = await supabase
      .from('token_transactions')
      .insert({
        user_id: companyId,
        amount: -amount, // 사용은 음수로 기록
        type: 'spend',
        reference_id: target_id,
        description: purpose === 'profile_unlock' ? '프로필 열람' : purpose,
        metadata: { purpose, target_id }
      });

    if (transactionError) {
      console.error('Token transaction insert error:', transactionError);
      return res.status(500).json({
        success: false,
        error: '토큰 사용 기록 저장 중 오류가 발생했습니다.'
      });
    }

    // 토큰 잔액 업데이트
    const { error: balanceUpdateError } = await supabase
      .from('user_tokens')
      .update({
        balance: tokenData.balance - amount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', companyId);

    if (balanceUpdateError) {
      console.error('Token balance update error:', balanceUpdateError);
      return res.status(500).json({
        success: false,
        error: '토큰 잔액 업데이트 중 오류가 발생했습니다.'
      });
    }

    // 프로필 열람의 경우 applications 테이블 업데이트
    if (purpose === 'profile_unlock' && target_id) {
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          profile_unlocked_at: new Date().toISOString()
        })
        .eq('id', target_id)
        .eq('company_id', companyId);

      if (updateError) {
        console.error('Profile unlock update error:', updateError);
        return res.status(500).json({
          success: false,
          error: '프로필 열람 처리 중 오류가 발생했습니다.'
        });
      }
    }

    res.json({
      success: true,
      data: {
        remaining_balance: tokenData.balance - amount,
        transaction_id: transactionId
      }
    });
  } catch (error) {
    console.error('Token spend error:', error);
    res.status(500).json({
      success: false,
      error: '토큰 사용 중 오류가 발생했습니다.'
    });
  }
};

/**
 * 토큰 구매
 */
const purchaseTokens = async (req, res) => {
  try {
    const companyId = req.user.userId;
    const { package_id } = req.body;

    if (!package_id) {
      return res.status(400).json({
        success: false,
        error: '패키지 ID가 필요합니다.'
      });
    }

    // TODO: IAP 검증 및 토큰 지급 로직 구현

    res.json({
      success: true,
      data: {
        tokens_added: 50, // 임시 수량
        new_balance: 60,
        transaction_id: `purchase_${Date.now()}`
      }
    });
  } catch (error) {
    console.error('Token purchase error:', error);
    res.status(500).json({
      success: false,
      error: '토큰 구매 중 오류가 발생했습니다.'
    });
  }
};

/**
 * 토큰 사용 내역 조회
 */
const getTokenTransactions = async (req, res) => {
  try {
    const companyId = req.user.userId;
    const limit = parseInt(req.query.limit) || 20;

    // 토큰 트랜잭션 내역 조회
    const { data: transactions, error: transactionError } = await supabase
      .from('token_transactions')
      .select('id, type, amount, description, created_at')
      .eq('user_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (transactionError) {
      console.error('Token transactions fetch error:', transactionError);
      return res.status(500).json({
        success: false,
        error: '토큰 내역 조회 중 오류가 발생했습니다.'
      });
    }

    res.json({
      success: true,
      data: transactions || []
    });
  } catch (error) {
    console.error('Token transactions fetch error:', error);
    res.status(500).json({
      success: false,
      error: '토큰 내역 조회 중 오류가 발생했습니다.'
    });
  }
};

/**
 * 회사별 지원자 목록 조회
 */
const getApplicants = async (req, res) => {
  try {
    const companyId = req.user.userId;
    const { status, unlocked_only } = req.query;

    let query = supabase
      .from('applications')
      .select(`
        *,
        user:profiles!user_id(
          id,
          name,
          profile_image_url,
          user_info(*)
        ),
        job_posting:job_postings!job_posting_id(
          id,
          title
        ),
        korean_test:korean_tests(
          audio_url,
          score,
          duration,
          questions_answered
        )
      `)
      .eq('company_id', companyId)
      .order('applied_at', { ascending: false });

    // 상태 필터링
    if (status) {
      query = query.eq('status', status);
    }

    // 프로필 열람 여부 필터링
    if (unlocked_only === 'true') {
      query = query.not('profile_unlocked_at', 'is', null);
    }

    const { data: applications, error } = await query;

    if (error) {
      console.error('Applications fetch error:', error);
      return res.status(500).json({
        success: false,
        error: '지원자 목록 조회 중 오류가 발생했습니다.'
      });
    }

    res.json({
      success: true,
      data: applications || []
    });
  } catch (error) {
    console.error('Get applicants error:', error);
    res.status(500).json({
      success: false,
      error: '지원자 목록 조회 중 오류가 발생했습니다.'
    });
  }
};

/**
 * 채팅방의 지원자 정보 조회
 */
const getApplicationByRoom = async (req, res) => {
  try {
    const companyId = req.user.userId;
    const { roomId } = req.params;

    // 채팅방 정보 조회
    const { data: chatRoom, error: roomError } = await supabase
      .from('chat_rooms')
      .select('application_id')
      .eq('id', roomId)
      .eq('company_id', companyId)
      .single();

    if (roomError || !chatRoom || !chatRoom.application_id) {
      return res.status(404).json({
        success: false,
        error: '채팅방 정보를 찾을 수 없습니다.'
      });
    }

    // 지원서 정보 조회
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        user:profiles!user_id(
          id,
          name,
          profile_image_url,
          user_info(*)
        ),
        job_posting:job_postings!job_posting_id(
          id,
          title
        )
      `)
      .eq('id', chatRoom.application_id)
      .eq('company_id', companyId)
      .single();

    if (appError || !application) {
      return res.status(404).json({
        success: false,
        error: '지원서를 찾을 수 없습니다.'
      });
    }

    // 프로필 열람 여부 확인
    const isProfileUnlocked = !!application.profile_unlocked_at;

    // 프로필이 열람된 경우에만 한국어 테스트 정보 포함
    let koreanTest = null;
    if (isProfileUnlocked) {
      const { data: testData } = await supabase
        .from('korean_tests')
        .select('*')
        .eq('user_id', application.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      koreanTest = testData;
    }

    res.json({
      success: true,
      data: {
        application,
        isProfileUnlocked,
        koreanTest
      }
    });
  } catch (error) {
    console.error('Get application by room error:', error);
    res.status(500).json({
      success: false,
      error: '지원자 정보 조회 중 오류가 발생했습니다.'
    });
  }
};

/**
 * 지원자 프로필 열람 (상세 정보 포함)
 */
const getApplicantProfile = async (req, res) => {
  try {
    const companyId = req.user.userId;
    const { applicationId } = req.params;

    // 지원서 정보 조회 (프로필 열람 권한 확인 포함)
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        user:profiles!user_id(
          id,
          name,
          profile_image_url,
          user_info(*)
        ),
        job_posting:job_postings!job_posting_id(
          id,
          title
        )
      `)
      .eq('id', applicationId)
      .eq('company_id', companyId)
      .single();

    if (appError || !application) {
      return res.status(404).json({
        success: false,
        error: '지원서를 찾을 수 없습니다.'
      });
    }

    // 프로필 열람 권한 확인
    if (!application.profile_unlocked_at) {
      return res.status(403).json({
        success: false,
        error: '프로필 열람 권한이 없습니다.',
        code: 'PROFILE_LOCKED'
      });
    }

    // 한국어 테스트 정보 조회
    const { data: koreanTest, error: testError } = await supabase
      .from('korean_tests')
      .select('*')
      .eq('user_id', application.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // 프로필 상세 정보 반환
    const profileData = {
      ...application,
      korean_test: koreanTest || null
    };

    res.json({
      success: true,
      data: profileData
    });
  } catch (error) {
    console.error('Get applicant profile error:', error);
    res.status(500).json({
      success: false,
      error: '프로필 조회 중 오류가 발생했습니다.'
    });
  }
};

module.exports = {
  getTokenInfo,
  spendTokens,
  purchaseTokens,
  getTokenTransactions,
  getApplicants,
  getApplicantProfile,
  getApplicationByRoom
};