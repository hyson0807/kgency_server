const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? (origin, callback) => {
            // 허용할 origin 패턴들
            const allowedPatterns = [
                /^https:\/\/.*\.expo\.app$/,     // Expo 앱 도메인
                /^https:\/\/.*\.expo\.dev$/,     // Expo 개발 도메인
                /^exp:\/\/.*/,                    // Expo 프로토콜
                /^https:\/\/kgency.*\.expo\.app$/, // 특정 kgency 앱
                /^capacitor:\/\/localhost/,      // iOS 앱
                /^ionic:\/\/localhost/,           // iOS 앱 대체
                /^http:\/\/localhost/,            // iOS 시뮬레이터
                /^https:\/\/localhost/,           // iOS 시뮬레이터 HTTPS
                /^file:\/\/.*/                    // 파일 프로토콜 (iOS)
            ];
            
            // origin이 없는 경우 (네이티브 앱)도 허용
            if (!origin) {
                callback(null, true);
                return;
            }
            
            // 패턴 매칭
            const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
            
            if (isAllowed) {
                callback(null, true);
            } else {
                console.log('CORS rejected origin:', origin);
                callback(null, true); // 일단 허용하되 로그 남김
            }
        }
        : ['http://localhost:3000', 'http://localhost:8081'],
    credentials: true,
    optionsSuccessStatus: 200
};
