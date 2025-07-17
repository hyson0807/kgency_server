// services/interviewProposal.service.js
const { supabase } = require('../config/database');

exports.createProposal = async (applicationId, companyId, location) => {
    try {
        // 이미 제안이 있는지 확인
        const { data: existing } = await supabase
            .from('interview_proposals')
            .select('id')
            .eq('application_id', applicationId)
            .single();

        if (existing) {
            throw new Error('이미 면접 제안이 존재합니다.');
        }

        // 면접 제안 생성
        const { data, error } = await supabase
            .from('interview_proposals')
            .insert({
                application_id: applicationId,
                company_id: companyId,
                location: location,
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Interview proposal creation error:', error);
        throw error;
    }
};

exports.getProposalByApplication = async (applicationId) => {

    try {
        const { data, error } = await supabase
            .from('interview_proposals')
            .select(`
                * 
            `)
            .eq('application_id', applicationId)
            .single();



        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
        return data;
    } catch (error) {
        console.error('Interview proposal fetch error:', error);
        throw error;
    }
};

exports.getAvailableSlots = async (companyId) => {
    try {
        console.log('Getting slots for company:', companyId);

        // 회사의 모든 슬롯 조회
        const { data: slots, error: slotsError } = await supabase
            .from('interview_slots')
            .select('*')
            .eq('company_id', companyId)
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true });

        if (slotsError) throw slotsError;

        console.log('Total slots found:', slots?.length || 0);

        if (!slots || slots.length === 0) {
            return [];
        }

        // 해당 회사의 슬롯 ID들만 추출
        const slotIds = slots.map(s => s.id);

        // 해당 슬롯들 중 예약된 것만 조회
        const { data: bookedSchedules, error: bookedError } = await supabase
            .from('interview_schedules')
            .select('interview_slot_id')
            .in('interview_slot_id', slotIds)  // 해당 회사의 슬롯만 체크
            .eq('status', 'confirmed');

        if (bookedError) throw bookedError;

        const bookedSlotIds = new Set(bookedSchedules?.map(s => s.interview_slot_id) || []);

        // 예약되지 않은 슬롯만 필터링
        const availableSlots = slots.filter(slot => !bookedSlotIds.has(slot.id));

        console.log('Available slots after filtering:', availableSlots.length);

        return availableSlots;
    } catch (error) {
        console.error('Available slots fetch error:', error);
        throw error;
    }
};