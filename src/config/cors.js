const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? ['https://kgencyserver-production.up.railway.app'] // 프로덕션 도메인으로 변경 필요
        : ['http://localhost:3000', 'http://localhost:8081'], // 개발 환경
    credentials: true,
    optionsSuccessStatus: 200
};

module.exports = corsOptions;