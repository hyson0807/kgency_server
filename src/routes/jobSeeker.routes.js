const express = require('express');
const router = express.Router();
const jobSeekerController = require('../controllers/jobSeeker.controller');
const { authMiddleware } = require('../middlewares/auth');

// 회사를 위한 매칭된 구직자 목록 조회
router.get(
    '/matched',
    authMiddleware,
    jobSeekerController.getMatchedJobSeekers
);

module.exports = router;