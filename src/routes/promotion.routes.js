const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const promotionController = require('../controllers/promotion.controller');

/**
 * POST /api/promotion/redeem
 * 프로모션 코드 사용 (토큰 지급)
 * 인증 필요
 */
router.post('/redeem', authMiddleware, promotionController.redeemCode);

module.exports = router;
