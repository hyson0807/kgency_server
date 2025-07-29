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

// 메시지 읽음 표시
const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        if (!id) {
            return res.status(400).json({
                success: false,
                error: '메시지 ID가 필요합니다.'
            });
        }

        // 메시지가 수신자의 것인지 확인
        const { data: message } = await supabase
            .from('messages')
            .select('receiver_id')
            .eq('id', id)
            .single();

        if (!message || message.receiver_id !== userId) {
            return res.status(403).json({
                success: false,
                error: '권한이 없습니다.'
            });
        }

        // 읽음 표시
        const { error } = await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: '메시지를 읽음으로 표시했습니다.'
        });

    } catch (error) {
        console.error('메시지 읽음 표시 실패:', error);
        res.status(500).json({
            success: false,
            error: '메시지 읽음 표시에 실패했습니다.'
        });
    }
};

module.exports = {
    createMessage,
    markAsRead
};