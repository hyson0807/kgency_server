// src/middlewares/cacheInvalidation.js
// 캐시 무효화 미들웨어

const cacheManager = require('../utils/cacheManager');

// 캐시 무효화 패턴 매핑
const CACHE_INVALIDATION_PATTERNS = {
  // 사용자 프로필 변경 시
  user_profile: (userId) => [
    `cache:profile:user:${userId}`,
    `cache:essentials:user:${userId}`,
    `cache:bootstrap:user:${userId}`,
    'cache:keywords:all' // 키워드 관련 캐시도 무효화
  ],
  
  // 회사 프로필 변경 시
  company_profile: (companyId) => [
    `cache:profile:company:${companyId}`,
    `cache:essentials:company:${companyId}`,
    `cache:bootstrap:company:${companyId}`,
    'cache:keywords:all'
  ],
  
  // 키워드 변경 시
  keywords: () => [
    'cache:keywords:*',
    'cache:essentials:*',
    'cache:bootstrap:*'
  ],
  
  // 직무 공고 변경 시
  job_posting: (companyId) => [
    `cache:jobpostings:company:${companyId}`,
    `cache:essentials:company:${companyId}`,
    `cache:bootstrap:company:${companyId}`
  ],
  
  // 지원서 변경 시
  application: (userId, companyId) => [
    `cache:applications:user:${userId}`,
    `cache:applications:company:${companyId}`,
    `cache:essentials:user:${userId}`,
    `cache:essentials:company:${companyId}`
  ],
  
  // 면접 일정 변경 시
  interview: (userId, companyId) => [
    `cache:interviews:user:${userId}`,
    `cache:interviews:company:${companyId}`,
    `cache:essentials:user:${userId}`,
    `cache:essentials:company:${companyId}`
  ]
};

// 캐시 무효화 미들웨어
const createCacheInvalidationMiddleware = (invalidationType) => {
  return async (req, res, next) => {
    // 응답 후에 캐시 무효화 실행
    const originalSend = res.send;
    
    res.send = function(data) {
      // 원본 응답 전송
      originalSend.call(this, data);
      
      // 성공적인 응답(2xx)인 경우에만 캐시 무효화
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // 비동기로 캐시 무효화 실행 (응답 속도에 영향 주지 않기 위해)
        setImmediate(async () => {
          try {
            await invalidateCache(invalidationType, req);
          } catch (error) {
            console.error('캐시 무효화 실패:', error.message);
          }
        });
      }
    };
    
    next();
  };
};

// 캐시 무효화 실행 함수
const invalidateCache = async (invalidationType, req) => {
  try {
    const { userId, userType } = req.user || {};
    const { companyId, jobPostingId } = req.params || {};
    const { id } = req.params || {};
    
    let keysToInvalidate = [];
    
    switch (invalidationType) {
      case 'user_profile':
        keysToInvalidate = CACHE_INVALIDATION_PATTERNS.user_profile(userId || id);
        break;
        
      case 'company_profile':
        keysToInvalidate = CACHE_INVALIDATION_PATTERNS.company_profile(userId || companyId || id);
        break;
        
      case 'keywords':
        keysToInvalidate = CACHE_INVALIDATION_PATTERNS.keywords();
        break;
        
      case 'job_posting':
        keysToInvalidate = CACHE_INVALIDATION_PATTERNS.job_posting(userId || companyId);
        break;
        
      case 'application':
        const targetCompanyId = companyId || req.body?.companyId;
        keysToInvalidate = CACHE_INVALIDATION_PATTERNS.application(userId, targetCompanyId);
        break;
        
      case 'interview':
        const interviewCompanyId = companyId || req.body?.companyId;
        keysToInvalidate = CACHE_INVALIDATION_PATTERNS.interview(userId, interviewCompanyId);
        break;
        
      default:
        console.warn('알 수 없는 캐시 무효화 타입:', invalidationType);
        return;
    }
    
    // 캐시 무효화 실행
    for (const key of keysToInvalidate) {
      if (key.includes('*')) {
        await cacheManager.invalidatePattern(key);
      } else {
        await cacheManager.remove(key);
      }
    }
    
    console.log(`✅ 캐시 무효화 완료: ${invalidationType} (${keysToInvalidate.length}개 키)`);
    
  } catch (error) {
    console.error('캐시 무효화 중 오류:', error);
  }
};

// 수동 캐시 무효화 함수 (서비스에서 직접 호출 가능)
const manualInvalidateCache = async (invalidationType, params = {}) => {
  const mockReq = { user: params.user, params: params.params, body: params.body };
  await invalidateCache(invalidationType, mockReq);
};

// 전체 캐시 무효화 (관리 목적)
const invalidateAllCache = async () => {
  try {
    await cacheManager.clear('*');
    console.log('✅ 전체 캐시 무효화 완료');
  } catch (error) {
    console.error('전체 캐시 무효화 실패:', error);
  }
};

module.exports = {
  createCacheInvalidationMiddleware,
  manualInvalidateCache,
  invalidateAllCache,
  CACHE_INVALIDATION_PATTERNS
};