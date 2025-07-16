const { supabase } = require('../config/database');

exports.create = async (companyId, slots) => {
    try {
        // slots가 빈 배열이 아닌 경우, 날짜 추출
        const dates = slots.length > 0
            ? [...new Set(slots.map(slot => slot.date))]
            : [];

        // 날짜가 있는 경우 해당 날짜의 기존 슬롯 삭제
        for (const date of dates) {
            const { error: deleteError } = await supabase
                .from('interview_slots')
                .delete()
                .eq('company_id', companyId)
                .gte('start_time', `${date} 00:00:00`)
                .lt('start_time', `${date} 23:59:59`);

            if (deleteError) throw deleteError;
        }

        // slots가 빈 배열이면 삭제만 하고 종료
        if (slots.length === 0) {
            return [];
        }

        // 새로운 슬롯 추가
        const formattedSlots = slots.map(slot => ({
            company_id: companyId,
            start_time: `${slot.date} ${slot.startTime}:00`,
            end_time: `${slot.date} ${slot.endTime}:00`,
            location: slot.location,
            interview_type: slot.interviewType,
            is_available: true
        }));

        const { data, error } = await supabase
            .from('interview_slots')
            .insert(formattedSlots)
            .select();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Interview slot creation error:', error);
        throw error;
    }
};

// 특정 날짜의 슬롯만 삭제하는 메서드 추가
exports.deleteByDate = async (companyId, date) => {
    try {
        const { error } = await supabase
            .from('interview_slots')
            .delete()
            .eq('company_id', companyId)
            .gte('start_time', `${date} 00:00:00`)
            .lt('start_time', `${date} 23:59:59`);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Interview slot deletion by date error:', error);
        throw error;
    }
};

exports.getAll = async (companyId) => {
    try {
        const { data, error } = await supabase
            .from('interview_slots')
            .select()
            .eq('company_id', companyId)
            .order('start_time', { ascending: true });

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Interview slot retrieval error:', error);
        throw error;
    }
};

exports.remove = async (companyId, slotId) => {
    try {
        const { error } = await supabase
            .from('interview_slots')
            .delete()
            .eq('company_id', companyId)
            .eq('id', slotId);

        if (error) throw error;
    } catch (error) {
        console.error('Interview slot deletion error:', error);
        throw error;
    }
};