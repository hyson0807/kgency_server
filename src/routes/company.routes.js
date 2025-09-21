const express = require('express');
const router = express.Router();
const companyController = require('../controllers/company.controller');
const { authMiddleware } = require('../middlewares/auth');

// 모든 회사 라우트는 인증 필요
router.use(authMiddleware);

// 토큰 관련 라우트
router.get('/tokens', companyController.getTokenInfo);
router.post('/tokens/spend', companyController.spendTokens);
router.post('/tokens/purchase', companyController.purchaseTokens);
router.get('/tokens/transactions', companyController.getTokenTransactions);

// 지원자 관련 라우트
router.get('/applicants', companyController.getApplicants);
router.get('/applicants/:applicationId/profile', companyController.getApplicantProfile);
router.get('/chat/:roomId/application', companyController.getApplicationByRoom);

// 온보딩 관련 라우트
router.post('/onboarding-complete', companyController.completeCompanyOnboarding);

module.exports = router;