const express = require('express')
const applicationController = require('../controllers/application.controller')
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router()



// POST /api/applications/instant-interview - Create instant interview application (requires auth)
router.post('/instant-interview', authMiddleware, applicationController.createInstantInterviewApplication);

router.get('/user/:userId', applicationController.getApplicationsByUserId)

router.get('/company/:jobPostingId', applicationController.getApplicationByPostingId)

module.exports = router