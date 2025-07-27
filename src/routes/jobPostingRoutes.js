const express = require('express');
const router = express.Router();
const jobPostingController = require('../controllers/jobPosting.controller');
const { authMiddleware } = require('../middlewares/auth');

// 활성화된 모든 공고 조회
router.get('/', jobPostingController.getActiveJobPostings);

// 회사의 공고 목록 조회 (with application status) - 이 라우트를 /:id 보다 먼저 배치
router.get('/company/with-status', authMiddleware, jobPostingController.getCompanyJobPostingsWithStatus);

router.get('/:id', jobPostingController.getJobPostingById);

// 새 공고 생성
router.post('/', authMiddleware, jobPostingController.createJobPosting);

// 기존 공고 수정
router.put('/:id', authMiddleware, jobPostingController.updateJobPosting);

module.exports = router;