const userKeywordService = require('../services/userKeyword.service');



exports.getUserKeywordByUserId = async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        const data = await userKeywordService.getUserKeywords(userId);

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Get user keywords error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user keywords',
            error: error.message
        });
    }

}