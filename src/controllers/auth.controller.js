const authService = require('../services/auth.service');

// OTP 발송
const sendOTP = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: '전화번호를 입력해주세요.'
            });
        }

        const result = await authService.sendOTP(phone);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('OTP 발송 실패:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// OTP 검증 및 로그인/회원가입
const verifyOTP = async (req, res) => {
    try {
        const { phone, otp, userType, isDemoAccount } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                error: '전화번호와 OTP를 입력해주세요.'
            });
        }

        const result = await authService.verifyOTP(phone, otp, userType, isDemoAccount);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('OTP 검증 실패:', error);

        // 에러 타입에 따른 응답
        if (error.message?.includes('duplicate key')) {
            res.status(400).json({
                success: false,
                error: '이미 등록된 전화번호입니다'
            });
        } else if (error.message?.includes('구직자 계정입니다') ||
            error.message?.includes('구인자 계정입니다')) {
            // 계정 타입 불일치 에러 처리 추가
            res.status(400).json({
                success: false,
                error: error.message
            });
        } else if (error.message?.includes('OTP')) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        } else {
            res.status(500).json({
                success: false,
                error: '인증 처리 중 오류가 발생했습니다'
            });
        }
    }
};


// 회원 탈퇴
const deleteAccount = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await authService.deleteAccount(userId);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('회원 탈퇴 실패:', error);
        res.status(500).json({
            success: false,
            error: '회원 탈퇴 처리 중 오류가 발생했습니다.'
        });
    }
};

module.exports = {
    sendOTP,
    verifyOTP,
    deleteAccount
};