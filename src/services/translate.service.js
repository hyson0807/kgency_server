const { Translate } = require('@google-cloud/translate').v2;
const { supabase } = require('../config/database');

const translate = new Translate({
    key: process.env.GOOGLE_TRANSLATE_API_KEY
});

const translationCache = new Map();

// 단일 번역
const translateText = async (text, targetLang) => {
    if (!text || !targetLang) {
        throw new Error('번역할 텍스트와 대상 언어를 입력해주세요.');
    }

    const cacheKey = `${text}_${targetLang}`;

    // 캐시 확인
    if (translationCache.has(cacheKey)) {
        return {
            translatedText: translationCache.get(cacheKey),
            fromCache: true
        };
    }

    // 번역 수행
    const [translation] = await translate.translate(text, targetLang);
    translationCache.set(cacheKey, translation);

    return {
        translatedText: translation,
        fromCache: false
    };
};

// 배치 번역
const translateBatch = async (texts, targetLang) => {
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
        throw new Error('번역할 텍스트 배열을 입력해주세요.');
    }

    const translations = await Promise.all(
        texts.map(async (item, index) => {
            // 문자열 배열과 객체 배열 모두 지원
            const textToTranslate = typeof item === 'string' ? item : item.text;
            const cacheKey = `${textToTranslate}_${targetLang}`;

            if (translationCache.has(cacheKey)) {
                if (typeof item === 'string') {
                    return translationCache.get(cacheKey);
                }
                return {
                    ...item,
                    translatedText: translationCache.get(cacheKey)
                };
            }

            const [translation] = await translate.translate(textToTranslate, targetLang);
            translationCache.set(cacheKey, translation);

            if (typeof item === 'string') {
                return translation;
            }
            return {
                ...item,
                translatedText: translation
            };
        })
    );

    return translations;
};

// DB에서 번역 가져오기
const getDBTranslations = async (language) => {
    try {
        const { data, error } = await supabase
            .from('translations')
            .select('*')
            .eq('language', language);

        if (error) throw error;

        // 캐시 형태로 변환
        const cache = {};
        if (data) {
            data.forEach(item => {
                const key = `${item.table_name}.${item.column_name}.${item.row_id}`;
                cache[key] = item.translation;
            });
        }

        return cache;
    } catch (error) {
        console.error('DB 번역 조회 오류:', error);
        throw error;
    }
};

module.exports = {
    translateText,
    translateBatch,
    getDBTranslations
};