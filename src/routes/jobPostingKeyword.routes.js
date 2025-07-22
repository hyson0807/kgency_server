const express = require('express');
const router = express.Router();
const jobPostingKeywordController = require('../controllers/jobPostingKeyword.controller');
const { authMiddleware } = require('../middlewares/auth');

// GET /api/job-posting-keyword/:jobPostingId - Get keywords for a specific job posting
router.get('/:jobPostingId', jobPostingKeywordController.getJobPostingKeywords);

// POST /api/job-posting-keyword/:jobPostingId - Update keywords for a specific job posting
router.post('/:jobPostingId', authMiddleware, jobPostingKeywordController.updateJobPostingKeywords);

// DELETE /api/job-posting-keyword/:jobPostingId - Delete all keywords for a specific job posting
router.delete('/:jobPostingId', authMiddleware, jobPostingKeywordController.deleteJobPostingKeywords);

module.exports = router;