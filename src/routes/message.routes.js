const express = require('express');
const messageController = require('../controllers/message.controller');
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router();

// POST /api/messages - Create a new message (requires auth)
router.post('/', authMiddleware, messageController.createMessage);

// PUT /api/messages/:id/read - Mark message as read (requires auth)
router.put('/:id/read', authMiddleware, messageController.markAsRead);

module.exports = router;