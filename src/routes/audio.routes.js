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
// router.get('/korean-test/list', audioController.getKoreanTests); // 미사용 - 주석 처리
// router.get('/korean-test/latest', audioController.getLatestKoreanTest); // 미사용 - 주석 처리
router.get('/korean-test/questions/:userId', audioController.getKoreanTestByQuestions); // 채팅에서 사용

module.exports = router;