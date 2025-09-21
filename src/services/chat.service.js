const { supabase } = require('../config/database');

// 구직자 채팅방 목록 조회
const getUserChatRooms = async (userId) => {
    const { data, error } = await supabase
        .from('chat_rooms')
        .select(`
            *,
            company:profiles!company_id(name),
            job_postings(title)
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_message_at', { ascending: false, nullsFirst: false });

    if (error) {
        throw error;
    }

    // 탈퇴한 사용자가 포함된 채팅방 처리
    return (data || []).map(room => ({
        ...room,
        company: room.company || { name: '탈퇴한 회사' }
    }));
};

// 회사 채팅방 목록 조회
const getCompanyChatRooms = async (companyId) => {
    const { data, error } = await supabase
        .from('chat_rooms')
        .select(`
            *,
            user:profiles!user_id(
                name,
                user_info(age, university, country)
            ),
            job_postings(title),
            application:applications(id)
        `)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('last_message_at', { ascending: false, nullsFirst: false });

    if (error) {
        throw error;
    }

    // 탈퇴한 사용자가 포함된 채팅방 처리
    return (data || []).map(room => ({
        ...room,
        user: room.user || { name: '탈퇴한 사용자', user_info: null }
    }));
};

// 채팅방 정보 조회
const getChatRoomInfo = async (roomId, userId) => {
    const { data, error } = await supabase
        .from('chat_rooms')
        .select(`
            *,
            user:profiles!user_id(name),
            company:profiles!company_id(name),
            job_postings(title)
        `)
        .eq('id', roomId)
        .or(`user_id.eq.${userId},company_id.eq.${userId}`)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            const err = new Error('채팅방을 찾을 수 없습니다. 상대방이 탈퇴했거나 채팅방이 삭제되었을 수 있습니다.');
            err.code = 'ROOM_NOT_FOUND';
            throw err;
        }
        throw error;
    }

    // 탈퇴한 사용자 정보 처리
    if (data && (data.user === null || data.company === null)) {
        return {
            ...data,
            user: data.user || { name: '탈퇴한 사용자' },
            company: data.company || { name: '탈퇴한 회사' },
            hasWithdrawnUser: true
        };
    }

    return data;
};

// 채팅 메시지 조회 (커서 기반 페이지네이션)
const getChatMessages = async (roomId, userId, options = {}) => {
    const { limit = 20, before } = options;
    const validLimit = Math.max(1, Math.min(100, limit));

    // 권한 확인
    const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('user_id, company_id')
        .eq('id', roomId)
        .or(`user_id.eq.${userId},company_id.eq.${userId}`)
        .single();

    if (roomError || !roomData) {
        const err = new Error(
            roomError?.code === 'PGRST116'
                ? '채팅방을 찾을 수 없거나 접근 권한이 없습니다.'
                : '채팅방 접근 확인 중 오류가 발생했습니다.'
        );
        err.code = roomError?.code === 'PGRST116' ? 'ROOM_NOT_FOUND' : 'ACCESS_ERROR';
        throw err;
    }

    // 메시지 조회
    let query = supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId);

    if (before) {
        query = query.lt('created_at', before);
    }

    query = query
        .order('created_at', { ascending: false })
        .limit(validLimit + 1);

    const { data, error } = await query;

    if (error) {
        throw error;
    }

    // 페이지네이션 정보 처리
    const hasMore = data && data.length > validLimit;
    const messages = hasMore ? data.slice(0, validLimit) : (data || []);
    const nextCursor = messages.length > 0
        ? messages[messages.length - 1].created_at
        : null;

    return {
        messages,
        pagination: {
            limit: validLimit,
            hasMore,
            nextCursor
        }
    };
};

// 메시지 읽음 처리
const markMessagesAsRead = async (roomId, userId) => {
    // 권한 확인
    const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('user_id, company_id')
        .eq('id', roomId)
        .or(`user_id.eq.${userId},company_id.eq.${userId}`)
        .single();

    if (roomError || !roomData) {
        const err = new Error(
            roomError?.code === 'PGRST116'
                ? '채팅방을 찾을 수 없거나 접근 권한이 없습니다.'
                : '채팅방 접근 확인 중 오류가 발생했습니다.'
        );
        err.code = roomError?.code === 'PGRST116' ? 'ROOM_NOT_FOUND' : 'ACCESS_ERROR';
        throw err;
    }

    // 메시지 읽음 처리와 카운트 업데이트
    const isUser = roomData.user_id === userId;
    const updateField = isUser ? 'user_unread_count' : 'company_unread_count';

    const [messageUpdate, roomUpdate] = await Promise.allSettled([
        supabase
            .from('chat_messages')
            .update({ is_read: true })
            .eq('room_id', roomId)
            .neq('sender_id', userId)
            .eq('is_read', false),
        supabase
            .from('chat_rooms')
            .update({ [updateField]: 0 })
            .eq('id', roomId)
    ]);

    // 에러 로깅 (실패해도 계속 진행)
    if (messageUpdate.status === 'rejected') {
        console.error('Error marking messages as read:', messageUpdate.reason);
    }
    if (roomUpdate.status === 'rejected') {
        console.error('Error updating room unread count:', roomUpdate.reason);
    }

    return { success: true };
};

// 채팅방 생성
const createChatRoom = async (applicationId, userId, companyId, jobPostingId) => {
    // 필수 파라미터 검증
    if (!applicationId || !userId || !companyId || !jobPostingId) {
        const err = new Error('필수 파라미터가 누락되었습니다.');
        err.code = 'MISSING_PARAMS';
        throw err;
    }

    // 이미 존재하는 채팅방 확인
    const { data: existingRoom, error: checkError } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('application_id', applicationId)
        .single();

    if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
    }

    if (existingRoom) {
        return {
            id: existingRoom.id,
            alreadyExists: true
        };
    }

    // 새 채팅방 생성
    const { data: newRoom, error: createError } = await supabase
        .from('chat_rooms')
        .insert({
            application_id: applicationId,
            user_id: userId,
            company_id: companyId,
            job_posting_id: jobPostingId,
            is_active: true
        })
        .select('id')
        .single();

    if (createError) {
        throw createError;
    }

    return newRoom;
};

// 총 안읽은 메시지 카운트 조회
const getTotalUnreadCount = async (userId) => {
    const { data: rooms, error } = await supabase
        .from('chat_rooms')
        .select('user_unread_count, company_unread_count, user_id, company_id')
        .or(`user_id.eq.${userId},company_id.eq.${userId}`)
        .eq('is_active', true);

    if (error) {
        throw error;
    }

    // 해당 사용자의 총 안읽은 메시지 수 계산
    let totalUnreadCount = 0;
    rooms.forEach(room => {
        if (room.user_id === userId) {
            totalUnreadCount += room.user_unread_count || 0;
        } else if (room.company_id === userId) {
            totalUnreadCount += room.company_unread_count || 0;
        }
    });

    return totalUnreadCount;
};

// 기존 채팅방 찾기
const findExistingRoom = async (userId, companyId, currentUserId) => {
    // 파라미터 검증
    if (!userId || !companyId) {
        const err = new Error('사용자 ID와 회사 ID가 필요합니다.');
        err.code = 'MISSING_PARAMS';
        throw err;
    }

    // 권한 검증
    if (currentUserId !== userId && currentUserId !== companyId) {
        const err = new Error('접근 권한이 없습니다.');
        err.code = 'FORBIDDEN';
        throw err;
    }

    // 동일한 회사와의 기존 채팅방 찾기
    const { data: existingRoom, error } = await supabase
        .from('chat_rooms')
        .select('id, application_id, job_posting_id')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        throw error;
    }

    if (existingRoom && existingRoom.length > 0) {
        return {
            roomId: existingRoom[0].id,
            applicationId: existingRoom[0].application_id,
            jobPostingId: existingRoom[0].job_posting_id
        };
    }

    return null;
};

// 일반 채팅방 생성 (job_posting_id 없이)
const createGeneralChatRoom = async (userId, companyId) => {
    // 필수 파라미터 검증
    if (!userId || !companyId) {
        const err = new Error('사용자 ID와 회사 ID가 필요합니다.');
        err.code = 'MISSING_PARAMS';
        throw err;
    }

    // 이미 존재하는 일반 채팅방 확인 (application_id와 job_posting_id가 null인 채팅방)
    const { data: existingRoom, error: checkError } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .is('application_id', null)
        .is('job_posting_id', null)
        .eq('is_active', true)
        .single();

    if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
    }

    if (existingRoom) {
        return {
            id: existingRoom.id,
            alreadyExists: true
        };
    }

    // 새 일반 채팅방 생성
    const { data: newRoom, error: createError } = await supabase
        .from('chat_rooms')
        .insert({
            user_id: userId,
            company_id: companyId,
            application_id: null,
            job_posting_id: null,
            is_active: true
        })
        .select('id')
        .single();

    if (createError) {
        throw createError;
    }

    return newRoom;
};

// 구직자용 채팅 권한 확인 (company_unlocked_profiles 테이블 체크)
const checkUserChatPermission = async (roomId, userId) => {
    // 채팅방 정보 조회
    const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('user_id, company_id, application_id')
        .eq('id', roomId)
        .eq('user_id', userId)
        .single();

    if (roomError) {
        if (roomError.code === 'PGRST116') {
            const err = new Error('채팅방을 찾을 수 없습니다.');
            err.code = 'ROOM_NOT_FOUND';
            throw err;
        }
        throw roomError;
    }

    // 회사 ID가 있는 경우만 언락 상태 확인
    if (roomData.company_id) {
        const { data: unlockedProfile, error: unlockError } = await supabase
            .from('company_unlocked_profiles')
            .select('id, unlocked_at')
            .eq('company_id', roomData.company_id)
            .eq('user_id', userId)
            .single();

        if (unlockError && unlockError.code !== 'PGRST116') {
            throw unlockError;
        }

        return {
            canChat: !!unlockedProfile,
            isUnlocked: !!unlockedProfile,
            applicationId: roomData.application_id
        };
    }

    return {
        canChat: false,
        isUnlocked: false,
        applicationId: roomData.application_id
    };
};

module.exports = {
    getUserChatRooms,
    getCompanyChatRooms,
    getChatRoomInfo,
    getChatMessages,
    markMessagesAsRead,
    createChatRoom,
    createGeneralChatRoom,
    getTotalUnreadCount,
    findExistingRoom,
    checkUserChatPermission
};