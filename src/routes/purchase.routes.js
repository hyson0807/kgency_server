const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchase.controller');
const { authMiddleware } = require('../middlewares/auth');
const { apiLimiter } = require('../middlewares/rateLimiter');

// 모든 구매 관련 엔드포인트는 인증 필요
router.use(authMiddleware);

// 구매 검증 (레이트 리미팅 적용)
router.post('/verify', apiLimiter, purchaseController.verifyPurchase);

// 야트라 패키지 구매 검증
router.post('/yatra/verify', apiLimiter, purchaseController.verifyYatraPurchase);

// 토큰 잔액 조회
router.get('/tokens/balance', purchaseController.getTokenBalance);

// 구매 내역 조회
router.get('/history', purchaseController.getPurchaseHistory);

// 토큰 거래 내역 조회
router.get('/tokens/transactions', purchaseController.getTokenTransactions);

// 즉시면접용 토큰 사용
router.post('/tokens/spend-instant-interview', purchaseController.spendTokensForInstantInterview);

module.exports = router;