const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authMiddleware } = require('../middlewares/auth');
const { loginLimiter, smsLimiter } = require('../middlewares/rateLimiter');

// OTP 발송 (SMS 제한 적용)
router.post('/send-otp', smsLimiter, authController.sendOTP);

// OTP 검증 및 로그인/회원가입 (로그인 제한 적용)
router.post('/verify-otp', loginLimiter, authController.verifyOTP);

// 회원 탈퇴 (인증 필요)
router.delete('/delete-account', authMiddleware, authController.deleteAccount);

module.exports = router;