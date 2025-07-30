const jobSeekerService = require('../services/jobSeeker.service');

// 회사를 위한 매칭된 구직자 목록 조회
exports.getMatchedJobSeekers = async (req, res, next) => {
    try {
        const companyId = req.user.userId; // 인증된 회사 ID
        
        const result = await jobSeekerService.getMatchedJobSeekers(companyId);
        
        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        console.error('Error in getMatchedJobSeekers:', err);
        next(err);
    }
};