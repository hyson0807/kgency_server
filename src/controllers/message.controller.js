const { supabase } = require('../config/database');

// 메시지 생성
const createMessage = async (req, res) => {
    try {
        const senderId = req.user.userId;
        const { receiverId, subject, content } = req.body;

        if (!receiverId || !subject || !content) {
            return res.status(400).json({
                success: false,
                error: 'receiverId, subject, content가 필요합니다.'
            });
        }

        // 메시지 저장
        const { data: message, error } = await supabase
            .from('messages')
            .insert({
                sender_id: senderId,
                receiver_id: receiverId,
                subject: subject,
                content: content
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            data: message,
            message: '메시지가 성공적으로 전송되었습니다.'
        });

    } catch (error) {
        console.error('메시지 생성 실패:', error);
        res.status(500).json({
            success: false,
            error: '메시지 생성에 실패했습니다.'
        });
    }
};

module.exports = {
    createMessage
};