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
  console.log('🔵 spendTokens called:', {
    companyId: req.user.userId,
    body: req.body
  });

  try {
    const companyId = req.user.userId;
    const { amount, purpose, target_id } = req.body;

    console.log('🔵 Processing spend:', { companyId, amount, purpose, target_id });

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: '올바른 토큰 수량을 입력해주세요.'
      });
    }

    // 프로필 열람의 경우 중복 결제 방지 - 토큰 차감 전에 확인
    if (purpose === 'profile_unlock' && target_id) {
      let userId;

      // 급구 기능인 경우 (target_id가 urgent_ prefix로 시작)
      if (target_id.startsWith('urgent_')) {
        userId = target_id.replace('urgent_', '');
      } else {
        // 일반 지원서 기반 프로필 열람
        const { data: application, error: appFetchError } = await supabase
          .from('applications')
          .select('user_id')
          .eq('id', target_id)
          .eq('company_id', companyId)
          .single();

        if (appFetchError || !application) {
          console.error('Application fetch error:', appFetchError);
          return res.status(400).json({
            success: false,
            error: '지원서 정보를 찾을 수 없습니다.'
          });
        }

        userId = application.user_id;
      }

      // 이미 unlock되었는지 확인
      const { data: existingUnlock } = await supabase
        .from('company_unlocked_profiles')
        .select('id')
        .eq('company_id', companyId)
        .eq('user_id', userId)
        .single();

      if (existingUnlock) {
        console.log(`Profile already unlocked for company ${companyId} and user ${userId}`);
        return res.status(200).json({
          success: true,
          message: '이미 열람한 프로필입니다.',
          alreadyUnlocked: true
        });
      }
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

    // 트랜잭션 ID 생성 (UUID 형식으로)
    // reference_id는 UUID 타입이므로, 급구 기능의 경우 null로 설정
    const isUrgentHiring = target_id && target_id.startsWith('urgent_');
    const actualReferenceId = isUrgentHiring ? null : target_id;

    const { data: transactionData, error: transactionInsertError } = await supabase
      .from('token_transactions')
      .insert({
        user_id: companyId,
        amount: -amount, // 사용은 음수로 기록
        type: 'spend',
        reference_id: actualReferenceId,
        description: purpose === 'profile_unlock'
          ? (isUrgentHiring ? `프로필 열람 (급구 - ${target_id})` : '프로필 열람')
          : purpose
      })
      .select('id')
      .single();

    if (transactionInsertError) {
      console.error('Token transaction insert error:', {
        error: transactionInsertError,
        message: transactionInsertError.message,
        details: transactionInsertError.details,
        hint: transactionInsertError.hint,
        code: transactionInsertError.code,
        data: {
          user_id: companyId,
          amount: -amount,
          type: 'spend',
          reference_id: target_id,
          description: purpose === 'profile_unlock' ? '프로필 열람' : purpose
        }
      });
      return res.status(500).json({
        success: false,
        error: '토큰 사용 기록 저장 중 오류가 발생했습니다.',
        debug: process.env.NODE_ENV === 'development' ? transactionInsertError.message : undefined
      });
    }

    const transactionId = transactionData.id;

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

    // 프로필 열람의 경우 처리
    if (purpose === 'profile_unlock' && target_id) {
      let userId;

      // 급구 기능인 경우 (target_id가 urgent_ prefix로 시작)
      if (target_id.startsWith('urgent_')) {
        userId = target_id.replace('urgent_', '');
        console.log(`Urgent hiring profile unlock for user ${userId}`);
      } else {
        // 일반 지원서 기반 프로필 열람
        const { data: application, error: appFetchError } = await supabase
          .from('applications')
          .select('user_id')
          .eq('id', target_id)
          .eq('company_id', companyId)
          .single();

        if (appFetchError || !application) {
          console.error('Application fetch error:', appFetchError);
          return res.status(500).json({
            success: false,
            error: '지원서 정보를 찾을 수 없습니다.'
          });
        }

        userId = application.user_id;
      }

      // company_unlocked_profiles 테이블에 기록
      const { error: unlockError } = await supabase
        .from('company_unlocked_profiles')
        .insert({
          company_id: companyId,
          user_id: userId,
          unlocked_at: new Date().toISOString(),
          token_transaction_id: transactionId
        });

      if (unlockError) {
        // 이미 언락된 경우 (unique constraint violation) 무시
        if (unlockError.code !== '23505') {
          console.error('Profile unlock insert error:', unlockError);
          return res.status(500).json({
            success: false,
            error: '프로필 열람 처리 중 오류가 발생했습니다.'
          });
        }
      }

      console.log(`Profile unlocked for company ${companyId} and user ${userId}`);
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

    // 프로필 열람 여부 필터링 - 새로운 테이블에서 확인
    if (unlocked_only === 'true') {
      // company_unlocked_profiles 테이블과 조인하여 열람된 프로필만 필터링
      query = query.innerJoin('company_unlocked_profiles', 'applications.user_id', 'company_unlocked_profiles.user_id')
        .eq('company_unlocked_profiles.company_id', companyId);
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
          phone_number,
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

    // 프로필 열람 여부 확인 - 새로운 테이블에서 확인
    const { data: unlockedProfile } = await supabase
      .from('company_unlocked_profiles')
      .select('unlocked_at')
      .eq('company_id', companyId)
      .eq('user_id', application.user_id)
      .single();

    // 새 테이블에서 프로필 열람 여부 확인
    const isProfileUnlocked = !!unlockedProfile;

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

    // 프로필 열람 권한 확인 - 새로운 테이블에서 확인
    const { data: unlockedProfile } = await supabase
      .from('company_unlocked_profiles')
      .select('unlocked_at')
      .eq('company_id', companyId)
      .eq('user_id', application.user_id)
      .single();

    // 새 테이블에서 프로필 열람 여부 확인
    const isProfileUnlocked = !!unlockedProfile;

    if (!isProfileUnlocked) {
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

/**
 * 프로필 열람 상태 확인
 */
const getProfileUnlockStatus = async (req, res) => {
  try {
    const companyId = req.user.userId;
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: '사용자 ID가 필요합니다.'
      });
    }

    // company_unlocked_profiles 테이블에서 확인
    const { data: unlockedProfile, error } = await supabase
      .from('company_unlocked_profiles')
      .select('unlocked_at')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Profile unlock status check error:', error);
      return res.status(500).json({
        success: false,
        error: '프로필 열람 상태 확인 중 오류가 발생했습니다.'
      });
    }

    res.json({
      success: true,
      data: {
        isUnlocked: !!unlockedProfile,
        unlockedAt: unlockedProfile?.unlocked_at || null
      }
    });
  } catch (error) {
    console.error('Get profile unlock status error:', error);
    res.status(500).json({
      success: false,
      error: '프로필 열람 상태 확인 중 오류가 발생했습니다.'
    });
  }
};

