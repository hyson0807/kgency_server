// services/interviewSchedule.service.js
const { supabase } = require('../config/database');
const notificationService = require('./notification.service');

exports.createSchedule = async (proposalId, interviewSlotId) => {
    try {
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
        const { data: existingConfirmedSchedule } = await supabase
            .from('interview_schedules')
            .select('id')
            .eq('interview_slot_id', interviewSlotId)
            .eq('status', 'confirmed')
            .single();

        if (existingConfirmedSchedule) {
            throw new Error('이미 예약된 시간대입니다.');
        }

        // 3. 해당 proposal에 대한 기존 schedule이 있는지 확인
        const { data: existingSchedule, error: checkError } = await supabase
            .from('interview_schedules')
            .select('*')
            .eq('proposal_id', proposalId)
            .single();

        let schedule;

        if (existingSchedule) {
            // 3-1. 기존 레코드가 있으면 업데이트 (cancelled 상태의 레코드 재사용)
            const { data: updatedSchedule, error: updateError } = await supabase
                .from('interview_schedules')
                .update({
                    interview_slot_id: interviewSlotId,
                    status: 'confirmed',
                    confirmed_at: new Date().toISOString()
                })
                .eq('id', existingSchedule.id)
                .select()
                .single();

            if (updateError) throw updateError;
            schedule = updatedSchedule;
        } else {
            // 3-2. 기존 레코드가 없으면 새로 생성
            const { data: newSchedule, error: scheduleError } = await supabase
                .from('interview_schedules')
                .insert({
                    proposal_id: proposalId,
                    interview_slot_id: interviewSlotId,
                    status: 'confirmed'
                })
                .select()
                .single();

            if (scheduleError) throw scheduleError;
            schedule = newSchedule;
        }

        // 4. proposal 상태 업데이트
        const { error: proposalError } = await supabase
            .from('interview_proposals')
            .update({ status: 'scheduled' })
            .eq('id', proposalId);

        if (proposalError) throw proposalError;

        // 5. 알림 발송을 위한 데이터 조회
        const { data: proposalData, error: proposalDataError } = await supabase
            .from('interview_proposals')
            .select(`
                *,
                application:applications (
                    id,
                    user:profiles!user_id (
                        id,
                        name
                    ),
                    job_posting:job_postings (
                        id,
                        title,
                        company:profiles!company_id (
                            id,
                            name
                        )
                    )
                )
            `)
            .eq('id', proposalId)
            .single();

        if (!proposalDataError && proposalData) {
            // 면접 시간 포맷팅
            const interviewDate = new Date(slot.start_time);
            const formattedDate = interviewDate.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // 회사에게 알림 발송
            try {
                await notificationService.sendInterviewScheduleConfirmationToCompany(
                    proposalData.company_id,
                    proposalData.application.user.name,
                    proposalData.application.job_posting.title,
                    formattedDate,
                    proposalData.application_id
                );
                console.log('Interview schedule notification sent to company');
            } catch (notificationError) {
                // 알림 발송 실패해도 스케줄 생성은 성공으로 처리
                console.error('Failed to send notification:', notificationError);
            }
        }

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

// services/interviewSchedule.service.js 수정
exports.getCompanySchedules = async (companyId, month) => {
    try {
        // 월의 시작일과 마지막일 계산
        const startDate = `${month}-01`;
        const year = parseInt(month.split('-')[0]);
        const monthNum = parseInt(month.split('-')[1]);
        const lastDay = new Date(year, monthNum, 0).getDate();
        const endDate = `${month}-${lastDay}`;

        const { data, error } = await supabase
            .from('interview_schedules')
            .select(`
                *,
                interview_slot:interview_slots!interview_schedules_interview_slot_id_fkey (
                    id,
                    start_time,
                    end_time,
                    interview_type,
                    company_id
                ),
                proposal:interview_proposals!interview_schedules_proposal_id_fkey (
                    id,
                    location,
                    application:applications!interview_proposals_application_id_fkey (
                        id,
                        user:profiles!applications_user_id_fkey (
                            id,
                            name,
                            phone_number
                        ),
                        job_posting:job_postings!applications_job_posting_id_fkey (
                            id,
                            title
                        )
                    )
                )
            `)
            .eq('status', 'confirmed');

        if (error) throw error;

        // 필터링 및 정렬을 JavaScript에서 처리
        const validSchedules = (data || [])
            .filter(schedule =>
                schedule.interview_slot &&
                schedule.proposal &&
                schedule.proposal.application &&
                schedule.interview_slot.company_id === companyId &&
                schedule.interview_slot.start_time >= `${startDate} 00:00:00` &&
                schedule.interview_slot.start_time <= `${endDate} 23:59:59`
            )
            .sort((a, b) =>
                new Date(a.interview_slot.start_time).getTime() -
                new Date(b.interview_slot.start_time).getTime()
            );

        return validSchedules;
    } catch (error) {
        console.error('Get company schedules error:', error);
        throw error;
    }
};

exports.getCompanySchedulesByDate = async (companyId, date) => {
    try {
        const { data, error } = await supabase
            .from('interview_schedules')
            .select(`
                *,
                interview_slot:interview_slots!interview_schedules_interview_slot_id_fkey (
                    id,
                    start_time,
                    end_time,
                    interview_type,
                    company_id
                ),
                proposal:interview_proposals!interview_schedules_proposal_id_fkey (
                    id,
                    location,
                    application:applications!interview_proposals_application_id_fkey (
                        id,
                        user:profiles!applications_user_id_fkey (
                            id,
                            name,
                            phone_number,
                            address
                        ),
                        job_posting:job_postings!applications_job_posting_id_fkey (
                            id,
                            title,
                            salary_range,
                            working_hours
                        )
                    )
                )
            `)
            .eq('status', 'confirmed');

        if (error) throw error;

        const validSchedules = (data || [])
            .filter(schedule =>
                schedule.interview_slot &&
                schedule.proposal &&
                schedule.proposal.application &&
                schedule.interview_slot.company_id === companyId &&
                schedule.interview_slot.start_time >= `${date} 00:00:00` &&
                schedule.interview_slot.start_time < `${date} 23:59:59`
            )
            .sort((a, b) =>
                new Date(a.interview_slot.start_time).getTime() -
                new Date(b.interview_slot.start_time).getTime()
            );

        return validSchedules;
    } catch (error) {
        console.error('Get company schedules by date error:', error);
        throw error;
    }
};


// services/interviewSchedule.service.js에 추가
exports.getUserSchedules = async (userId, month) => {
    try {
        // 월의 시작일과 마지막일 계산
        const startDate = `${month}-01`;
        const year = parseInt(month.split('-')[0]);
        const monthNum = parseInt(month.split('-')[1]);
        const lastDay = new Date(year, monthNum, 0).getDate();
        const endDate = `${month}-${lastDay}`;

        const { data, error } = await supabase
            .from('interview_schedules')
            .select(`
                *,
                interview_slot:interview_slots!interview_schedules_interview_slot_id_fkey (
                    id,
                    start_time,
                    end_time,
                    interview_type,
                    company:profiles!interview_slots_company_id_fkey (
                        id,
                        name,
                        address
                    )
                ),
                proposal:interview_proposals!interview_schedules_proposal_id_fkey (
                    id,
                    location,
                    application:applications!interview_proposals_application_id_fkey (
                        id,
                        user_id,
                        job_posting:job_postings!applications_job_posting_id_fkey (
                            id,
                            title,
                            salary_range,
                            working_hours
                        )
                    )
                )
            `)
            .eq('status', 'confirmed')
            .eq('proposal.application.user_id', userId);

        if (error) throw error;

        // 날짜 필터링 및 정렬
        const validSchedules = (data || [])
            .filter(schedule =>
                schedule.interview_slot &&
                schedule.proposal &&
                schedule.proposal.application &&
                schedule.proposal.application.user_id === userId &&
                schedule.interview_slot.start_time >= `${startDate} 00:00:00` &&
                schedule.interview_slot.start_time <= `${endDate} 23:59:59`
            )
            .sort((a, b) =>
                new Date(a.interview_slot.start_time).getTime() -
                new Date(b.interview_slot.start_time).getTime()
            );

        return validSchedules;
    } catch (error) {
        console.error('Get user schedules error:', error);
        throw error;
    }
};

exports.getUserSchedulesByDate = async (userId, date) => {
    try {
        const { data, error } = await supabase
            .from('interview_schedules')
            .select(`
                *,
                interview_slot:interview_slots!interview_schedules_interview_slot_id_fkey (
                    id,
                    start_time,
                    end_time,
                    interview_type,
                    company:profiles!interview_slots_company_id_fkey (
                        id,
                        name,
                        address,
                        phone_number
                    )
                ),
                proposal:interview_proposals!interview_schedules_proposal_id_fkey (
                    id,
                    location,
                    application:applications!interview_proposals_application_id_fkey (
                        id,
                        user_id,
                        job_posting:job_postings!applications_job_posting_id_fkey (
                            id,
                            title,
                            salary_range,
                            working_hours,
                            description
                        )
                    )
                )
            `)
            .eq('status', 'confirmed')
            .eq('proposal.application.user_id', userId);

        if (error) throw error;

        const validSchedules = (data || [])
            .filter(schedule =>
                schedule.interview_slot &&
                schedule.proposal &&
                schedule.proposal.application &&
                schedule.proposal.application.user_id === userId &&
                schedule.interview_slot.start_time >= `${date} 00:00:00` &&
                schedule.interview_slot.start_time < `${date} 23:59:59`
            )
            .sort((a, b) =>
                new Date(a.interview_slot.start_time).getTime() -
                new Date(b.interview_slot.start_time).getTime()
            );

        return validSchedules;
    } catch (error) {
        console.error('Get user schedules by date error:', error);
        throw error;
    }
};




// 면접 일정 취소
exports.cancelSchedule = async (scheduleId, companyId) => {
    try {
        // 권한 확인을 위해 먼저 조회
        const { data: schedule, error: fetchError } = await supabase
            .from('interview_schedules')
            .select(`
                *,
                interview_slot:interview_slots!interview_schedules_interview_slot_id_fkey (
                    company_id
                )
            `)
            .eq('id', scheduleId)
            .single();

        if (fetchError || !schedule) {
            throw new Error('면접 일정을 찾을 수 없습니다.');
        }

        // 회사 권한 확인
        if (schedule.interview_slot.company_id !== companyId) {
            throw new Error('권한이 없습니다.');
        }

        // 면접 일정 상태 업데이트
        const { error: updateError } = await supabase
            .from('interview_schedules')
            .update({ status: 'cancelled' })
            .eq('id', scheduleId);

        if (updateError) throw updateError;

        // proposal 상태도 다시 pending으로 변경
        const { error: proposalError } = await supabase
            .from('interview_proposals')
            .update({ status: 'pending' })
            .eq('id', schedule.proposal_id);

        if (proposalError) throw proposalError;

        return { success: true };
    } catch (error) {
        console.error('Cancel schedule error:', error);
        throw error;
    }
};