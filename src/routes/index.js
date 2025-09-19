const express = require('express');
const router = express.Router();
const authRoutes = require('./auth.routes');
const translateRoutes = require('./translate.routes');
const applicationRoutes = require('./application.routes');
const userKeywordRoutes = require('./userKeyword.routes');
const companyKeywordRoutes = require('./companyKeyword.routes');
const jobPostingRoutes = require('./jobPostingRoutes');
const jobPostingKeywordRoutes = require('./jobPostingKeyword.routes');
const profileRoutes = require('./profile.routes');
const resumeRoutes = require('./resume.routes');
const userRoutes = require('./user.routes');
const jobSeekerRoutes = require('./jobSeeker.routes');
const purchaseRoutes = require('./purchase.routes');
const appInitRoutes = require('./appInit.routes');
const chatRoutes = require('./chat.routes');
const audioRoutes = require('./audio.routes');
const healthController = require('../controllers/health.controller');

// 헬스 체크
router.get('/health', healthController.healthCheck);

// 로그인
router.use('/auth', authRoutes);

// 번역
router.use('/translate', translateRoutes);

//키워드
router.use('/user-keyword', userKeywordRoutes);
router.use('/company-keyword', companyKeywordRoutes);
router.use('/job-posting-keyword', jobPostingKeywordRoutes);

//공고
router.use('/job-postings', jobPostingRoutes);

//지원
router.use('/applications', applicationRoutes);
// 이력서 전송, 저장
router.use('/resume', resumeRoutes);

// 프로필 관련
router.use('/profiles', profileRoutes);

// 유저 정보
router.use('/users', userRoutes);

// 구직자 목록 조회
router.use('/job-seekers', jobSeekerRoutes);

// 인앱결제
router.use('/purchase', purchaseRoutes);

// 앱 초기화 라우트 추가
router.use('/app-init', appInitRoutes);

// 채팅 라우트 추가
router.use('/chat', chatRoutes);

// 오디오 라우트 추가
router.use('/audios', audioRoutes);

// 404 처리
router.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'API 엔드포인트를 찾을 수 없습니다.'
    });
});

module.exports = router;