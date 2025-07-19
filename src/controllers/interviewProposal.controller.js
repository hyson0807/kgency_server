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

            return res.json({  // return 추가
                success: true,
                data: {
                    proposal,
                    availableSlots
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
}