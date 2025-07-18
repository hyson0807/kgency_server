
const applicationService = require('../services/application.service');




exports.getApplicationsByUserId = async (req, res, next) => {

    try {
        const { userId } = req.params;



        const result = await applicationService.getApplication(userId)

        console.log(result);

        res.json({
            success: true,
            data: result
        })
    } catch (err) {
        next(err);
    }
}

exports.getApplicationByPostingId = async (req, res, next) => {
    try {
        const { jobPostingId } = req.params;

        if (! jobPostingId) {
            return res.status(400).json({
                success: false,
                message: '공고 ID가 필요합니다.'
            });
        }

        const result = await applicationService.getApplicationsByPosting(jobPostingId);

        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        console.error('Get applications by posting error:', err);
        next(err);
    }
}