const { Translate } = require('@google-cloud/translate').v2;

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
        texts.map(async (item) => {
            const cacheKey = `${item.text}_${targetLang}`;

            if (translationCache.has(cacheKey)) {
                return {
                    ...item,
                    translatedText: translationCache.get(cacheKey)
                };
            }

            const [translation] = await translate.translate(item.text, targetLang);
            translationCache.set(cacheKey, translation);

            return {
                ...item,
                translatedText: translation
            };
        })
    );

    return translations;
};

module.exports = {
    translateText,
    translateBatch
};