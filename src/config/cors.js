const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? [
            'https://*.expo.app',  // 모든 Expo 앱 도메인 허용
            'https://*.expo.dev',  // Expo 개발 도메인
            'exp://*',            // Expo 프로토콜
            'http://localhost:*',   // 로컬 개발 (필요시)
            'https://kgency--9098bl1m62.expo.app'
        ]
        : ['http://localhost:3000', 'http://localhost:8081'],
    credentials: true,
    optionsSuccessStatus: 200
};
