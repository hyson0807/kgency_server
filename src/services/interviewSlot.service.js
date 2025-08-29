const { supabase } = require('../config/database');

exports.create = async (companyId, slots) => {
    try {
        const dates = slots.length > 0
            ? [...new Set(slots.map(slot => slot.date))]
            : [];

        // 날짜가 있는 경우 처리
        for (const date of dates) {
            console.log(`Processing date: ${date}`);

            // 1. 먼저 해당 날짜의 모든 슬롯을 조회
            const { data: existingSlots } = await supabase
                .from('interview_slots')
                .select('id, start_time')
                .eq('company_id', companyId)
                .gte('start_time', `${date} 00:00:00`)
                .lt('start_time', `${date} 23:59:59`);

            console.log('Existing slots:', existingSlots);

            if (existingSlots && existingSlots.length > 0) {
                const existingSlotIds = existingSlots.map(s => s.id);

                // 2. 스케줄이 있는 슬롯 ID들을 조회 (모든 상태 포함)
                const { data: bookedSchedules } = await supabase
                    .from('interview_schedules')
                    .select('interview_slot_id, status')
                    .in('interview_slot_id', existingSlotIds);

                console.log('스케줄된 슬롯들 (모든 상태):', bookedSchedules);

                // 참조가 있는 슬롯은 모두 제외 (상태와 관계없이)
                const bookedSlotIds = bookedSchedules?.map(s => s.interview_slot_id) || [];

                console.log('=== 삭제 로직 디버깅 ===');
                console.log('기존 슬롯 IDs:', existingSlotIds);
                console.log('참조가 있는 슬롯 IDs:', bookedSlotIds);
                console.log('문제의 슬롯 ID 포함 여부:', bookedSlotIds.includes('dd7b095c-1e27-4a68-abe0-dbe7cdcb1981'));

                // 3. 참조가 없는 슬롯만 찾아서 삭제
                const slotsToDelete = existingSlotIds.filter(id => !bookedSlotIds.includes(id));
                console.log('삭제 예정 슬롯 IDs:', slotsToDelete);
                console.log('문제의 슬롯이 삭제 대상에 포함?:', slotsToDelete.includes('dd7b095c-1e27-4a68-abe0-dbe7cdcb1981'));

                if (slotsToDelete.length > 0) {
                    const { error: deleteError } = await supabase
                        .from('interview_slots')
                        .delete()
                        .in('id', slotsToDelete);

                    if (deleteError) {
                        console.error('Delete error:', deleteError);
                        throw deleteError;
                    }
                    console.log('Successfully deleted slots:', slotsToDelete.length);
                }
            }
        }

        if (slots.length === 0) {
            return [];
        }

        // 새로운 슬롯 추가 전에 기존 슬롯 조회 (시간 기준)
        const slotsToInsert = [];

        for (const slot of slots) {
            // 클라이언트에서 전달된 ISO 시간을 사용하거나, 기존 방식으로 fallback
            const startTime = slot.startDateTime || `${slot.date} ${slot.startTime}:00`;
            const endTime = slot.endDateTime || `${slot.date} ${slot.endTime}:00`;

            console.log(`Processing slot - startDateTime: ${slot.startDateTime}, fallback: ${slot.date} ${slot.startTime}:00`);
            console.log(`Final startTime: ${startTime}, endTime: ${endTime}`);

            // 이미 존재하는 슬롯인지 확인 (같은 시간대)
            const { data: existingSlot, error: checkError } = await supabase
                .from('interview_slots')
                .select('id')
                .eq('company_id', companyId)
                .eq('start_time', startTime)
                .maybeSingle();

            console.log(`Checking slot ${startTime}:`, existingSlot);

            // 존재하지 않는 경우에만 추가
            if (!existingSlot) {
                slotsToInsert.push({
                    company_id: companyId,
                    start_time: startTime,
                    end_time: endTime,
                    interview_type: slot.interviewType,
                    is_available: true,
                    max_capacity: slot.maxCapacity || 1,
                    current_capacity: 0
                });
            } else if (existingSlot && slot.maxCapacity) {
                // 기존 슬롯이 있고 maxCapacity를 변경하려는 경우
                // 현재 예약 수 확인
                const { count: bookingCount } = await supabase
                    .from('interview_schedules')
                    .select('id', { count: 'exact' })
                    .eq('interview_slot_id', existingSlot.id)
                    .eq('status', 'confirmed');
                
                const currentBookings = bookingCount || 0;
                
                // 예약 수보다 작게 설정할 수 없음
                if (slot.maxCapacity < currentBookings) {
                    console.log(`Cannot reduce capacity below current bookings: ${currentBookings}`);
                    continue;
                }
                
                // max_capacity 업데이트
                const { error: updateError } = await supabase
                    .from('interview_slots')
                    .update({ 
                        max_capacity: slot.maxCapacity,
                        is_available: currentBookings < slot.maxCapacity
                    })
                    .eq('id', existingSlot.id);
                
                if (updateError) {
                    console.error('Failed to update slot capacity:', updateError);
                }
            }
        }

        console.log('Slots to insert:', slotsToInsert);

        // 새로운 슬롯이 있는 경우에만 추가
        if (slotsToInsert.length > 0) {
            const { data, error } = await supabase
                .from('interview_slots')
                .insert(slotsToInsert)
                .select();

            if (error) {
                console.error('Insert error:', error);
                throw error;
            }
            return data;
        }

        return [];
    } catch (error) {
        console.error('Interview slot creation error:', error);
        throw error;
    }
};

