const interviewSlotService = require('../services/interviewSlot.service');

exports.createInterviewSlot = async (req, res, next) => {

    try {
        const { companyId, slots, date } = req.body;

        // date만 있고 slots가 없거나 빈 배열인 경우 = 해당 날짜 삭제
        if (date && (!slots || slots.length === 0)) {
            await interviewSlotService.deleteByDate(companyId, date);
            return res.json({
                success: true,
                message: '해당 날짜의 면접 시간대가 삭제되었습니다.'
            });
        }

        // slots가 있는 경우 정상 처리
        if (!slots) {
            return res.status(400).json({
                success: false,
                message: '면접 시간대가 필요합니다.'
            });
        }

        const result = await interviewSlotService.create(companyId, slots);
        res.json({ success: true, data: result });

    } catch (err) {
        next(err);
    }
};

exports.getInterviewSlots = async (req, res, next) => {
    try {
        const { companyId } = req.query;

        const result = await interviewSlotService.getAll(companyId);

        res.json({ success: true, data: result });

    } catch (err) {
        next(err);
    }
};

exports.deleteInterviewSlot = async (req, res, next) => {
    try {
        const result = await interviewSlotService.remove(req.user.id, req.params.slotId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};
