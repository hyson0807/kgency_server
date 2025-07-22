const express = require('express');
const router = express.Router();

// 라우트 파일들 가져오기
const authRoutes = require('./auth.routes');
const aiRoutes = require('./ai.routes');
const translateRoutes = require('./translate.routes');
const interviewSlotRoutes = require('./interviewSlot.routes');
const interviewRoutes = require('./interview.routes');
const interviewScheduleRoutes = require('./interviewSchedule.routes');
const applicationRoutes = require('./application.routes');
const userKeywordRoutes = require('./userKeyword.routes');
const jobPostingRoutes = require('./jobPostingRoutes');
const profileRoutes = require('./profile.routes');
const healthController = require('../controllers/health.controller');


// 디버깅용 미들웨어
router.use((req, res, next) => {
    console.log('api hit:', req.method, req.path);
    next();
});

// 헬스 체크 (메인 라우터에 직접 연결)123
router.get('/health', healthController.healthCheck);


// 각 도메인별 라우트 연결
router.use('/auth', authRoutes);
router.use('/ai', aiRoutes);
router.use('/translate', translateRoutes);

router.use('/user-keyword', userKeywordRoutes);

router.use('/job-postings', jobPostingRoutes);

router.use('/applications', applicationRoutes);

router.use('/profiles', profileRoutes);

router.use('/company/interview-slots', interviewSlotRoutes);
router.use('/interview-proposals', interviewRoutes);
router.use('/interview-schedules', interviewScheduleRoutes);

// 404 처리
router.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'API 엔드포인트를 찾을 수 없습니다.'
    });
});

module.exports = router;