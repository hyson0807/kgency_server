// routes/interviewSchedule.routes.js
const router = require('express').Router();
const interviewScheduleController = require('../controllers/interviewSchedule.controller');
const { optionalAuth } = require('../middlewares/auth');

// 사용자가 면접 일정 선택
router.post('/user', optionalAuth, interviewScheduleController.createUserSchedule);

router.get('/by-proposal/:proposalId', optionalAuth, interviewScheduleController.getScheduleByProposal);

module.exports = router;