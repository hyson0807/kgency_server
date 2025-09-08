const express = require('express');
const router = express.Router();
const authRoutes = require('./auth.routes');
const aiRoutes = require('./ai.routes');
const translateRoutes = require('./translate.routes');
const applicationRoutes = require('./application.routes');
const userKeywordRoutes = require('./userKeyword.routes');
const companyKeywordRoutes = require('./companyKeyword.routes');
const jobPostingRoutes = require('./jobPostingRoutes');
const jobPostingKeywordRoutes = require('./jobPostingKeyword.routes');
const profileRoutes = require('./profile.routes');
const messageRoutes = require('./message.routes');
const resumeRoutes = require('./resume.routes');
const userRoutes = require('./user.routes');
const jobSeekerRoutes = require('./jobSeeker.routes');
const purchaseRoutes = require('./purchase.routes');
const appInitRoutes = require('./appInit.routes');
const chatRoutes = require('./chat.routes');
const healthController = require('../controllers/health.controller');

// 헬스 체크
router.get('/health', healthController.healthCheck);

router.use('/auth', authRoutes);

router.use('/translate', translateRoutes);

router.use('/user-keyword', userKeywordRoutes);
router.use('/company-keyword', companyKeywordRoutes);

router.use('/job-postings', jobPostingRoutes);
router.use('/job-posting-keyword', jobPostingKeywordRoutes);

router.use('/applications', applicationRoutes);

router.use('/profiles', profileRoutes);

router.use('/users', userRoutes);



// 이력서 전송, 저장
router.use('/resume', resumeRoutes);

router.use('/job-seekers', jobSeekerRoutes);

router.use('/purchase', purchaseRoutes);

// 앱 초기화 라우트 추가
router.use('/app-init', appInitRoutes);

// 채팅 라우트 추가
router.use('/chat', chatRoutes);

// 404 처리
router.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'API 엔드포인트를 찾을 수 없습니다.'
    });
});

module.exports = router;