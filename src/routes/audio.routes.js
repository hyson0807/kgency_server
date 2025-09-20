const express = require('express');
const router = express.Router();
const audioController = require('../controllers/audio.controller');
const { authMiddleware } = require('../middlewares/auth');

// 모든 오디오 관련 라우트는 인증 필요
router.use(authMiddleware);

// 한국어 테스트 관련 라우트
router.post('/korean-test/upload', audioController.uploadKoreanTest);
router.post('/korean-test/batch-upload', audioController.uploadKoreanTestBatch); // 새로운 배치 업로드
router.get('/korean-test/status', audioController.getKoreanTestStatus);
router.get('/korean-test/list', audioController.getKoreanTests);
router.get('/korean-test/latest', audioController.getLatestKoreanTest);
router.get('/korean-test/questions/:userId', audioController.getKoreanTestByQuestions);

module.exports = router;