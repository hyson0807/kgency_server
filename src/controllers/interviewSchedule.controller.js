const interviewScheduleService = require('../services/interviewSchedule.service');

exports.createUserSchedule = async (req, res, next) => {
    try {
        const { proposalId, interviewSlotId } = req.body;

        if (!proposalId || !interviewSlotId) {
            return res.status(400).json({
                success: false,
                message: '필수 정보가 누락되었습니다.'
            });
        }

        const result = await interviewScheduleService.createSchedule(
            proposalId,
            interviewSlotId
        );

        res.json({
            success: true,
            data: result,
            message: '면접 일정이 확정되었습니다.'
        });

    } catch (err) {
        next(err);
    }
};

exports.getScheduleByProposal = async (req, res, next) => {
    try {
        const { proposalId } = req.params;

        const schedule = await interviewScheduleService.getScheduleByProposal(proposalId);

        if (!schedule) {
            return res.status(404).json({
                success: false,
                message: '면접 일정을 찾을 수 없습니다.'
            });
        }

        res.json({
            success: true,
            data: schedule
        });

    } catch (err) {
        next(err);
    }
};