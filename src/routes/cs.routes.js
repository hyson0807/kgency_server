const express = require('express');
const router = express.Router();
const csController = require('../controllers/cs.controller');
const { authMiddleware } = require('../middlewares/auth');

// CS 채팅방 생성/조회 (인증 필요)
router.post('/chat-room', authMiddleware, csController.getOrCreateCSChatRoom);

module.exports = router;