exports.deleteByDate = async (companyId, date) => {
    try {
        console.log(`Deleting slots for date: ${date}`);

        // 1. 먼저 해당 날짜의 모든 슬롯을 조회
        const { data: existingSlots } = await supabase
            .from('interview_slots')
            .select('id, start_time')
            .eq('company_id', companyId)
            .gte('start_time', `${date} 00:00:00`)
            .lt('start_time', `${date} 23:59:59`);

        console.log('Existing slots to check:', existingSlots);

        if (existingSlots && existingSlots.length > 0) {
            const existingSlotIds = existingSlots.map(s => s.id);

            // 2. 스케줄이 있는 슬롯 ID들을 조회 (모든 상태 포함)
            const { data: bookedSchedules } = await supabase
                .from('interview_schedules')
                .select('interview_slot_id, status')
                .in('interview_slot_id', existingSlotIds);

            const bookedSlotIds = bookedSchedules?.map(s => s.interview_slot_id) || [];
            console.log('참조가 있는 슬롯들:', bookedSchedules);
            console.log('삭제할 수 없는 슬롯 IDs:', bookedSlotIds);

            // 3. 참조가 없는 슬롯만 찾아서 삭제
            const slotsToDelete = existingSlotIds.filter(id => !bookedSlotIds.includes(id));
            console.log('삭제할 슬롯 IDs:', slotsToDelete);

            if (slotsToDelete.length > 0) {
                const { error } = await supabase
                    .from('interview_slots')
                    .delete()
                    .in('id', slotsToDelete);

                if (error) {
                    console.error('Delete error:', error);
                    throw error;
                }
                console.log('Successfully deleted slots');
            } else {
                console.log('No slots to delete (all have references)');
            }
        }

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
            .gt('start_time', new Date().toISOString())
            .order('start_time', { ascending: true });

        if (error) throw error;

        // 슬롯이 없으면 빈 배열 반환
        if (!slots || slots.length === 0) {
            return [];
        }

        // 예약된 슬롯별 예약 수 조회 (confirmed 상태만)
        const slotIds = slots.map(s => s.id);

        const { data: bookedSchedules } = await supabase
            .from('interview_schedules')
            .select('interview_slot_id')
            .eq('status', 'confirmed')
            .in('interview_slot_id', slotIds);

        // 슬롯별 예약 수 계산
        const bookingCountMap = {};
        bookedSchedules?.forEach(schedule => {
            bookingCountMap[schedule.interview_slot_id] = 
                (bookingCountMap[schedule.interview_slot_id] || 0) + 1;
        });

        // 각 슬롯에 예약 정보 추가
        const slotsWithBookingStatus = slots.map(slot => {
            const currentBookings = bookingCountMap[slot.id] || 0;
            const maxCapacity = slot.max_capacity || 1;
            
            return {
                ...slot,
                current_capacity: currentBookings,
                max_capacity: maxCapacity,
                is_booked: currentBookings >= maxCapacity,
                available_spots: maxCapacity - currentBookings
            };
        });

        return slotsWithBookingStatus;
    } catch (error) {
        console.error('Interview slot retrieval error:', error);
        throw error;
    }
};