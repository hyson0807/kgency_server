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
const { Server } = require('socket.io');
const ChatSocketHandler = require('./src/socket/chatSocket');

// 서버 시작
const server = app.listen(port, () => {
    console.log(`
🚀 Kgency Server is running!
📍 Port: ${port}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📅 Started at: ${new Date().toISOString()}
    `);
});

// Socket.io 설정 - Railway 최적화
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? [
                process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : "*"
              ].flat()
            : ["http://localhost:8081", "http://localhost:8082", "http://localhost:19006", "exp://192.168.0.15:8081"],
        methods: ["GET", "POST"],
        credentials: true
    },
    // Railway 환경에서 WebSocket 최적화
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    // Railway 프록시 환경 대응
    path: '/socket.io/',
    serveClient: false,
    // WebSocket 연결 강제 (Railway 테스트용)
    allowUpgrades: true,
    perMessageDeflate: false
});

// 채팅 Socket 핸들러 초기화
const chatHandler = new ChatSocketHandler(io);
chatHandler.setupEventHandlers();

// app에서 socket handler에 접근할 수 있도록 설정
app.set('io', io);
io.chatHandler = chatHandler;

console.log('🔌 Socket.io 서버가 초기화되었습니다.');

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