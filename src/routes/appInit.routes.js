// src/routes/appInit.routes.js
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const appInitService = require('../services/appInit.service');

// 헬스 체크
router.get('/health', async (req, res) => {
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
});

// 키워드 전용 엔드포인트 (인증 불필요)
router.get('/keywords', async (req, res) => {
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
});

// 사용자별 필수 데이터 (인증 필요)
router.get('/user-essentials', authMiddleware, async (req, res) => {
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
});

// 통합 초기화 엔드포인트 (인증 필요)
router.get('/bootstrap', authMiddleware, async (req, res) => {
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
});

module.exports = router;