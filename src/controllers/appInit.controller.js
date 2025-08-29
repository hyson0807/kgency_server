// src/controllers/appInit.controller.js
const appInitService = require('../services/appInit.service');

// 통합 초기화 데이터 제공
const getBootstrapData = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { userId, userType } = req.user;
    
    console.log(`[${userId}] 초기화 데이터 요청 시작 (${userType})`);
    
    // 메인 데이터 수집
    const bootstrapData = await appInitService.getBootstrapData(userId, userType);
    
    const responseTime = Date.now() - startTime;
    console.log(`[${userId}] 초기화 완료: ${responseTime}ms`);
    
    res.json({
      success: true,
      data: bootstrapData,
      meta: {
        version: appInitService.getDataVersion(),
        cachedAt: new Date().toISOString(),
        responseTime: responseTime,
        ttl: 3600 // 1시간
      }
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('초기화 데이터 제공 실패:', error);
    
    // 부분 실패의 경우 사용 가능한 데이터라도 반환
    const fallbackData = await appInitService.getFallbackData(req.user?.userId, req.user?.userType);
    
    if (fallbackData && Object.keys(fallbackData).length > 0) {
      return res.json({
        success: false,
        data: fallbackData,
        errors: [{
          operation: 'getBootstrapData',
          message: '일부 데이터를 불러올 수 없어 캐시된 데이터를 사용합니다.',
          code: 'PARTIAL_FAILURE'
        }],
        meta: {
          version: appInitService.getDataVersion(),
          responseTime: responseTime,
          isFallback: true
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: '초기화 데이터를 불러오는데 실패했습니다.',
      meta: {
        responseTime: responseTime
      },
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 키워드 마스터 데이터
const getKeywords = async (req, res) => {
  try {
    const keywords = await appInitService.getAllKeywords();
    
    res.json({
      success: true,
      data: keywords.data || keywords
    });
    
  } catch (error) {
    console.error('키워드 데이터 제공 실패:', error);
    res.status(500).json({
      success: false,
      error: '키워드 데이터를 불러올 수 없습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 사용자별 필수 데이터
const getUserEssentials = async (req, res) => {
  try {
    const { userId, userType } = req.user;
    const essentials = await appInitService.getUserEssentials(userId, userType);
    
    res.json({
      success: true,
      data: essentials
    });
    
  } catch (error) {
    console.error('사용자 필수 데이터 제공 실패:', error);
    res.status(500).json({
      success: false,
      error: '사용자 데이터를 불러올 수 없습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 데이터 버전 체크
const getDataVersion = async (req, res) => {
  try {
    const version = appInitService.getDataVersion();
    res.json({
      success: true,
      data: {
        version: version,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '버전 정보를 불러올 수 없습니다.'
    });
  }
};

// 헬스 체크
const healthCheck = async (req, res) => {
  try {
    const health = await appInitService.checkHealth();
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: '서비스가 일시적으로 이용할 수 없습니다.'
    });
  }
};

module.exports = {
  getBootstrapData,
  getKeywords,
  getUserEssentials,
  getDataVersion,
  healthCheck
};