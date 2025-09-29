const requestLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.url;
    const userAgent = req.get('User-Agent') || 'Unknown';
    const origin = req.get('Origin') || 'No Origin';
    const referer = req.get('Referer') || 'No Referer';
    const forwarded = req.get('X-Forwarded-For') || req.connection.remoteAddress;

    // 테스트플라이트나 모바일 앱 요청인지 감지
    const isTestFlight = userAgent.includes('TestFlight') || userAgent.includes('kgency');
    const isMobileApp = userAgent.includes('Expo') || userAgent.includes('CFNetwork') ||
                       userAgent.includes('Darwin') || origin.includes('localhost');

    // 중요한 요청들에 대해서는 상세 로깅
    const isImportantRequest = url.includes('/api/auth') || url.includes('/api/health');

    if (isTestFlight || isMobileApp || isImportantRequest) {
        console.log(`
╔══════════════════════════════════════════════════════════════════
║ 📱 MOBILE/TESTFLIGHT REQUEST DETECTED
║ ⏰ Time: ${timestamp}
║ 🔗 ${method} ${url}
║ 🌍 Origin: ${origin}
║ 📋 User-Agent: ${userAgent}
║ 📍 IP: ${forwarded}
║ 🔗 Referer: ${referer}
║ 🏷️  TestFlight: ${isTestFlight ? 'YES' : 'NO'}
║ 📱 Mobile App: ${isMobileApp ? 'YES' : 'NO'}
╚══════════════════════════════════════════════════════════════════
        `);

        // 요청 본문도 로깅 (민감하지 않은 데이터만)
        if (req.body && Object.keys(req.body).length > 0) {
            const sanitizedBody = { ...req.body };
            // 민감한 정보 마스킹
            if (sanitizedBody.phone) {
                sanitizedBody.phone = sanitizedBody.phone.slice(0, 6) + '****';
            }
            if (sanitizedBody.otp) {
                sanitizedBody.otp = '******';
            }
            console.log('📦 Request Body (sanitized):', sanitizedBody);
        }
    } else if (process.env.NODE_ENV !== 'production') {
        // 개발 환경에서는 모든 요청 로깅
        console.log(`${timestamp} - ${method} ${url} - ${userAgent.slice(0, 50)}`);
    }

    // 응답 완료 시 로깅
    const originalSend = res.send;
    res.send = function(data) {
        if (isTestFlight || isMobileApp || isImportantRequest) {
            console.log(`
║ ✅ RESPONSE: ${res.statusCode} - ${method} ${url}
║ 📊 Response Size: ${Buffer.byteLength(data)} bytes
╚══════════════════════════════════════════════════════════════════
            `);
        }
        originalSend.call(this, data);
    };

    next();
};

module.exports = requestLogger;