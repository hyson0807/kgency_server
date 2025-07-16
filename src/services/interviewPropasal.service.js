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
        // 회사의 모든 슬롯 조회
        const { data: slots, error: slotsError } = await supabase
            .from('interview_slots')
            .select('*')
            .eq('company_id', companyId)
            .eq('is_available', true)
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true });



        if (slotsError) throw slotsError;

        // 이미 예약된 슬롯 조회
        const { data: bookedSlots, error: bookedError } = await supabase
            .from('interview_schedules')
            .select('interview_slot_id')
            .eq('status', 'confirmed');

        if (bookedError) throw bookedError;

        const bookedSlotIds = bookedSlots.map(s => s.interview_slot_id);

        // 예약되지 않은 슬롯만 필터링
        const availableSlots = slots.filter(slot =>
            !bookedSlotIds.includes(slot.id)
        );

        return availableSlots;
    } catch (error) {
        console.error('Available slots fetch error:', error);
        throw error;
    }
};