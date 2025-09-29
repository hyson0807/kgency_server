// src/services/appInit.service.js
const { supabase } = require('../config/database');
const cacheManager = require('../utils/cacheManager');
const { withDatabaseRetry, withCacheRetry } = require('../utils/retryHandler');

// 메인 초기화 데이터 수집 (재시도 메커니즘 적용)
const getBootstrapData = async (userId, userType) => {
  return await withDatabaseRetry(async () => {
    try {
      console.log(`🚀 초기화 데이터 수집 시작: ${userType}(${userId})`);
      
      // Promise.allSettled로 부분 실패 허용
      const [keywords, userEssentials, appConfig] = await Promise.allSettled([
        getAllKeywords(),
        getUserEssentials(userId, userType),
        getAppConfig()
      ]);

      const result = {};
      const errors = [];

      // 키워드 데이터 (필수)
      if (keywords.status === 'fulfilled') {
        result.keywords = keywords.value;
      } else {
        console.error('키워드 로딩 실패:', keywords.reason);
        errors.push({ operation: 'keywords', error: keywords.reason.message });
        
        // 폴백으로 캐시된 키워드 시도
        const fallbackKeywords = await withCacheRetry(() => 
          cacheManager.get('keywords:all', true)
        );
        if (fallbackKeywords) {
          result.keywords = fallbackKeywords;
          console.log('✅ 폴백 키워드 데이터 사용');
        } else {
          throw new Error('필수 키워드 데이터를 불러올 수 없습니다.');
        }
      }

      // 사용자 필수 데이터
      if (userEssentials.status === 'fulfilled') {
        result.userEssentials = userEssentials.value;
      } else {
        console.error('사용자 데이터 로딩 실패:', userEssentials.reason);
        errors.push({ operation: 'userEssentials', error: userEssentials.reason.message });
        
        // 부분적 폴백 데이터 시도
        const fallbackData = await getFallbackData(userId, userType);
        result.userEssentials = fallbackData.userEssentials || {};
      }

      // 앱 설정 (항상 기본값 제공)
      if (appConfig.status === 'fulfilled') {
        result.config = appConfig.value;
      } else {
        console.warn('앱 설정 로딩 실패, 기본값 사용:', appConfig.reason);
        result.config = getDefaultAppConfig();
      }

      console.log(`✅ 초기화 데이터 수집 완료 (에러: ${errors.length}개)`);
      
      return {
        ...result,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('초기화 데이터 수집 중대 오류:', error);
      throw new Error(`초기화 데이터를 수집할 수 없습니다: ${error.message}`);
    }
  });
};

// 키워드 마스터 데이터 (재시도 + 캐싱 적용)
const getAllKeywords = async () => {
  const cacheKey = 'keywords:all';
  
  return await withCacheRetry(async () => {
    try {
      // 캐시 확인
      const cached = await cacheManager.get(cacheKey);
      if (cached) {
        console.log('📦 키워드 캐시 히트');
        return cached;
      }

      console.log('🔍 키워드 DB에서 로딩...');
      
      // DB에서 조회 (재시도 적용)
      const { data: keywords, error } = await withDatabaseRetry(() => 
        supabase
          .from('keyword')
          .select('*')
          .order('category', { ascending: true })
          .order('keyword', { ascending: true })
      );

      if (error) throw error;
      if (!keywords || keywords.length === 0) {
        throw new Error('키워드 데이터가 비어있습니다.');
      }

      // 카테고리별로 그룹화
      const byCategory = keywords.reduce((acc, keyword) => {
        if (!acc[keyword.category]) {
          acc[keyword.category] = [];
        }
        acc[keyword.category].push(keyword);
        return acc;
      }, {});

      const result = {
        data: keywords,
        byCategory: byCategory,
        version: generateKeywordVersion(keywords),
        lastUpdated: new Date().toISOString(),
        count: keywords.length,
        categories: Object.keys(byCategory).length
      };

      // 캐시에 저장 (24시간, 재시도 적용)
      await withCacheRetry(() => 
        cacheManager.set(cacheKey, result, 24 * 60 * 60)
      );
      
      console.log(`✅ 키워드 로딩 완료: ${result.count}개 (${result.categories}개 카테고리)`);
      return result;
      
    } catch (error) {
      console.error('❌ 키워드 조회 실패:', error);
      
      // 만료된 캐시라도 있다면 사용
      const expiredCache = await cacheManager.get(cacheKey, true);
      if (expiredCache) {
        console.warn('⚠️ 만료된 키워드 캐시 사용');
        return {
          ...expiredCache,
          isExpired: true,
          fallbackUsed: true
        };
      }
      
      throw new Error(`키워드 데이터를 조회할 수 없습니다: ${error.message}`);
    }
  });
};

// 사용자별 필수 데이터
const getUserEssentials = async (userId, userType) => {
  try {
    if (userType === 'user') {
      return await getUserBootstrapData(userId);
    } else if (userType === 'company') {
      return await getCompanyBootstrapData(userId);
    } else {
      throw new Error('잘못된 사용자 타입입니다.');
    }
  } catch (error) {
    console.error('사용자 필수 데이터 수집 실패:', error);
    throw error;
  }
};

// 구직자 초기화 데이터
const getUserBootstrapData = async (userId) => {
  try {
    const [profile, keywords, recentApps, userInfo] = await Promise.allSettled([
      getUserProfile(userId),
      getUserKeywords(userId),
      getRecentApplications(userId, 5),
      getUserInfo(userId)
    ]);

    const result = {};
    
    // 프로필 (필수)
    if (profile.status === 'fulfilled') {
      result.profile = profile.value;
    } else {
      throw new Error('프로필 정보를 불러올 수 없습니다.');
    }

    // 사용자 키워드 (옵션)
    if (keywords.status === 'fulfilled') {
      result.selectedKeywords = keywords.value;
    } else {
      console.warn('사용자 키워드 로딩 실패:', keywords.reason);
      result.selectedKeywords = [];
    }

    // 최근 지원 현황 (옵션)
    if (recentApps.status === 'fulfilled') {
      result.recentActivity = {
        applicationCount: recentApps.value.length,
        applications: recentApps.value
      };
    } else {
      result.recentActivity = { applicationCount: 0, applications: [] };
    }

    // 사용자 정보 (옵션)
    if (userInfo.status === 'fulfilled') {
      result.userInfo = userInfo.value;
    }

    return result;
    
  } catch (error) {
    console.error('구직자 데이터 수집 실패:', error);
    throw error;
  }
};

// 회사 초기화 데이터
const getCompanyBootstrapData = async (companyId) => {
  try {
    const [profile, keywords, jobPostings] = await Promise.allSettled([
      getCompanyProfile(companyId),
      getCompanyKeywords(companyId),
      getActiveJobPostings(companyId, 10)
    ]);

    const result = {};
    
    // 회사 프로필 (필수)
    if (profile.status === 'fulfilled') {
      result.profile = profile.value;
    } else {
      throw new Error('회사 프로필 정보를 불러올 수 없습니다.');
    }

    // 회사 키워드 (옵션)
    if (keywords.status === 'fulfilled') {
      result.companyKeywords = keywords.value;
    } else {
      console.warn('회사 키워드 로딩 실패:', keywords.reason);
      result.companyKeywords = [];
    }

    // 활성 직무 공고 (옵션)
    if (jobPostings.status === 'fulfilled') {
      result.recentActivity = {
        activeJobPostings: jobPostings.value.length,
        jobPostings: jobPostings.value
      };
    } else {
      result.recentActivity = { activeJobPostings: 0, jobPostings: [] };
    }

    return result;
    
  } catch (error) {
    console.error('회사 데이터 수집 실패:', error);
    throw error;
  }
};

// 개별 데이터 조회 함수들 (재시도 적용)
const getUserProfile = async (userId) => {
  return await withDatabaseRetry(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        name,
        created_at,
        user_type,
        address,
        phone_number,
        onboarding_completed,
        job_seeking_active,
        push_token,
        push_token_updated_at,
        profile_image_url,
        user_info (*)
      `)
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error(`사용자 프로필을 찾을 수 없습니다: ${userId}`);
      }
      throw error;
    }
    return data;
  });
};

const getUserKeywords = async (userId) => {
  return await withDatabaseRetry(async () => {
    const { data, error } = await supabase
      .from('user_keyword')
      .select(`
        keyword_id,
        keyword:keyword_id (
          id,
          keyword,
          category
        )
      `)
      .eq('user_id', userId);

    if (error) throw error;
    return data || [];
  });
};

const getRecentApplications = async (userId, limit) => {
  const { data, error } = await supabase
    .from('applications')
    .select(`
      id,
      status,
      applied_at,
      job_posting:job_posting_id (
        id,
        title,
        company:company_id (
          id,
          name
        )
      )
    `)
    .eq('user_id', userId)
    .order('applied_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
};

const getUserInfo = async (userId) => {
  const { data, error } = await supabase
    .from('user_info')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // 데이터 없음 오류가 아닌 경우만
    throw error;
  }
  return data;
};

const getCompanyProfile = async (companyId) => {
  return await withDatabaseRetry(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, created_at, user_type, address, phone_number, onboarding_completed, job_seeking_active, push_token, push_token_updated_at, profile_image_url')
      .eq('id', companyId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error(`회사 프로필을 찾을 수 없습니다: ${companyId}`);
      }
      throw error;
    }
    return data;
  });
};

const getCompanyKeywords = async (companyId) => {
  const { data, error } = await supabase
    .from('company_keyword')
    .select(`
      keyword_id,
      keyword:keyword_id (
        id,
        keyword,
        category
      )
    `)
    .eq('company_id', companyId);

  if (error) throw error;
  return data || [];
};

const getActiveJobPostings = async (companyId, limit) => {
  const { data, error } = await supabase
    .from('job_postings')
    .select(`
      id,
      title,
      hiring_count,
      salary_range,
      created_at,
      is_active
    `)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
};

// 앱 설정 정보
const getAppConfig = async () => {
  try {
    // 향후 DB에서 동적 설정을 가져올 수 있도록 확장 가능
    return getDefaultAppConfig();
  } catch (error) {
    console.warn('앱 설정 로딩 실패, 기본값 사용:', error);
    return getDefaultAppConfig();
  }
};

// 기본 앱 설정
const getDefaultAppConfig = () => {
  return {
    features: {
      instantInterview: true,
      yatra: true,
      notifications: true,
      translation: true,
      offlineMode: false
    },
    notifications: {
      enabled: true,
      types: ['application', 'interview', 'message']
    },
    maintenance: {
      enabled: false,
      message: null
    },
    api: {
      version: process.env.API_VERSION || '1.0.0',
      timeout: 30000
    },
    cache: {
      enabled: true,
      ttl: {
        keywords: 24 * 60 * 60, // 24시간
        profile: 60 * 60, // 1시간
        applications: 10 * 60 // 10분
      }
    }
  };
};

// 폴백 데이터 (캐시된 데이터)
const getFallbackData = async (userId, userType) => {
  try {
    const fallback = {};
    
    // 캐시된 키워드 데이터
    const cachedKeywords = await cacheManager.get('keywords:all', true); // 만료된 캐시도 허용
    if (cachedKeywords) {
      fallback.keywords = cachedKeywords;
    }

    // 캐시된 프로필 데이터
    const profileCacheKey = `profile:${userType}:${userId}`;
    const cachedProfile = await cacheManager.get(profileCacheKey, true);
    if (cachedProfile) {
      fallback.userEssentials = { profile: cachedProfile };
    }

    return fallback;
    
  } catch (error) {
    console.error('폴백 데이터 조회 실패:', error);
    return null;
  }
};

// 유틸리티 함수들
const generateKeywordVersion = (keywords) => {
  // 키워드 데이터의 해시값으로 버전 생성
  const crypto = require('crypto');
  const hash = crypto
    .createHash('md5')
    .update(JSON.stringify(keywords.map(k => k.id + k.keyword)))
    .digest('hex');
  return `keywords-${hash.substring(0, 8)}`;
};

const getDataVersion = () => {
  return `app-data-v${process.env.APP_VERSION || '1.0.0'}-${Date.now()}`;
};

const checkHealth = async () => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {}
  };
  
  try {
    // DB 연결 확인 (재시도 적용)
    await withDatabaseRetry(async () => {
      const { error } = await supabase
        .from('keyword')
        .select('count(*)')
        .limit(1);
      
      if (error) throw error;
    });
    
    health.services.database = { status: 'connected', latency: null };
    
    // 캐시 상태 확인
    const cacheHealth = await cacheManager.healthCheck();
    health.services.cache = cacheHealth;
    
    // 전체 상태 결정
    const hasFailures = Object.values(health.services).some(
      service => service.status === false || service.redis === false
    );
    
    if (hasFailures) {
      health.status = 'degraded';
    }
    
    return health;
    
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
    health.services.database = { status: 'disconnected', error: error.message };
    
    throw new Error(`헬스체크 실패: ${error.message}`);
  }
};

module.exports = {
  getBootstrapData,
  getAllKeywords,
  getUserEssentials,
  getFallbackData,
  getDataVersion,
  getDefaultAppConfig,
  checkHealth
};