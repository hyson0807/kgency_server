const { supabase } = require('../config/database');

const getJobPostingKeywords = async (jobPostingId) => {
    try {
        const { data, error } = await supabase
            .from('job_posting_keyword')
            .select(`
                keyword_id,
                keyword:keyword_id (
                    id,
                    keyword,
                    category
                )
            `)
            .eq('job_posting_id', jobPostingId);

        if (error) throw error;

        return data || [];
    } catch (error) {
        console.error('Error in getJobPostingKeywords:', error);
        throw error;
    }
};

const getJobPostingOwner = async (jobPostingId) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .select('id, company_id')
            .eq('id', jobPostingId)
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error in getJobPostingOwner:', error);
        throw error;
    }
};

const updateJobPostingKeywords = async (jobPostingId, keywordIds) => {
    try {
        // First, delete existing keywords for this job posting
        const { error: deleteError } = await supabase
            .from('job_posting_keyword')
            .delete()
            .eq('job_posting_id', jobPostingId);

        if (deleteError) throw deleteError;

        // Then, insert new keywords if any are provided
        if (keywordIds.length > 0) {
            const keywordInserts = keywordIds.map(keywordId => ({
                job_posting_id: jobPostingId,
                keyword_id: keywordId
            }));

            const { data, error: insertError } = await supabase
                .from('job_posting_keyword')
                .insert(keywordInserts)
                .select();

            if (insertError) throw insertError;

            return data;
        }

        return [];
    } catch (error) {
        console.error('Error in updateJobPostingKeywords:', error);
        throw error;
    }
};

const deleteJobPostingKeywords = async (jobPostingId) => {
    try {
        const { error } = await supabase
            .from('job_posting_keyword')
            .delete()
            .eq('job_posting_id', jobPostingId);

        if (error) throw error;

        return true;
    } catch (error) {
        console.error('Error in deleteJobPostingKeywords:', error);
        throw error;
    }
};

module.exports = {
    getJobPostingKeywords,
    getJobPostingOwner,
    updateJobPostingKeywords,
    deleteJobPostingKeywords
};