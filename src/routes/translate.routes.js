const express = require('express');
const router = express.Router();
const translateController = require('../controllers/translate.controller');
const { optionalAuth } = require('../middlewares/auth');

// 단일 번역 (인증 선택)
router.post('/translate', optionalAuth, translateController.translate);

// 배치 번역 (인증 선택)
router.post('/translate-batch', optionalAuth, translateController.translateBatch);

// DB 번역 가져오기 (인증 선택)
router.get('/db-translations/:language', optionalAuth, translateController.getDBTranslations);

module.exports = router;