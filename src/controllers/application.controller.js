const applicationService = require('../services/application.service');
const purchaseService = require('../services/purchase.service');
const { supabase } = require('../config/database');

// 중복 지원 확인
exports.checkDuplicateApplication = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { jobPostingId } = req.query;

        if (!jobPostingId) {
            return res.status(400).json({
                success: false,
                error: 'jobPostingId가 필요합니다.'
            });
        }

        const { data: existingApp, error } = await supabase
            .from('applications')
            .select('id')
            .eq('user_id', userId)
            .eq('job_posting_id', jobPostingId)
            .maybeSingle();

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            isDuplicate: !!existingApp,
            data: existingApp
        });

    } catch (error) {
        console.error('중복 지원 확인 실패:', error);
        res.status(500).json({
            success: false,
            error: '중복 지원 확인에 실패했습니다.'
        });
    }
};

// 일반 지원서 생성 (메시지 포함)
exports.createApplication = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { companyId, jobPostingId, messageId } = req.body;

        if (!companyId || !jobPostingId || !messageId) {
            return res.status(400).json({
                success: false,
                error: 'companyId, jobPostingId, messageId가 필요합니다.'
            });
        }

        // 지원 내역 저장
        const { data: application, error: appError } = await supabase
            .from('applications')
            .insert({
                user_id: userId,
                company_id: companyId,
                job_posting_id: jobPostingId,
                message_id: messageId,
                status: 'pending'
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
            message: '지원서가 성공적으로 제출되었습니다.'
        });

    } catch (error) {
        console.error('지원서 생성 실패:', error);
        res.status(500).json({
            success: false,
            error: '지원서 생성에 실패했습니다.'
        });
    }
};

// 인스턴트 면접 지원서 생성.
exports.createInstantInterviewApplication = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { companyId, jobPostingId, useToken } = req.body;

        if (!companyId || !jobPostingId) {
            return res.status(400).json({
                success: false,
                error: 'companyId와 jobPostingId가 필요합니다.'
            });
        }

        let tokenTransactionId = null;

        // 토큰 사용이 요청된 경우 토큰 차감
        if (useToken) {
            try {
                const tokenResult = await purchaseService.spendTokens(
                    userId,
                    1, // 즉시면접 1회 = 토큰 1개
                    '즉시면접 예약'
                );
                tokenTransactionId = tokenResult.transactionId;
            } catch (tokenError) {
                console.error('토큰 사용 실패:', tokenError);
                
                if (tokenError.message.includes('Insufficient tokens')) {
                    return res.status(400).json({
                        success: false,
                        error: '토큰이 부족합니다. 상점에서 토큰을 구매해주세요.'
                    });
                }
                
                return res.status(500).json({
                    success: false,
                    error: '토큰 처리 중 오류가 발생했습니다.'
                });
            }
        }

        // 지원서 생성 (이력서 없이, 바로 scheduled 상태로)
        const { data: application, error: appError } = await supabase
            .from('applications')
            .insert({
                user_id: userId,
                company_id: companyId,
                job_posting_id: jobPostingId,
                type: 'user_instant_interview',
                status: 'scheduled', // 바로 scheduled 상태로
                token_used: useToken || false,
                token_transaction_id: tokenTransactionId
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
            message: useToken 
                ? '인스턴트 면접 지원서가 성공적으로 생성되었습니다. 토큰 1개가 사용되었습니다.'
                : '인스턴트 면접 지원서가 성공적으로 생성되었습니다.'
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

// 초대형 지원서 생성 (면접 요청용)
exports.createInvitationApplication = async (req, res) => {
    try {
        const companyId = req.user.userId;
        const { userId, jobPostingId } = req.body;

        if (!userId || !jobPostingId) {
            return res.status(400).json({
                success: false,
                error: 'userId와 jobPostingId가 필요합니다.'
            });
        }

        // 지원서 생성
        const { data: application, error: appError } = await supabase
            .from('applications')
            .insert({
                user_id: userId,
                company_id: companyId,
                job_posting_id: jobPostingId,
                type: 'company_invited',
                status: 'invited'
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
            message: '초대형 지원서가 성공적으로 생성되었습니다.'
        });

    } catch (error) {
        console.error('초대형 지원서 생성 실패:', error);
        res.status(500).json({
            success: false,
            error: '초대형 지원서 생성에 실패했습니다.'
        });
    }
}
