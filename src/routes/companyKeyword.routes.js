const express = require('express');
const router = express.Router();
const companyKeywordController = require('../controllers/companyKeyword.controller');
const { authMiddleware } = require('../middlewares/auth');

// GET /api/company-keyword - 회사 키워드 조회
router.get('/', authMiddleware, companyKeywordController.getCompanyKeywords);

// PUT /api/company-keyword - 회사 키워드 업데이트
router.put('/', authMiddleware, companyKeywordController.updateCompanyKeywords);

module.exports = router;