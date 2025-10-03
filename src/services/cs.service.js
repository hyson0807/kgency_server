const { supabase } = require('../config/database');

// CS 계정 ID (고정값)
const CS_ACCOUNT_ID = 'a0000000-0000-4000-8000-000000000001';
const CS_INITIAL_MESSAGE = '안녕하세요! K-gency 고객센터입니다.\n궁금하신 사항을 말씀해주시면 친절하게 답변드리겠습니다.';

/**
 * CS 문의 채팅방 생성 또는 조회
 * @param {string} userId - 현재 사용자 ID
 * @returns {Promise<{roomId: string}>}
 */
const getOrCreateCSChatRoom = async (userId) => {
    try {
        // 1. 기존 CS 채팅방 확인 (user_id와 company_id가 CS 계정인 경우)
        // CS 계정이 company 타입이므로 company_id에 CS_ACCOUNT_ID를 사용
        const { data: existingRoom, error: checkError } = await supabase
            .from('chat_rooms')
            .select('id')
            .eq('user_id', userId)
            .eq('company_id', CS_ACCOUNT_ID)
            .is('application_id', null)
            .is('job_posting_id', null)
            .eq('is_active', true)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('CS 채팅방 조회 오류:', checkError);
            throw checkError;
        }

        // 2. 기존 채팅방이 있으면 해당 ID 반환
        if (existingRoom) {
            return { roomId: existingRoom.id };
        }

        // 3. 새 CS 채팅방 생성
        const { data: newRoom, error: createError } = await supabase
            .from('chat_rooms')
            .insert({
                user_id: userId,
                company_id: CS_ACCOUNT_ID,
                application_id: null,
                job_posting_id: null,
                is_active: true
            })
            .select('id')
            .single();

        if (createError) {
            console.error('CS 채팅방 생성 오류:', createError);
            throw createError;
        }

        // 4. 초기 환영 메시지 생성
        const { error: messageError } = await supabase
            .from('chat_messages')
            .insert({
                room_id: newRoom.id,
                sender_id: CS_ACCOUNT_ID,
                message_type: 'text',
                content: CS_INITIAL_MESSAGE,
                is_read: false
            });

        if (messageError) {
            console.error('초기 환영 메시지 생성 실패:', messageError);
            // 메시지 생성 실패해도 roomId는 반환 (채팅은 가능)
        }

        // 5. chat_rooms의 last_message_at 업데이트
        await supabase
            .from('chat_rooms')
            .update({
                last_message_at: new Date().toISOString(),
                user_unread_count: 1 // 사용자에게 환영 메시지가 안 읽은 상태로 표시됨
            })
            .eq('id', newRoom.id);

        return { roomId: newRoom.id };
    } catch (error) {
        console.error('CS 채팅방 생성/조회 오류:', error);
        throw error;
    }
};

module.exports = {
    getOrCreateCSChatRoom
};