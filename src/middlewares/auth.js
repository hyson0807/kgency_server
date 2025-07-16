const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                error: '인증이 필요합니다'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            error: '유효하지 않은 토큰입니다'
        });
    }
};

// 선택적 인증 미들웨어 (로그인 안 해도 접근 가능하지만, 로그인 시 user 정보 추가)
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
        }
        next();
    } catch (error) {
        // 토큰이 유효하지 않아도 계속 진행
        next();
    }
};

module.exports = { authMiddleware, optionalAuth };