const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const {authMiddleware} = require("../middlewares/auth");



// GET /api/profiles - Get user profile
router.get('/', authMiddleware, profileController.getProfile);

// PUT /api/profiles - Update user profile
router.put('/', authMiddleware, profileController.updateProfile);

// POST /api/profiles/refresh - Refresh profile data
router.post('/refresh', authMiddleware, profileController.refreshProfile);

// GET /api/profiles/job-seekers - Get job seekers list (for companies)
router.get('/job-seekers', authMiddleware, profileController.getJobSeekers);

// GET /api/profiles/user/:userId - Get specific user profile (for companies)
router.get('/user/:userId', authMiddleware, profileController.getUserProfile);

module.exports = router;