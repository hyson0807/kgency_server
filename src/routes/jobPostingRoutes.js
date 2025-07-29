const express = require('express');
const router = express.Router();
const jobPostingController = require('../controllers/jobPosting.controller');
const { authMiddleware } = require('../middlewares/auth');

// 매칭된 공고 조회 (사용자 키워드 기반 적합도 계산) - 성능 최적화
router.get('/matched', authMiddleware, jobPostingController.getMatchedPostings);

// 회사의 공고 목록 조회 (with application status) - 이 라우트를 /:id 보다 먼저 배치
router.get('/company/with-status', authMiddleware, jobPostingController.getCompanyJobPostingsWithStatus);

// 회사의 모든 공고 목록 조회 (삭제된 것 제외)
router.get('/company', authMiddleware, jobPostingController.getCompanyJobPostings);

// 활성화된 모든 공고 조회
router.get('/', jobPostingController.getActiveJobPostings);

router.get('/:id', jobPostingController.getJobPostingById);

// 새 공고 생성
router.post('/', authMiddleware, jobPostingController.createJobPosting);

// 기존 공고 수정
router.put('/:id', authMiddleware, jobPostingController.updateJobPosting);

// 공고 활성/비활성 토글
router.patch('/:id/toggle-active', authMiddleware, jobPostingController.toggleJobPostingActive);

// 공고 삭제 (soft delete)
router.delete('/:id', authMiddleware, jobPostingController.deleteJobPosting);

module.exports = router;