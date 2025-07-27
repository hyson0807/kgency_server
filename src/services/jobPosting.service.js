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
                    description,
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
                    description,
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