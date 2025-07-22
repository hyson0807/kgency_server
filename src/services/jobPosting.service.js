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