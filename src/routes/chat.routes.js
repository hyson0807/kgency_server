const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const chatController = require('../controllers/chat.controller');

// 라우트 정의
router.post('/create-room', authMiddleware, chatController.createChatRoom);
router.get('/find-existing-room', authMiddleware, chatController.findExistingRoom);
router.get('/user/rooms', authMiddleware, chatController.getUserChatRooms);
router.get('/company/rooms', authMiddleware, chatController.getCompanyChatRooms);
router.get('/room/:roomId', authMiddleware, chatController.getChatRoomInfo);
router.get('/room/:roomId/messages', authMiddleware, chatController.getChatMessages);
router.post('/room/:roomId/message', authMiddleware, chatController.sendMessage);
router.patch('/room/:roomId/read', authMiddleware, chatController.markMessagesAsRead);
router.get('/unread-count', authMiddleware, chatController.getTotalUnreadCount);

module.exports = router;