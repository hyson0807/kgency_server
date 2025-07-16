const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const { authMiddleware } = require('../middlewares/auth');

// 이력서 생성 (인증 필요)
router.post('/generate-resume', authMiddleware, aiController.generateResumeForPosting);

module.exports = router;