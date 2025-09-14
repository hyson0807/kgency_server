const express = require('express');
const router = express.Router();
const videoController = require('../controllers/video.controller');
const { authMiddleware } = require('../middlewares/auth');

// 모든 비디오 관련 라우트는 인증 필요
router.use(authMiddleware);

// Presigned URL 생성 (클라이언트 직접 업로드용)
router.post('/upload-url', videoController.getUploadUrl);

// 비디오 업로드 (서버 경유)
router.post('/upload', videoController.uploadVideo);

// 비디오 정보 저장 (클라이언트가 직접 업로드 후)
router.post('/save', videoController.saveVideoInfo);

// 사용자 비디오 목록 조회
router.get('/user', videoController.getUserVideos);

// 비디오 삭제 (soft delete)
router.delete('/:id', videoController.deleteVideo);

// 비디오 영구 삭제 (hard delete) - 관리자용
router.delete('/:id/permanent', videoController.permanentDeleteVideo);

// 비디오 조회 (Presigned URL 포함)
router.get('/:id', videoController.getVideoUrl);

module.exports = router;