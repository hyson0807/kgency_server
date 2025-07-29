const translateService = require('../services/translate.service');

// 단일 번역
const translate = async (req, res) => {
    try {
        const { text, targetLang } = req.body;

        const result = await translateService.translateText(text, targetLang);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('번역 오류:', error);
        res.status(500).json({
            success: false,
            error: error.message || '번역 중 오류가 발생했습니다.'
        });
    }
};

// 배치 번역
const translateBatch = async (req, res) => {
    try {
        const { texts, targetLang } = req.body;

        const translations = await translateService.translateBatch(texts, targetLang);

        res.json({
            success: true,
            translations
        });

    } catch (error) {
        console.error('배치 번역 오류:', error);
        res.status(500).json({
            success: false,
            error: error.message || '번역 중 오류가 발생했습니다.'
        });
    }
};

// DB 번역 가져오기
const getDBTranslations = async (req, res) => {
    try {
        const { language } = req.params;
        
        if (!language) {
            return res.status(400).json({
                success: false,
                error: '언어 코드가 필요합니다.'
            });
        }

        const translations = await translateService.getDBTranslations(language);

        res.json({
            success: true,
            data: translations
        });

    } catch (error) {
        console.error('DB 번역 조회 오류:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'DB 번역 조회 중 오류가 발생했습니다.'
        });
    }
};

module.exports = {
    translate,
    translateBatch,
    getDBTranslations
};