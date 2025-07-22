const jobPostingKeywordService = require('../services/jobPostingKeyword.service');

const getJobPostingKeywords = async (req, res) => {
    try {
        const { jobPostingId } = req.params;
        
        if (!jobPostingId) {
            return res.status(400).json({
                success: false,
                message: 'Job posting ID is required'
            });
        }

        const keywords = await jobPostingKeywordService.getJobPostingKeywords(jobPostingId);
        
        res.status(200).json({
            success: true,
            data: keywords
        });
    } catch (error) {
        console.error('Error fetching job posting keywords:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch job posting keywords'
        });
    }
};

const updateJobPostingKeywords = async (req, res) => {
    try {
        const { jobPostingId } = req.params;
        const { keywordIds } = req.body;
        const companyId = req.user.userId;

        if (!jobPostingId) {
            return res.status(400).json({
                success: false,
                message: 'Job posting ID is required'
            });
        }

        if (!Array.isArray(keywordIds)) {
            return res.status(400).json({
                success: false,
                message: 'Keyword IDs must be an array'
            });
        }

        // Verify the job posting belongs to the authenticated company
        const jobPosting = await jobPostingKeywordService.getJobPostingOwner(jobPostingId);
        if (!jobPosting || jobPosting.company_id !== companyId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You can only update keywords for your own job postings'
            });
        }

        const result = await jobPostingKeywordService.updateJobPostingKeywords(jobPostingId, keywordIds);
        
        res.status(200).json({
            success: true,
            message: 'Job posting keywords updated successfully',
            data: result
        });
    } catch (error) {
        console.error('Error updating job posting keywords:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update job posting keywords'
        });
    }
};

const deleteJobPostingKeywords = async (req, res) => {
    try {
        const { jobPostingId } = req.params;
        const companyId = req.user.userId;

        if (!jobPostingId) {
            return res.status(400).json({
                success: false,
                message: 'Job posting ID is required'
            });
        }

        // Verify the job posting belongs to the authenticated company
        const jobPosting = await jobPostingKeywordService.getJobPostingOwner(jobPostingId);
        if (!jobPosting || jobPosting.company_id !== companyId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You can only delete keywords for your own job postings'
            });
        }

        await jobPostingKeywordService.deleteJobPostingKeywords(jobPostingId);
        
        res.status(200).json({
            success: true,
            message: 'Job posting keywords deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting job posting keywords:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete job posting keywords'
        });
    }
};

module.exports = {
    getJobPostingKeywords,
    updateJobPostingKeywords,
    deleteJobPostingKeywords
};