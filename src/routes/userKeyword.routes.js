const express = require('express');
const userKeywordController = require('../controllers/userKeyword.controller');
const { authMiddleware } = require('../middlewares/auth');
const router = express.Router();



// GET /api/user-keyword/keywords - Get all keywords (no auth required)
router.get('/keywords', userKeywordController.getKeywords);

// Apply authentication to user-specific routes
router.use(authMiddleware);

// GET /api/user-keyword - Get user's keywords
router.get('/', userKeywordController.getUserKeywords);

// PUT /api/user-keyword - Update user's keywords
router.put('/', userKeywordController.updateUserKeywords);

module.exports = router;
