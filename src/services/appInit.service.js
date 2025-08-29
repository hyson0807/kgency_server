// src/services/appInit.service.js
const { supabase } = require('../config/database');
const cacheManager = require('../utils/cacheManager');

// 메인 초기화 데이터 수집
const getBootstrapData = async (userId, userType) => {
  try {
    // 병렬로 필수 데이터 수집
    const [keywords, userEssentials, appConfig] = await Promise.all([
      getAllKeywords(),
      getUserEssentials(userId, userType),
      getAppConfig()
    ]);

    return {
      keywords: keywords,
      userEssentials: userEssentials,
      config: appConfig
    };
    
  } catch (error) {
    console.error('초기화 데이터 수집 실패:', error);
    throw new Error('초기화 데이터를 수집할 수 없습니다.');
  }
};

// 키워드 마스터 데이터 (캐싱 적용)
const getAllKeywords = async () => {
  const cacheKey = 'keywords:all';
  
  try {
    // 캐시 확인
    const cached = await cacheManager.get(cacheKey);
    if (cached) {
      console.log('키워드 캐시 히트');
      return cached;
    }

    console.log('키워드 DB에서 로딩');
    
    // DB에서 조회
    const { data: keywords, error } = await supabase
      .from('keyword')
      .select('*')
      .order('category', { ascending: true })
      .order('keyword', { ascending: true });

    if (error) throw error;

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
      lastUpdated: new Date().toISOString()
    };

    // 캐시에 저장 (24시간)
    await cacheManager.set(cacheKey, result, 24 * 60 * 60);
    
    return result;
    
  } catch (error) {
    console.error('키워드 조회 실패:', error);
    throw new Error('키워드 데이터를 조회할 수 없습니다.');
  }
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

// 개별 데이터 조회 함수들
const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      user_info (*)
    `)
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
};

const getUserKeywords = async (userId) => {
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
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', companyId)
    .single();

  if (error) throw error;
  return data;
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
  return {
    features: {
      instantInterview: true,
      yatra: true,
      notifications: true,
      translation: true
    },
    notifications: {
      enabled: true,
      types: ['application', 'interview', 'message']
    },
    maintenance: {
      enabled: false,
      message: null
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
  try {
    // DB 연결 확인
    const { error } = await supabase
      .from('keyword')
      .select('count(*)')
      .limit(1);
    
    if (error) throw error;

    return {
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error('데이터베이스 연결 실패');
  }
};

module.exports = {
  getBootstrapData,
  getAllKeywords,
  getUserEssentials,
  getFallbackData,
  getDataVersion,
  checkHealth
};