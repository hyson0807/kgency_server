const applicationService = require('../services/application.service');
const { supabase } = require('../config/database');

// 인스턴트 면접 지원서 생성
const createInstantInterviewApplication = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { companyId, jobPostingId } = req.body;

        if (!companyId || !jobPostingId) {
            return res.status(400).json({
                success: false,
                error: 'companyId와 jobPostingId가 필요합니다.'
            });
        }

        // 지원서 생성 (이력서 없이, 바로 scheduled 상태로)
        const { data: application, error: appError } = await supabase
            .from('applications')
            .insert({
                user_id: userId,
                company_id: companyId,
                job_posting_id: jobPostingId,
                type: 'user_initiated',
                status: 'scheduled' // 바로 scheduled 상태로
            })
            .select()
            .single();

        if (appError) {
            if (appError.code === '23505' && appError.message.includes('unique_user_job_posting_application')) {
                return res.status(409).json({
                    success: false,
                    error: '이미 지원한 공고입니다.'
                });
            }
            throw appError;
        }

        res.json({
            success: true,
            data: application,
            message: '인스턴트 면접 지원서가 성공적으로 생성되었습니다.'
        });

    } catch (error) {
        console.error('인스턴트 면접 지원서 생성 실패:', error);
        res.status(500).json({
            success: false,
            error: '인스턴트 면접 지원서 생성에 실패했습니다.'
        });
    }
};



exports.getApplicationsByUserId = async (req, res, next) => {
    try {
        const { userId } = req.params;

        const result = await applicationService.getApplication(userId)

        res.json({
            success: true,
            data: result
        })
    } catch (err) {
        next(err);
    }
}

exports.getApplicationByPostingId = async (req, res, next) => {
    try {
        const { jobPostingId } = req.params;

        if (! jobPostingId) {
            return res.status(400).json({
                success: false,
                message: '공고 ID가 필요합니다.'
            });
        }

        const result = await applicationService.getApplicationsByPosting(jobPostingId);

        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        console.error('Get applications by posting error:', err);
        next(err);
    }
}

module.exports = {
    createInstantInterviewApplication,
    getApplicationsByUserId: exports.getApplicationsByUserId,
    getApplicationByPostingId: exports.getApplicationByPostingId
};