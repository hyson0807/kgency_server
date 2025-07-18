const express = require('express')
const applicationController = require('../controllers/application.controller')
const router = express.Router()



router.get('/user/:userId', applicationController.getApplicationsByUserId)

router.get('/company/:jobPostingId', applicationController.getApplicationByPostingId)


module.exports = router