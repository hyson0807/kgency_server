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

// DEPRECATED: AI 음성 관련 라우트 (더이상 사용안함 - 2024.12)
// router.post('/korean-test/ai-voice/upload', audioController.uploadAIAudio); // AI 음성 업로드 - REMOVED
// router.post('/korean-test/merge-audio', audioController.mergeAudioFiles); // 개별 오디오 합성 - REMOVED
// router.post('/korean-test/merge-audio-batch', audioController.mergeAudioFilesBatch); // 배치 오디오 합성 - REMOVED
router.get('/korean-test/audio-info/:testId', audioController.getAudioInfo); // 오디오 정보 조회 (유지)

module.exports = router;