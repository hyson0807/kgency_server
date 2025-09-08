const resumeService = require('../services/resume.service');

// AI 이력서 생성
const generateResume = async (req, res) => {
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

        const result = await resumeService.generateResume({
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

// 이력서 저장 (메시지로 저장)
const saveResume = async (req, res) => {
    try {
        const senderId = req.user.userId;
        const { receiverId, subject, content } = req.body;

        const message = await resumeService.saveResume(senderId, receiverId, subject, content);

        res.json({
            success: true,
            data: message,
            message: '이력서가 성공적으로 저장되었습니다.'
        });

    } catch (error) {
        console.error('이력서 저장 실패:', error);
        
        if (error.message === 'receiverId, subject, content가 필요합니다.') {
            res.status(400).json({
                success: false,
                error: error.message
            });
        } else {
            res.status(500).json({
                success: false,
                error: '이력서 저장에 실패했습니다.'
            });
        }
    }
};

module.exports = {
    generateResume,
    saveResume
};