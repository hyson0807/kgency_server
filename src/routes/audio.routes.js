const express = require('express');
const router = express.Router();
const audioController = require('../controllers/audio.controller');
const { authMiddleware } = require('../middlewares/auth');

// 질문 오디오 관련 라우트 (인증 불필요 - 공개 리소스)
router.get('/question/:questionNumber', audioController.getQuestionAudio); // S3 질문 오디오 URL 제공

// 관리용 질문 오디오 업로드 라우트 (인증 불필요 - 개발/관리 목적)
router.post('/question/upload', audioController.uploadQuestionAudio); // S3 질문 오디오 파일 업로드

// 인증이 필요한 라우트들
router.use(authMiddleware);

// 한국어 테스트 관련 라우트
router.post('/korean-test/upload', audioController.uploadKoreanTest);
router.post('/korean-test/batch-upload', audioController.uploadKoreanTestBatch);
router.get('/korean-test/status', audioController.getKoreanTestStatus);
router.get('/korean-test/questions/:userId', audioController.getKoreanTestByQuestions); // 채팅에서 사용

router.get('/korean-test/audio-info/:testId', audioController.getAudioInfo); // 오디오 정보 조회 (유지)

module.exports = router;