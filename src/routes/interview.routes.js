// routes/interview.routes.js
const router = require('express').Router();
const interviewProposalController = require('../controllers/interviewProposal.controller');
const {optionalAuth} = require("../middlewares/auth");



// 회사용 라우트
router.post('/company', optionalAuth, interviewProposalController.createProposal);

router.delete('/company/:applicationId', interviewProposalController.deleteProposal);

// 지원자용 라우트
router.get('/user/:applicationId', interviewProposalController.getProposalByApplication);

// Bulk check route for multiple applications - 성능 최적화용
router.post('/bulk-check', interviewProposalController.bulkCheckProposals);

module.exports = router;