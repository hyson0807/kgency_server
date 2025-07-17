// routes/interviewSchedule.routes.js
const router = require('express').Router();
const interviewScheduleController = require('../controllers/interviewSchedule.controller');
const { optionalAuth } = require('../middlewares/auth');

// 사용자가 면접 일정 선택
router.post('/user', optionalAuth, interviewScheduleController.createUserSchedule);
router.get('/by-proposal/:proposalId', optionalAuth, interviewScheduleController.getScheduleByProposal);

// 회사용 라우트 추가
router.get('/company', optionalAuth, interviewScheduleController.getCompanySchedules);
router.get('/company/by-date', optionalAuth, interviewScheduleController.getCompanySchedulesByDate);
router.put('/company/:scheduleId/cancel', optionalAuth, interviewScheduleController.cancelSchedule);

router.get('/user/calendar', optionalAuth, interviewScheduleController.getUserSchedules);
router.get('/user/calendar/by-date', optionalAuth, interviewScheduleController.getUserSchedulesByDate);


module.exports = router;