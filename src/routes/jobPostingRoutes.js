const express = require('express');
const router = express.Router();
const jobPostingController = require('../controllers/jobPosting.controller');

// 활성화된 모든 공고 조회
router.get('/', jobPostingController.getActiveJobPostings);

router.get('/:id', jobPostingController.getJobPostingById);



module.exports = router;