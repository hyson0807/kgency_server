const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const { authMiddleware } = require('../middlewares/auth');

// GET /api/job-seekers/matched - 매칭된 구직자 목록 (job_seeking_active = true)
router.get('/matched', authMiddleware, profileController.getMatchedJobSeekers);

module.exports = router;