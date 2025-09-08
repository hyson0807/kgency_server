const express = require('express');
const resumeController = require('../controllers/resume.controller');
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router();

// POST /api/resume/generate - AI 이력서 생성 (requires auth)
router.post('/generate', authMiddleware, resumeController.generateResume);

// POST /api/resume/save - 이력서 저장 (requires auth)
router.post('/save', authMiddleware, resumeController.saveResume);

module.exports = router;