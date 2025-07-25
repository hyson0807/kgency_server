// services/interviewProposal.service.js
const { supabase } = require('../config/database');
const notificationService = require('./notification.service');

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

        // Get application details to send notification
        const { data: application, error: appError } = await supabase
            .from('applications')
            .select(`
                user_id,
                type,
                job_postings!inner(
                    title,
                    profiles!inner(name)
                )
            `)
            .eq('id', applicationId)
            .single();

        if (!appError && application && application.type !== 'user_instant_interview') {
            // Send push notification to the user
            await notificationService.sendInterviewProposalNotification(
                application.user_id,
                application.job_postings.profiles.name,
                application.job_postings.title,
                applicationId
            );
        }

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
                *,
                applications!inner(
                    job_posting_id,
                    job_postings!inner(
                        special_notes
                    )
                )
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

exports.deleteProposal = async (applicationId) => {
    try {
        // 1. 먼저 해당 application 정보 조회
        const { data: application, error: appError } = await supabase
            .from('applications')
            .select('id, type')
            .eq('id', applicationId)
            .single();

        if (appError || !application) {
            throw new Error('지원서를 찾을 수 없습니다.');
        }

        // 2. 해당 application의 interview_proposal 조회
        const { data: proposal, error: proposalFindError } = await supabase
            .from('interview_proposals')
            .select('id')
            .eq('application_id', applicationId)
            .single();

        if (proposalFindError || !proposal) {
            throw new Error('면접 제안을 찾을 수 없습니다.');
        }

        // 3. interview_schedules 삭제 (외래키 제약조건 때문에 먼저 삭제)
        const { data: deletedSchedules, error: scheduleError } = await supabase
            .from('interview_schedules')
            .delete()
            .eq('proposal_id', proposal.id)
            .select();

        if (scheduleError) {
            console.error('Interview schedules 삭제 실패:', scheduleError);
            // 스케줄이 없을 수도 있으므로 에러를 무시하고 진행
        }

        // 4. interview_proposals 삭제
        const { data: deletedProposal, error: proposalError } = await supabase
            .from('interview_proposals')
            .delete()
            .eq('application_id', applicationId)
            .select()
            .single();

        if (proposalError) {
            console.error('Interview proposal 삭제 실패:', proposalError);
            throw new Error('면접 제안 삭제에 실패했습니다.');
        }

        let deletedApplication = null;

        // 5. type이 company_invited인 경우 application도 삭제
        if (application.type === 'company_invited') {
            const { data: deletedApp, error: deleteAppError } = await supabase
                .from('applications')
                .delete()
                .eq('id', applicationId)
                .select()
                .single();

            if (deleteAppError) {
                console.error('Application 삭제 실패:', deleteAppError);
                throw new Error('지원서 삭제에 실패했습니다.');
            }

            deletedApplication = deletedApp;
        }

        return {
            success: true,
            message: application.type === 'company_invited'
                ? '면접 제안과 지원서가 삭제되었습니다.'
                : '면접 제안이 취소되었습니다.',
            deletedProposal,
            deletedApplication,
            deletedSchedules: deletedSchedules || []
        };
    } catch (error) {
        console.error('Delete proposal service error:', error);
        throw error;
    }
}