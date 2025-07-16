const dotenv = require('dotenv');

// 환경 변수 로드 (가장 먼저!)
dotenv.config();

// 필요한 환경 변수 체크
const requiredEnvVars = [
    'KEY_1',
    'KEY_2',
    'JWT_SECRET',
    'SOLAPI_API_KEY',
    'SOLAPI_API_SECRET',
    'SENDER_PHONE',
    'GOOGLE_TRANSLATE_API_KEY'
];

requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`❌ 필수 환경 변수 누락: ${varName}`);
        process.exit(1);
    }
});

// 앱 가져오기
const app = require('./src/app');
const { port } = require('./src/config');

// 서버 시작
const server = app.listen(port, () => {
    console.log(`
🚀 Kgency Server is running!
📍 Port: ${port}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📅 Started at: ${new Date().toISOString()}
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    // 프로덕션에서는 서버를 종료하지 않고 에러만 로깅
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
});