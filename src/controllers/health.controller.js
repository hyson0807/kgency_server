// 헬스 체크
const healthCheck = (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date(),
        environment: process.env.NODE_ENV || 'development'
    });
};

module.exports = {
    healthCheck
};