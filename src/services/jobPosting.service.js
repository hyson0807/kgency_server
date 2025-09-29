const { supabase } = require('../config/database');

exports.getActiveJobPostings = async () => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .select(`
                *,
                company:company_id (
                    id,
                    name,
                    address,
                    phone_number
                ),
                job_posting_keywords:job_posting_keyword (
                    keyword:keyword_id (
                        id,
                        keyword,
                        category
                    )
                )
            `)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data || [];
    } catch (error) {
        console.error('Get active job postings service error:', error);
        throw error;
    }
};

exports.getJobPostingById = async (postingId) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .select(`
                *,
                company:company_id (
                    id,
                    name,
                    address,
                    phone_number
                ),
                job_posting_keywords:job_posting_keyword (
                    keyword:keyword_id (
                        id,
                        keyword,
                        category
                    )
                )
            `)
            .eq('id', postingId)
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Get job posting by id service error:', error);
        throw error;
    }
};

exports.createJobPosting = async (jobPostingData) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .insert(jobPostingData)
            .select()
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Create job posting service error:', error);
        throw error;
    }
};

exports.updateJobPosting = async (postingId, jobPostingData) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .update(jobPostingData)
            .eq('id', postingId)
            .select()
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Update job posting service error:', error);
        throw error;
    }
};

exports.getCompanyJobPostingsWithStatus = async (companyId, jobSeekerId) => {
    try {
        // 회사 공고 목록 가져오기
        const { data: jobPostings, error: jobError } = await supabase
            .from('job_postings')
            .select('id, title')
            .eq('company_id', companyId)
            .eq('is_active', true)
            .is('deleted_at', null);

        if (jobError) throw jobError;

        // 구직자의 기존 지원서 확인
        const { data: existingApplications, error: appError } = await supabase
            .from('applications')
            .select('job_posting_id')
            .eq('user_id', jobSeekerId)
            .eq('company_id', companyId)
            .is('deleted_at', null);

        if (appError) throw appError;

        const appliedJobPostingIds = new Set(existingApplications?.map(app => app.job_posting_id) || []);

        // 공고에 지원 여부 정보 추가
        const jobPostingsWithStatus = (jobPostings || []).map(posting => ({
            ...posting,
            hasExistingApplication: appliedJobPostingIds.has(posting.id)
        }));

        return jobPostingsWithStatus;
    } catch (error) {
        console.error('Get company job postings with status service error:', error);
        throw error;
    }
};


exports.getCompanyJobPostings = async (companyId) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .select(`
                *,
                applications (
                    id
                ),
                job_posting_keywords:job_posting_keyword (
                    keyword:keyword_id (
                        keyword,
                        category
                    )
                )
            `)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data || [];
    } catch (error) {
        console.error('Get company job postings service error:', error);
        throw error;
    }
};

exports.toggleJobPostingActive = async (postingId, isActive) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .update({ is_active: isActive })
            .eq('id', postingId)
            .select()
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Toggle job posting active service error:', error);
        throw error;
    }
};

exports.deleteJobPosting = async (postingId) => {
    try {
        // 1. Update related applications status to 'reviewed'
        const { error: appUpdateError } = await supabase
            .from('applications')
            .update({
                status: 'reviewed',
                reviewed_at: new Date().toISOString()
            })
            .eq('job_posting_id', postingId);

        if (appUpdateError) {
            console.error('Update applications status error:', appUpdateError);
        }

        // 2. Soft delete related applications
        const { error: appDeleteError } = await supabase
            .from('applications')
            .update({ deleted_at: new Date().toISOString() })
            .eq('job_posting_id', postingId);

        if (appDeleteError) {
            console.error('Soft delete applications error:', appDeleteError);
        }

        // 3. Handle related messages
        const { data: applications } = await supabase
            .from('applications')
            .select('message_id')
            .eq('job_posting_id', postingId)
            .not('message_id', 'is', null);

        if (applications && applications.length > 0) {
            const messageIds = applications.map(app => app.message_id).filter(Boolean);

            await supabase
                .from('messages')
                .update({ is_deleted: true })
                .in('id', messageIds);
        }

        // 4. Delete interview proposals
        const { data: relatedApplications } = await supabase
            .from('applications')
            .select('id')
            .eq('job_posting_id', postingId);

        if (relatedApplications && relatedApplications.length > 0) {
            const applicationIds = relatedApplications.map(app => app.id);
            
            const { error: proposalDeleteError } = await supabase
                .from('interview_proposals')
                .delete()
                .in('application_id', applicationIds);

            if (proposalDeleteError) {
                console.error('Delete interview proposals error:', proposalDeleteError);
            }
        }

        // 5. Soft delete the job posting
        const { error: deleteError } = await supabase
            .from('job_postings')
            .update({
                is_active: false,
                deleted_at: new Date().toISOString()
            })
            .eq('id', postingId);

        if (deleteError) throw deleteError;

        return true;
    } catch (error) {
        console.error('Delete job posting service error:', error);
        throw error;
    }
};