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

// PUT /api/profiles/push-token - Update push token
router.put('/push-token', authMiddleware, profileController.updatePushToken);

// DELETE /api/profiles/push-token - Remove push token
router.delete('/push-token', authMiddleware, profileController.removePushToken);

// POST /api/profiles/image - Upload profile image
router.post('/image', authMiddleware, profileController.uploadProfileImage);

// PUT /api/profiles/image - Update profile image
router.put('/image', authMiddleware, profileController.updateProfileImage);

// DELETE /api/profiles/image - Delete profile image
router.delete('/image', authMiddleware, profileController.deleteProfileImage);

// POST /api/profiles/onboarding-complete - Complete onboarding
router.post('/onboarding-complete', authMiddleware, profileController.completeOnboarding);

// GET /api/profiles/universities - Get university list
router.get('/universities', profileController.getUniversities);

// POST /api/profiles/toggle-job-seeking - Toggle job seeking active status
router.post('/toggle-job-seeking', authMiddleware, profileController.toggleJobSeekingActive);

module.exports = router;