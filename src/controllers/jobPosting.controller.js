const jobPostingService = require('../services/jobPosting.service');

exports.getActiveJobPostings = async (req, res) => {
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

exports.getJobPostingById = async (req, res) => {
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