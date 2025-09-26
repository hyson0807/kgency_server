const express = require('express');
const router = express.Router();
const audioController = require('../controllers/audio.controller');
const { authMiddleware } = require('../middlewares/auth');

// 모든 오디오 관련 라우트는 인증 필요
router.use(authMiddleware);

// 한국어 테스트 관련 라우트
router.post('/korean-test/upload', audioController.uploadKoreanTest);
router.post('/korean-test/batch-upload', audioController.uploadKoreanTestBatch);
router.get('/korean-test/status', audioController.getKoreanTestStatus);
router.get('/korean-test/questions/:userId', audioController.getKoreanTestByQuestions); // 채팅에서 사용

router.get('/korean-test/audio-info/:testId', audioController.getAudioInfo); // 오디오 정보 조회 (유지)

module.exports = router;