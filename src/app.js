const express = require('express');
const cors = require('cors');
const { corsOptions } = require('./config');
const errorHandler = require('./middlewares/errorHandler');
const { apiLimiter } = require('./middlewares/rateLimiter');
const requestLogger = require('./middlewares/requestLogger');
const routes = require('./routes');

// Express 앱 생성
const app = express();

// Trust proxy 설정 (Railway, Heroku 등 클라우드 플랫폼 사용 시 필요)
app.set('trust proxy', 1);

// 기본 미들웨어
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // 이미지 업로드를 위해 크기 제한 증가
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 요청 로깅 미들웨어 (CORS 이후에 추가)
app.use(requestLogger);

// Rate limiting (전체 API)
app.use('/api', apiLimiter);

// 기본 라우트
app.get('/', (req, res) => {
    res.json({
        message: 'Kgency Server is running',
        version: '2.0.0',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth/*',
            ai: '/api/ai/*',
            translate: '/api/translate/*',
        }
    });
});



// API 라우트
app.use('/api', routes);

// 404 처리 (라우트에서 처리 안된 것들)
app.use((req, res) => {
    const timestamp = new Date().toISOString();
    const userAgent = req.get('User-Agent') || 'Unknown';
    const origin = req.get('Origin') || 'No Origin';
    const forwarded = req.get('X-Forwarded-For') || req.connection.remoteAddress;

    // TestFlight나 모바일 앱에서의 404 에러는 상세 로깅
    const isTestFlight = userAgent.includes('TestFlight') || userAgent.includes('kgency');
    const isMobileApp = userAgent.includes('Expo') || userAgent.includes('CFNetwork') ||
                       userAgent.includes('Darwin') || origin.includes('localhost');

    if (isTestFlight || isMobileApp) {
        console.error(`
╔══════════════════════════════════════════════════════════════════
║ ❌ 404 ERROR FROM MOBILE/TESTFLIGHT
║ ⏰ Time: ${timestamp}
║ 🔗 ${req.method} ${req.url}
║ 🌍 Origin: ${origin}
║ 📋 User-Agent: ${userAgent}
║ 📍 IP: ${forwarded}
║ 🏷️  TestFlight: ${isTestFlight ? 'YES' : 'NO'}
║ 📱 Mobile App: ${isMobileApp ? 'YES' : 'NO'}
║ 📦 Available Routes:
║    - GET  /
║    - POST /api/auth/send-otp
║    - POST /api/auth/verify-otp
║    - DELETE /api/auth/delete-account
╚══════════════════════════════════════════════════════════════════
        `);
    }

    res.status(404).json({
        success: false,
        error: '요청하신 리소스를 찾을 수 없습니다.',
        debug: process.env.NODE_ENV !== 'production' ? {
            timestamp,
            method: req.method,
            url: req.url,
            origin,
            userAgent: userAgent.slice(0, 100),
            availableRoutes: [
                'GET /',
                'POST /api/auth/send-otp',
                'POST /api/auth/verify-otp',
                'DELETE /api/auth/delete-account'
            ]
        } : undefined
    });
});

// 에러 핸들러 (맨 마지막에 위치)
app.use(errorHandler);

module.exports = app;