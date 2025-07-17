const { supabase } = require('../config/database');

exports.create = async (companyId, slots) => {
    try {
        const dates = slots.length > 0
            ? [...new Set(slots.map(slot => slot.date))]
            : [];

        // 날짜가 있는 경우 처리
        for (const date of dates) {
            // 1. 해당 날짜의 예약된 슬롯 ID들을 먼저 조회
            const { data: bookedSlots } = await supabase
                .from('interview_schedules')
                .select('interview_slot_id')
                .eq('status', 'confirmed')
                .in('interview_slot_id',
                    supabase
                        .from('interview_slots')
                        .select('id')
                        .eq('company_id', companyId)
                        .gte('start_time', `${date} 00:00:00`)
                        .lt('start_time', `${date} 23:59:59`)
                );

            const bookedSlotIds = bookedSlots?.map(s => s.interview_slot_id) || [];

            // 2. 예약되지 않은 슬롯만 삭제
            const { error: deleteError } = await supabase
                .from('interview_slots')
                .delete()
                .eq('company_id', companyId)
                .gte('start_time', `${date} 00:00:00`)
                .lt('start_time', `${date} 23:59:59`)
                .not('id', 'in', `(${bookedSlotIds.length > 0 ? bookedSlotIds.join(',') : '0'})`);

            if (deleteError) throw deleteError;
        }

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

exports.deleteByDate = async (companyId, date) => {
    try {
        // 예약된 슬롯 ID들을 먼저 조회
        const { data: bookedSlots } = await supabase
            .from('interview_schedules')
            .select('interview_slot_id')
            .eq('status', 'confirmed')
            .in('interview_slot_id',
                supabase
                    .from('interview_slots')
                    .select('id')
                    .eq('company_id', companyId)
                    .gte('start_time', `${date} 00:00:00`)
                    .lt('start_time', `${date} 23:59:59`)
            );

        const bookedSlotIds = bookedSlots?.map(s => s.interview_slot_id) || [];

        // 예약되지 않은 슬롯만 삭제
        const { error } = await supabase
            .from('interview_slots')
            .delete()
            .eq('company_id', companyId)
            .gte('start_time', `${date} 00:00:00`)
            .lt('start_time', `${date} 23:59:59`)
            .not('id', 'in', `(${bookedSlotIds.length > 0 ? bookedSlotIds.join(',') : '0'})`);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Interview slot deletion by date error:', error);
        throw error;
    }
};

exports.getAll = async (companyId) => {
    try {
        // 모든 슬롯 조회
        const { data: slots, error } = await supabase
            .from('interview_slots')
            .select('*')
            .eq('company_id', companyId)
            .order('start_time', { ascending: true });

        if (error) throw error;

        // 예약된 슬롯 조회
        const { data: bookedSchedules } = await supabase
            .from('interview_schedules')
            .select('interview_slot_id')
            .eq('status', 'confirmed')
            .in('interview_slot_id', slots.map(s => s.id));

        const bookedSlotIds = bookedSchedules?.map(s => s.interview_slot_id) || [];

        // 각 슬롯에 예약 여부 추가
        const slotsWithBookingStatus = slots.map(slot => ({
            ...slot,
            is_booked: bookedSlotIds.includes(slot.id)
        }));

        return slotsWithBookingStatus;
    } catch (error) {
        console.error('Interview slot retrieval error:', error);
        throw error;
    }
};