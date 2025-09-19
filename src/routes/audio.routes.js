const express = require('express');
const router = express.Router();
const audioController = require('../controllers/audio.controller');
const { authMiddleware } = require('../middlewares/auth');

// 모든 오디오 관련 라우트는 인증 필요
router.use(authMiddleware);

// Presigned URL 생성 (클라이언트 직접 업로드용)
router.post('/upload-url', audioController.getUploadUrl);

// 오디오 업로드 (서버 경유)
router.post('/upload', audioController.uploadAudio);

// 오디오 정보 저장 (클라이언트가 직접 업로드 후)
router.post('/save', audioController.saveAudioInfo);

// 사용자 오디오 목록 조회
router.get('/user', audioController.getUserAudios);

// 오디오 삭제 (soft delete)
router.delete('/:id', audioController.deleteAudio);

// 오디오 영구 삭제 (hard delete) - 관리자용
router.delete('/:id/permanent', audioController.permanentDeleteAudio);

// 오디오 조회 (Presigned URL 포함)
router.get('/:id', audioController.getAudioUrl);

module.exports = router;