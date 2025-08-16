const applicationService = require('../services/application.service');
const purchaseService = require('../services/purchase.service');
const notificationService = require('../services/notification.service');
const { supabase } = require('../config/database');
const SuitabilityCalculator = require('../utils/suitabilityCalculator');

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

        // 알림 발송을 위한 데이터 조회
        try {
            const { data: applicationData, error: dataError } = await supabase
                .from('applications')
                .select(`
                    id,
                    user:profiles!user_id (
                        id,
                        name
                    ),
                    job_posting:job_postings!job_posting_id (
                        id,
                        title
                    )
                `)
                .eq('id', application.id)
                .single();

            if (!dataError && applicationData) {
                // 회사에게 새로운 일반지원 알림 발송
                await notificationService.sendNewApplicationNotification(
                    companyId,
                    applicationData.user.name,
                    applicationData.job_posting.title,
                    'regular',
                    applicationData.id
                );
                console.log('New regular application notification sent to company');
            }
        } catch (notificationError) {
            // 알림 발송 실패해도 지원서 생성은 성공으로 처리
            console.error('Failed to send regular application notification:', notificationError);
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

        // 알림 발송을 위한 데이터 조회
        try {
            const { data: applicationData, error: dataError } = await supabase
                .from('applications')
                .select(`
                    id,
                    user:profiles!user_id (
                        id,
                        name
                    ),
                    job_posting:job_postings!job_posting_id (
                        id,
                        title
                    )
                `)
                .eq('id', application.id)
                .single();

            if (!dataError && applicationData) {
                // 회사에게 새로운 즉시면접 지원 알림 발송
                await notificationService.sendNewApplicationNotification(
                    companyId,
                    applicationData.user.name,
                    applicationData.job_posting.title,
                    'instant_interview',
                    applicationData.id
                );
                console.log('New instant interview application notification sent to company');
            }
        } catch (notificationError) {
            // 알림 발송 실패해도 지원서 생성은 성공으로 처리
            console.error('Failed to send instant interview application notification:', notificationError);
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

// 지원자의 적합도 계산
exports.calculateApplicantSuitability = async (req, res) => {
    try {
        const { userId, jobPostingId } = req.params;

        if (!userId || !jobPostingId) {
            return res.status(400).json({
                success: false,
                error: 'userId와 jobPostingId가 필요합니다.'
            });
        }

        // 1. 사용자 키워드 조회
        const { data: userKeywords, error: userError } = await supabase
            .from('user_keyword')
            .select(`
                keyword_id,
                keyword:keyword_id (
                    id,
                    keyword,
                    category
                )
            `)
            .eq('user_id', userId);

        if (userError) throw userError;

        if (!userKeywords || userKeywords.length === 0) {
            return res.json({
                success: true,
                data: {
                    score: 0,
                    level: 'low',
                    details: {
                        categoryScores: {},
                        bonusPoints: 0,
                        matchedKeywords: {
                            countries: [],
                            jobs: [],
                            conditions: [],
                            location: [],
                            moveable: [],
                            gender: [],
                            age: [],
                            visa: [],
                            workDays: [],
                            koreanLevel: []
                        },
                        missingRequired: [],
                        appliedBonuses: []
                    }
                }
            });
        }

        // 2. 공고 키워드 조회
        const { data: jobPostingKeywords, error: postingError } = await supabase
            .from('job_posting_keyword')
            .select(`
                keyword:keyword_id (
                    id,
                    keyword,
                    category
                )
            `)
            .eq('job_posting_id', jobPostingId);

        if (postingError) throw postingError;

        // 3. 적합도 계산
        const calculator = new SuitabilityCalculator();
        const userKeywordIds = userKeywords.map(uk => uk.keyword_id);
        const jobKeywords = jobPostingKeywords?.map(jpk => ({
            keyword: jpk.keyword
        })) || [];

        const suitability = calculator.calculate(userKeywordIds, jobKeywords);

        res.json({
            success: true,
            data: suitability
        });

    } catch (error) {
        console.error('적합도 계산 실패:', error);
        res.status(500).json({
            success: false,
            error: '적합도 계산에 실패했습니다.'
        });
    }
}
