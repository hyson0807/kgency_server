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
        console.log('Looking for interview schedule with proposal_id:', proposalId);
        
        // 먼저 해당 proposal_id로 모든 레코드를 확인
        const { data: allSchedules } = await supabase
            .from('interview_schedules')
            .select('*')
            .eq('proposal_id', proposalId);
            
        console.log('All schedules for proposal_id', proposalId, ':', allSchedules);
        
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
            
        console.log('Interview schedule query result:', { data, error });

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

        console.log(`getCompanySchedules: Found ${data?.length || 0} total schedules`);
        console.log(`getCompanySchedules: Filtering for company ${companyId}, month ${month}`);

        // 필터링 및 정렬을 JavaScript에서 처리
        const validSchedules = (data || [])
            .filter(schedule => {
                if (!schedule.interview_slot || 
                    !schedule.proposal || 
                    !schedule.proposal.application || 
                    schedule.interview_slot.company_id !== companyId) {
                    return false;
                }
                
                // 날짜 비교를 더 안전하게 처리
                const slotDate = new Date(schedule.interview_slot.start_time);
                const monthStart = new Date(`${startDate}T00:00:00`);
                const monthEnd = new Date(`${endDate}T23:59:59`);
                
                return slotDate >= monthStart && slotDate <= monthEnd;
            })
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
            .filter(schedule => {
                if (!schedule.interview_slot || 
                    !schedule.proposal || 
                    !schedule.proposal.application || 
                    schedule.interview_slot.company_id !== companyId) {
                    return false;
                }
                
                // 날짜 비교를 더 안전하게 처리
                const slotDate = new Date(schedule.interview_slot.start_time);
                const dayStart = new Date(`${date}T00:00:00`);
                const dayEnd = new Date(`${date}T23:59:59`);
                
                return slotDate >= dayStart && slotDate <= dayEnd;
            })
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
                            working_hours,
                            interview_location
                        )
                    )
                )
            `)
            .eq('status', 'confirmed')
            .eq('proposal.application.user_id', userId);

        if (error) throw error;

        console.log(`getUserSchedules: Found ${data?.length || 0} total schedules`);
        console.log(`getUserSchedules: Filtering for user ${userId}, month ${month}`);

        // 날짜 필터링 및 정렬
        const validSchedules = (data || [])
            .filter(schedule => {
                if (!schedule.interview_slot || 
                    !schedule.proposal || 
                    !schedule.proposal.application || 
                    schedule.proposal.application.user_id !== userId) {
                    return false;
                }
                
                // 날짜 비교를 더 안전하게 처리
                const slotDate = new Date(schedule.interview_slot.start_time);
                const monthStart = new Date(`${startDate}T00:00:00`);
                const monthEnd = new Date(`${endDate}T23:59:59`);
                
                return slotDate >= monthStart && slotDate <= monthEnd;
            })
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
            .filter(schedule => {
                if (!schedule.interview_slot || 
                    !schedule.proposal || 
                    !schedule.proposal.application || 
                    schedule.proposal.application.user_id !== userId) {
                    return false;
                }
                
                // 날짜 비교를 더 안전하게 처리
                const slotDate = new Date(schedule.interview_slot.start_time);
                const dayStart = new Date(`${date}T00:00:00`);
                const dayEnd = new Date(`${date}T23:59:59`);
                
                return slotDate >= dayStart && slotDate <= dayEnd;
            })
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
        // 권한 확인을 위해 먼저 조회 (상세 정보 포함)
        const { data: schedule, error: fetchError } = await supabase
            .from('interview_schedules')
            .select(`
                *,
                interview_slot:interview_slots!interview_schedules_interview_slot_id_fkey (
                    id,
                    company_id,
                    start_time,
                    end_time
                ),
                proposal:interview_proposals!interview_schedules_proposal_id_fkey (
                    id,
                    application:applications!interview_proposals_application_id_fkey (
                        id,
                        user_id,
                        type,
                        user:profiles!applications_user_id_fkey (
                            id,
                            name
                        ),
                        job_posting:job_postings!applications_job_posting_id_fkey (
                            id,
                            title,
                            company:profiles!job_postings_company_id_fkey (
                                id,
                                name
                            )
                        )
                    )
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

        // application type에 따라 다른 처리
        const applicationType = schedule.proposal?.application?.type;
        
        // 면접 일정 상태 업데이트
        const { error: updateError } = await supabase
            .from('interview_schedules')
            .update({ status: 'cancelled' })
            .eq('id', scheduleId);

        if (updateError) throw updateError;



        if (applicationType === 'user_initiated') {
            // user_initiated인 경우: 기존 방식 그대로 proposal을 pending으로 변경
            const { error: proposalError } = await supabase
                .from('interview_proposals')
                .update({ status: 'pending' })
                .eq('id', schedule.proposal_id);

            if (proposalError) throw proposalError;
        } else if (applicationType === 'user_instant_interview' || applicationType === 'company_invited') {

            // application 삭제
            const { error: applicationError } = await supabase
                .from('applications')
                .delete()
                .eq('id', schedule.proposal.application.id);

            if (applicationError) throw applicationError;

            // user_instant_interview 또는 company_invited인 경우: proposal을 삭제
            const { error: proposalDeleteError } = await supabase
                .from('interview_proposals')
                .delete()
                .eq('id', schedule.proposal_id);

            if (proposalDeleteError) throw proposalDeleteError;
        }

        // 알림 발송을 위한 데이터 준비
        if (schedule.proposal?.application) {
            const { application } = schedule.proposal;
            const userId = application.user_id;
            const companyName = application.job_posting?.company?.name || '회사';
            const jobTitle = application.job_posting?.title || '직책';
            
            // 면접 시간 포맷팅
            const interviewDate = new Date(schedule.interview_slot.start_time);
            const formattedDate = interviewDate.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // 유저에게 취소 알림 발송
            try {
                await notificationService.sendInterviewCancellationNotification(
                    userId,
                    companyName,
                    jobTitle,
                    formattedDate,
                    application.id
                );
                console.log('Interview cancellation notification sent to user');
            } catch (notificationError) {
                // 알림 발송 실패해도 취소는 성공으로 처리
                console.error('Failed to send cancellation notification:', notificationError);
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Cancel schedule error:', error);
        throw error;
    }
};