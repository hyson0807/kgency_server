const jobPostingService = require('../services/jobPosting.service');

const getActiveJobPostings = async (req, res) => {
    try {
        const data = await jobPostingService.getActiveJobPostings();

        res.status(200).json({
            success: true,
            data,
            count: data.length
        });
    } catch (error) {
        console.error('Get active job postings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch job postings',
            error: error.message
        });
    }
};

const getJobPostingById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Job posting ID is required'
            });
        }

        const data = await jobPostingService.getJobPostingById(id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Job posting not found'
            });
        }

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Get job posting by id error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch job posting',
            error: error.message
        });
    }
};

const createJobPosting = async (req, res) => {
    try {
        const companyId = req.user.userId;
        const jobPostingData = {
            ...req.body,
            company_id: companyId
        };

        const data = await jobPostingService.createJobPosting(jobPostingData);

        res.status(201).json({
            success: true,
            data,
            message: 'Job posting created successfully'
        });
    } catch (error) {
        console.error('Create job posting error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create job posting',
            error: error.message
        });
    }
};

const updateJobPosting = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.userId;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Job posting ID is required'
            });
        }

        // Verify ownership
        const existingPosting = await jobPostingService.getJobPostingById(id);
        if (!existingPosting || existingPosting.company_id !== companyId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You can only update your own job postings'
            });
        }

        const jobPostingData = {
            ...req.body,
            updated_at: new Date().toISOString()
        };

        const data = await jobPostingService.updateJobPosting(id, jobPostingData);

        res.status(200).json({
            success: true,
            data,
            message: 'Job posting updated successfully'
        });
    } catch (error) {
        console.error('Update job posting error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update job posting',
            error: error.message
        });
    }
};

module.exports = {
    getActiveJobPostings,
    getJobPostingById,
    createJobPosting,
    updateJobPosting
};