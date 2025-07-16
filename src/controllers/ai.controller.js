const aiService = require('../services/ai.service');

// 이력서 생성
const generateResumeForPosting = async (req, res) => {
    try {
        const {
            user_id,
            job_posting_id,
            company_id,
            question,
            workDaysString,
            workTimesString
        } = req.body;

        // 필수 파라미터 검증
        if (!user_id || !job_posting_id || !company_id) {
            return res.status(400).json({
                success: false,
                error: '필수 정보가 누락되었습니다.'
            });
        }

        const result = await aiService.generateResumeForPosting({
            user_id,
            job_posting_id,
            company_id,
            question,
            workDaysString,
            workTimesString
        });

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('이력서 생성 오류:', error);

        if (error.message?.includes('찾을 수 없습니다')) {
            res.status(404).json({
                success: false,
                error: error.message
            });
        } else {
            res.status(500).json({
                success: false,
                error: '이력서 생성 중 오류가 발생했습니다.',
                details: error.message
            });
        }
    }
};

module.exports = {
    generateResumeForPosting
};