/**
 * 회사 온보딩 완료
 */
const completeCompanyOnboarding = async (req, res) => {
  try {
    const companyId = req.user.userId;
    const { companyName, address, businessNumber } = req.body;

    // 입력 유효성 검사
    if (!companyName || !address || !businessNumber) {
      return res.status(400).json({
        success: false,
        error: '모든 필수 정보를 입력해주세요.'
      });
    }

    // 현재 프로필 정보 가져오기
    const { data: currentProfile, error: currentProfileError } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', companyId)
      .single();

    if (currentProfileError) {
      console.error('Profile fetch error:', currentProfileError);
      return res.status(500).json({
        success: false,
        error: '프로필 정보 조회 중 오류가 발생했습니다.'
      });
    }

    // company 타입인지 확인
    if (currentProfile.user_type !== 'company') {
      return res.status(400).json({
        success: false,
        error: '회사 계정만 이 작업을 수행할 수 있습니다.'
      });
    }

    // 이미 company_info가 존재하는지 확인
    const { data: existingCompanyInfo, error: existingError } = await supabase
      .from('company_info')
      .select('id')
      .eq('company_id', companyId)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('Existing company info check error:', existingError);
      return res.status(500).json({
        success: false,
        error: '회사 정보 확인 중 오류가 발생했습니다.'
      });
    }

    // 이미 존재하면 업데이트, 없으면 삽입
    if (existingCompanyInfo) {
      const { error: updateError } = await supabase
        .from('company_info')
        .update({
          name: companyName,
          address: address,
          business_number: businessNumber,
          updated_at: new Date().toISOString()
        })
        .eq('company_id', companyId);

      if (updateError) {
        console.error('Company info update error:', updateError);
        return res.status(500).json({
          success: false,
          error: '회사 정보 업데이트 중 오류가 발생했습니다.'
        });
      }
    } else {
      // company_info 테이블에 정보 저장
      const { error: insertError } = await supabase
        .from('company_info')
        .insert({
          company_id: companyId,
          name: companyName,
          address: address,
          business_number: businessNumber
        });

      if (insertError) {
        console.error('Company info insert error:', insertError);
        return res.status(500).json({
          success: false,
          error: '회사 정보 저장 중 오류가 발생했습니다.'
        });
      }
    }

    // profiles 테이블의 onboarding_completed를 true로 업데이트
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        onboarding_completed: true,
        name: companyName // profiles 테이블의 name도 업데이트
      })
      .eq('id', companyId);

    if (profileUpdateError) {
      console.error('Profile update error:', profileUpdateError);
      return res.status(500).json({
        success: false,
        error: '프로필 업데이트 중 오류가 발생했습니다.'
      });
    }

    res.json({
      success: true,
      data: {
        message: '회사 온보딩이 완료되었습니다.',
        company_info: {
          name: companyName,
          address: address,
          business_number: businessNumber
        }
      }
    });

  } catch (error) {
    console.error('Company onboarding completion error:', error);
    res.status(500).json({
      success: false,
      error: '회사 온보딩 완료 중 오류가 발생했습니다.'
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
  getApplicationByRoom,
  getProfileUnlockStatus,
  completeCompanyOnboarding
};