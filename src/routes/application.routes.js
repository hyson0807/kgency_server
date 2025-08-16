const express = require('express')
const applicationController = require('../controllers/application.controller')
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router()

// GET /api/applications/check-duplicate - Check for duplicate application (requires auth)
router.get('/check-duplicate', authMiddleware, applicationController.checkDuplicateApplication);

// POST /api/applications - Create normal application (requires auth)
router.post('/', authMiddleware, applicationController.createApplication);

// POST /api/applications/instant-interview - Create instant interview application (requires auth)
router.post('/instant-interview', authMiddleware, applicationController.createInstantInterviewApplication);

router.get('/user/:userId', applicationController.getApplicationsByUserId)

router.get('/company/:jobPostingId', applicationController.getApplicationByPostingId)

// POST /api/applications/invitation - Create invitation application (requires auth)
router.post('/invitation', authMiddleware, applicationController.createInvitationApplication);

// GET /api/applications/suitability/:userId/:jobPostingId - Calculate applicant suitability
router.get('/suitability/:userId/:jobPostingId', applicationController.calculateApplicantSuitability);

module.exports = router