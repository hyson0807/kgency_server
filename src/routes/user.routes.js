const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authMiddleware } = require('../middlewares/auth');

// 유저 상세 정보 조회 (인증 필요)
router.get('/:userId/details', authMiddleware, userController.getUserDetails);

module.exports = router;