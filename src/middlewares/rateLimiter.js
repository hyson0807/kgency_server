const rateLimit = require('express-rate-limit');

// 일반 API 제한
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // 최대 100개 요청
    message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
});

// 로그인 시도 제한
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 30, // 최대 30번 시도
    skipSuccessfulRequests: true,
    message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.'
});

// SMS 발송 제한
const smsLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1시간
    max: 30, // 최대 3번
    message: 'SMS 발송 한도를 초과했습니다. 1시간 후 다시 시도해주세요.'
});

module.exports = {
    apiLimiter,
    loginLimiter,
    smsLimiter
};