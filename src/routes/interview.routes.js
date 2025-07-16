// routes/interview.routes.js
const router = require('express').Router();
const interviewProposalController = require('../controllers/interviewProposal.controller');
const {optionalAuth} = require("../middlewares/auth");

// 디버깅용 미들웨어
router.use((req, res, next) => {
    console.log('Interview route hit123:', req.method, req.path);
    next();
});

// 회사용 라우트
router.post('/company', optionalAuth, interviewProposalController.createProposal);

// 지원자용 라우트
router.get('/user/:applicationId', interviewProposalController.getProposalByApplication);

module.exports = router;