const express = require('express');
const userKeywordController = require('../controllers/userKeyword.controller');
const router = express.Router();




router.get('/user/:userId', userKeywordController.getUserKeywordByUserId)

module.exports = router;
