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

// controllers/interviewSchedule.controller.js에 추가

exports.getCompanySchedules = async (req, res, next) => {
    try {
        const { companyId, month } = req.query;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: '회사 ID가 필요합니다.'
            });
        }

        // month가 없으면 현재 월 사용
        const targetMonth = month || new Date().toISOString().slice(0, 7);

        const schedules = await interviewScheduleService.getCompanySchedules(
            companyId,
            targetMonth
        );

        // 날짜별로 그룹화
        const groupedSchedules = schedules.reduce((acc, schedule) => {
            const date = new Date(schedule.interview_slot.start_time)
                .toISOString().split('T')[0];

            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(schedule);
            return acc;
        }, {});

        res.json({
            success: true,
            data: {
                schedules,
                groupedSchedules,
                month: targetMonth
            }
        });

    } catch (err) {
        next(err);
    }
};

exports.getCompanySchedulesByDate = async (req, res, next) => {
    try {
        const { companyId, date } = req.query;

        if (!companyId || !date) {
            return res.status(400).json({
                success: false,
                message: '회사 ID와 날짜가 필요합니다.'
            });
        }

        const schedules = await interviewScheduleService.getCompanySchedulesByDate(
            companyId,
            date
        );

        res.json({
            success: true,
            data: schedules
        });

    } catch (err) {
        next(err);
    }
};

// controllers/interviewSchedule.controller.js에 추가
exports.getUserSchedules = async (req, res, next) => {
    try {
        const { userId, month } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: '사용자 ID가 필요합니다.'
            });
        }

        const targetMonth = month || new Date().toISOString().slice(0, 7);

        const schedules = await interviewScheduleService.getUserSchedules(
            userId,
            targetMonth
        );

        // 날짜별로 그룹화
        const groupedSchedules = schedules.reduce((acc, schedule) => {
            const date = new Date(schedule.interview_slot.start_time)
                .toISOString().split('T')[0];

            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(schedule);
            return acc;
        }, {});

        res.json({
            success: true,
            data: {
                schedules,
                groupedSchedules,
                month: targetMonth
            }
        });

    } catch (err) {
        next(err);
    }
};

exports.getUserSchedulesByDate = async (req, res, next) => {
    try {
        const { userId, date } = req.query;

        if (!userId || !date) {
            return res.status(400).json({
                success: false,
                message: '사용자 ID와 날짜가 필요합니다.'
            });
        }

        const schedules = await interviewScheduleService.getUserSchedulesByDate(
            userId,
            date
        );

        res.json({
            success: true,
            data: schedules
        });

    } catch (err) {
        next(err);
    }
};


exports.cancelSchedule = async (req, res, next) => {
    try {
        const { scheduleId } = req.params;
        const { companyId } = req.body;

        if (!scheduleId || !companyId) {
            return res.status(400).json({
                success: false,
                message: '필수 정보가 누락되었습니다.'
            });
        }

        await interviewScheduleService.cancelSchedule(scheduleId, companyId);

        res.json({
            success: true,
            message: '면접 일정이 취소되었습니다.'
        });

    } catch (err) {
        next(err);
    }
};