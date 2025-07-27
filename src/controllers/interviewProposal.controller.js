// controllers/interviewProposal.controller.js
const interviewProposalService = require('../services/interviewPropasal.service');

exports.createProposal = async (req, res, next) => {
    try {
        const { applicationId, companyId, location } = req.body;

        if (!applicationId || !companyId || !location) {
            return res.status(400).json({
                success: false,
                message: '필수 정보가 누락되었습니다.'
            });
        }

        const result = await interviewProposalService.createProposal(
            applicationId,
            companyId,
            location
        );

        res.json({
            success: true,
            data: result,
            message: '면접 제안이 성공적으로 생성되었습니다.'
        });

    } catch (err) {
        next(err);
    }
};

exports.getProposalByApplication = async (req, res, next) => {
    try {
        const { applicationId } = req.params;

        const proposal = await interviewProposalService.getProposalByApplication(applicationId);

        if(proposal) {
            // 회사의 가능한 시간대도 함께 조회
            const availableSlots = await interviewProposalService.getAvailableSlots(proposal.company_id);

            // Extract job posting data from the nested structure
            const jobPosting = proposal.applications?.job_postings ? {
                special_notes: proposal.applications.job_postings.special_notes
            } : null;

            return res.json({  // return 추가
                success: true,
                data: {
                    proposal,
                    availableSlots,
                    jobPosting
                }
            });
        }

        // proposal이 없는 경우
        return res.json({
            success: true,
            data: {
                proposal: null
            }
        });

    } catch (err) {
        next(err);
    }
};

exports.deleteProposal = async (req, res, next) => {
    try {
        const { applicationId } = req.params;

        if (!applicationId) {
            return res.status(400).json({
                success: false,
                message: '지원서 ID가 필요합니다.'
            });
        }

        const result = await interviewProposalService.deleteProposal(applicationId);

        res.json({
            success: true,
            message: result.message,
            data: {
                deletedProposal: result.deletedProposal,
                deletedApplication: result.deletedApplication
            }
        });
    } catch (err) {
        console.error('Delete proposal error:', err);
        next(err);
    }
};

// Bulk check for multiple applications - N+1 쿼리 문제 해결
exports.bulkCheckProposals = async (req, res, next) => {
    try {
        const { applicationIds } = req.body;

        if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: '지원서 ID 배열이 필요합니다.'
            });
        }

        // 성능을 위해 최대 100개로 제한
        if (applicationIds.length > 100) {
            return res.status(400).json({
                success: false,
                message: '최대 100개의 지원서만 처리할 수 있습니다.'
            });
        }

        const proposals = await interviewProposalService.bulkGetProposalsByApplications(applicationIds);

        res.json({
            success: true,
            data: proposals
        });

    } catch (err) {
        console.error('Bulk check proposals error:', err);
        next(err);
    }
};