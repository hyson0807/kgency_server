// services/interviewSchedule.service.js
const { supabase } = require('../config/database');

exports.createSchedule = async (proposalId, interviewSlotId) => {
    try {
        // 트랜잭션으로 처리
        // 1. 선택된 슬롯이 아직 사용 가능한지 확인
        const { data: slot, error: slotError } = await supabase
            .from('interview_slots')
            .select('*')
            .eq('id', interviewSlotId)
            .eq('is_available', true)
            .single();

        if (slotError || !slot) {
            throw new Error('선택한 시간대를 사용할 수 없습니다.');
        }

        // 2. 이미 해당 슬롯에 confirmed된 일정이 있는지 확인
        const { data: existingSchedule } = await supabase
            .from('interview_schedules')
            .select('id')
            .eq('interview_slot_id', interviewSlotId)
            .eq('status', 'confirmed')
            .single();

        if (existingSchedule) {
            throw new Error('이미 예약된 시간대입니다.');
        }

        // 3. 면접 일정 생성
        const { data: schedule, error: scheduleError } = await supabase
            .from('interview_schedules')
            .insert({
                proposal_id: proposalId,
                interview_slot_id: interviewSlotId,
                status: 'confirmed'
            })
            .select()
            .single();

        if (scheduleError) throw scheduleError;

        // 4. proposal 상태 업데이트
        const { error: proposalError } = await supabase
            .from('interview_proposals')
            .update({ status: 'scheduled' })
            .eq('id', proposalId);

        if (proposalError) throw proposalError;

        return schedule;
    } catch (error) {
        console.error('Interview schedule creation error:', error);
        throw error;
    }
};

exports.getScheduleByProposal = async (proposalId) => {
    try {
        const { data, error } = await supabase
            .from('interview_schedules')
            .select(`
                *,
                interview_slot:interview_slots (
                    id,
                    start_time,
                    end_time,
                    interview_type
                ),
                proposal:interview_proposals (
                    id,
                    location,
                    company_id
                )
            `)
            .eq('proposal_id', proposalId)
            .eq('status', 'confirmed')
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    } catch (error) {
        console.error('Get schedule by proposal error:', error);
        throw error;
    }
};