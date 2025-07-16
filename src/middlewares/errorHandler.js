const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Supabase 에러 처리
    if (err.code === '23505') {
        return res.status(400).json({
            success: false,
            error: '중복된 데이터입니다.'
        });
    }

    // JWT 에러
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: '유효하지 않은 토큰입니다.'
        });
    }

    // 기본 에러 응답
    res.status(err.status || 500).json({
        success: false,
        error: err.message || '서버 오류가 발생했습니다.',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;