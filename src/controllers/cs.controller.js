// CS 채팅방 생성 또는 조회
exports.getOrCreateCSChatRoom = async (req, res) => {
    // 지연 로딩: 함수 실행 시점에 로드
    const csService = require('../services/cs.service');

    try {
        const userId = req.user.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: '사용자 정보를 찾을 수 없습니다.'
            });
        }

        const result = await csService.getOrCreateCSChatRoom(userId);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('CS 채팅방 생성/조회 실패:', error);
        res.status(500).json({
            success: false,
            error: 'CS 문의를 시작할 수 없습니다.'
        });
    }
};