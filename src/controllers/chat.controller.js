const { supabase } = require('../config/database');

// 채팅방 권한 확인 헬퍼 함수
const validateChatRoomAccess = async (roomId, userId) => {
    const { data, error } = await supabase
        .from('chat_rooms')
        .select('user_id, company_id')
        .eq('id', roomId)
        .single();
    
    if (error) {
        return { error: '채팅방을 찾을 수 없습니다.', status: 404 };
    }
    
    if (data.user_id !== userId && data.company_id !== userId) {
        return { error: '접근 권한이 없습니다.', status: 403 };
    }
    
    return { data };
};

// 채팅방 목록 가져오기 (구직자용)
const getUserChatRooms = async (req, res) => {
    try {
        const userId = req.user.userId;
        
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
            console.error('Error fetching user chat rooms:', error);
            return res.status(500).json({
                success: false,
                error: '채팅방을 불러오는데 실패했습니다.'
            });
        }

        res.json({
            success: true,
            data: data || []
        });
    } catch (error) {
        console.error('Error in getUserChatRooms:', error);
        res.status(500).json({
            success: false,
            error: '서버 오류가 발생했습니다.'
        });
    }
};

// 채팅방 목록 가져오기 (회사용)
const getCompanyChatRooms = async (req, res) => {
    try {
        const companyId = req.user.userId;
        
        const { data, error } = await supabase
            .from('chat_rooms')
            .select(`
                *,
                user:profiles!user_id(name),
                job_postings(title)
            `)
            .eq('company_id', companyId)
            .eq('is_active', true)
            .order('last_message_at', { ascending: false, nullsFirst: false });

        if (error) {
            console.error('Error fetching company chat rooms:', error);
            return res.status(500).json({
                success: false,
                error: '채팅방을 불러오는데 실패했습니다.'
            });
        }

        res.json({
            success: true,
            data: data || []
        });
    } catch (error) {
        console.error('Error in getCompanyChatRooms:', error);
        res.status(500).json({
            success: false,
            error: '서버 오류가 발생했습니다.'
        });
    }
};

// 특정 채팅방 정보 가져오기
const getChatRoomInfo = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;
        
        // 권한 확인 및 데이터 조회를 한 번에
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
            const status = error.code === 'PGRST116' ? 404 : 500;
            const message = error.code === 'PGRST116' 
                ? '채팅방을 찾을 수 없거나 접근 권한이 없습니다.' 
                : '채팅방 정보를 불러올 수 없습니다.';
            
            return res.status(status).json({
                success: false,
                error: message
            });
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Error in getChatRoomInfo:', error);
        res.status(500).json({
            success: false,
            error: '서버 오류가 발생했습니다.'
        });
    }
};

// 채팅 메시지 목록 가져오기 (페이지네이션 지원)
const getChatMessages = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;
        
        // 쿼리 파라미터 파싱
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 20;
        const before = req.query.before; // ISO 시간 문자열
        const after = req.query.after;   // ISO 시간 문자열
        
        // limit 범위 검증 (1-100)
        const validLimit = Math.max(1, Math.min(100, limit));
        
        // 헬퍼 함수로 권한 확인
        const validation = await validateChatRoomAccess(roomId, userId);
        if (validation.error) {
            return res.status(validation.status).json({
                success: false,
                error: validation.error
            });
        }

        let query = supabase
            .from('chat_messages')
            .select('*', { count: 'exact' })
            .eq('room_id', roomId);

        // 시간 기반 필터링 (더 정확한 페이지네이션)
        if (before) {
            query = query.lt('created_at', before);
        }
        if (after) {
            query = query.gt('created_at', after);
        }

        // 정렬: 최신 메시지부터 (내림차순)
        query = query.order('created_at', { ascending: false });

        // 페이지네이션 적용
        if (!before && !after) {
            // 기본 페이지네이션 (page 방식)
            const offset = page * validLimit;
            query = query.range(offset, offset + validLimit - 1);
        } else {
            // 시간 기반 페이지네이션에서도 limit 적용
            query = query.limit(validLimit);
        }

        const { data, error, count } = await query;

        if (error) {
            console.error('Error fetching chat messages:', error);
            return res.status(500).json({
                success: false,
                error: '메시지를 불러올 수 없습니다.'
            });
        }

        // 페이지네이션 정보 계산
        const totalMessages = count || 0;
        const totalPages = Math.ceil(totalMessages / validLimit);
        const hasMore = (page + 1) < totalPages;
        
        // 다음 페이지를 위한 커서 (가장 오래된 메시지의 시간)
        const nextCursor = data && data.length > 0 
            ? data[data.length - 1].created_at 
            : null;

        res.json({
            success: true,
            data: {
                messages: data || [],
                pagination: {
                    page,
                    limit: validLimit,
                    totalMessages,
                    totalPages,
                    hasMore,
                    nextCursor
                }
            }
        });
    } catch (error) {
        console.error('Error in getChatMessages:', error);
        res.status(500).json({
            success: false,
            error: '서버 오류가 발생했습니다.'
        });
    }
};

// 메시지 전송
const sendMessage = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { message } = req.body;
        const userId = req.user.userId;
        
        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                error: '메시지 내용이 필요합니다.'
            });
        }

        // 헬퍼 함수로 권한 확인
        const validation = await validateChatRoomAccess(roomId, userId);
        if (validation.error) {
            return res.status(validation.status).json({
                success: false,
                error: validation.error
            });
        }

        // 메시지 전송
        const { data, error } = await supabase
            .from('chat_messages')
            .insert({
                room_id: roomId,
                sender_id: userId,
                message: message.trim()
            })
            .select('*')
            .single();

        if (error) {
            console.error('Error sending message:', error);
            return res.status(500).json({
                success: false,
                error: '메시지 전송에 실패했습니다.'
            });
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Error in sendMessage:', error);
        res.status(500).json({
            success: false,
            error: '서버 오류가 발생했습니다.'
        });
    }
};

// 메시지 읽음 처리
const markMessagesAsRead = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;
        
        // 헬퍼 함수로 권한 확인
        const validation = await validateChatRoomAccess(roomId, userId);
        if (validation.error) {
            return res.status(validation.status).json({
                success: false,
                error: validation.error
            });
        }

        const roomData = validation.data;

        // 메시지 읽음 처리
        const { error: messageError } = await supabase
            .from('chat_messages')
            .update({ is_read: true })
            .eq('room_id', roomId)
            .neq('sender_id', userId)
            .eq('is_read', false);

        if (messageError) {
            console.error('Error marking messages as read:', messageError);
        }

        // 채팅방 읽지 않은 메시지 카운트 업데이트
        const isUser = roomData.user_id === userId;
        const updateField = isUser ? 'user_unread_count' : 'company_unread_count';
        
        const { error: roomUpdateError } = await supabase
            .from('chat_rooms')
            .update({ [updateField]: 0 })
            .eq('id', roomId);

        if (roomUpdateError) {
            console.error('Error updating room unread count:', roomUpdateError);
        }

        // WebSocket을 통한 실시간 총 안읽은 메시지 카운트 전송 (있다면)
        const io = req.app.get('io');
        if (io && io.chatHandler) {
            await io.chatHandler.sendTotalUnreadCount(userId);
        }

        res.json({
            success: true,
            message: '메시지를 읽음 처리했습니다.'
        });
    } catch (error) {
        console.error('Error in markMessagesAsRead:', error);
        res.status(500).json({
            success: false,
            error: '서버 오류가 발생했습니다.'
        });
    }
};

const createChatRoom = async (req, res) => {
    try {
        const { application_id, user_id, company_id, job_posting_id } = req.body;
        
        // 필수 파라미터 검증
        if (!application_id || !user_id || !company_id || !job_posting_id) {
            return res.status(400).json({
                success: false,
                error: '필수 파라미터가 누락되었습니다.'
            });
        }
        
        // 이미 존재하는 채팅방인지 확인
        const { data: existingRoom, error: checkError } = await supabase
            .from('chat_rooms')
            .select('id')
            .eq('application_id', application_id)
            .single();
            
        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking existing chat room:', checkError);
            return res.status(500).json({
                success: false,
                error: '채팅방 확인 중 오류가 발생했습니다.'
            });
        }
        
        if (existingRoom) {
            return res.json({
                success: true,
                data: { id: existingRoom.id },
                message: '이미 존재하는 채팅방입니다.'
            });
        }
        
        // 새 채팅방 생성
        const { data: newRoom, error: createError } = await supabase
            .from('chat_rooms')
            .insert({
                application_id,
                user_id,
                company_id,
                job_posting_id,
                is_active: true
            })
            .select('id')
            .single();
            
        if (createError) {
            console.error('Error creating chat room:', createError);
            return res.status(500).json({
                success: false,
                error: '채팅방 생성에 실패했습니다.'
            });
        }
        
        res.json({
            success: true,
            data: newRoom,
            message: '채팅방이 성공적으로 생성되었습니다.'
        });
        
    } catch (error) {
        console.error('Error in createChatRoom:', error);
        res.status(500).json({
            success: false,
            error: '서버 오류가 발생했습니다.'
        });
    }
};

// 총 안읽은 메시지 카운트 조회
const getTotalUnreadCount = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const { data: rooms, error } = await supabase
            .from('chat_rooms')
            .select('user_unread_count, company_unread_count, user_id, company_id')
            .or(`user_id.eq.${userId},company_id.eq.${userId}`)
            .eq('is_active', true);

        if (error) {
            console.error('Error fetching total unread count:', error);
            return res.status(500).json({
                success: false,
                error: '안읽은 메시지 카운트 조회에 실패했습니다.'
            });
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

        res.json({
            success: true,
            data: { totalUnreadCount }
        });
    } catch (error) {
        console.error('Error in getTotalUnreadCount:', error);
        res.status(500).json({
            success: false,
            error: '서버 오류가 발생했습니다.'
        });
    }
};

// 기존 채팅방 찾기 (동일한 회사와의 채팅방)
const findExistingRoom = async (req, res) => {
    try {
        const { user_id, company_id } = req.query;
        const currentUserId = req.user.userId;
        
        // 파라미터 검증
        if (!user_id || !company_id) {
            return res.status(400).json({
                success: false,
                error: '사용자 ID와 회사 ID가 필요합니다.'
            });
        }
        
        // 권한 검증 (요청자가 해당 사용자 본인인지 확인)
        if (currentUserId !== user_id) {
            return res.status(403).json({
                success: false,
                error: '접근 권한이 없습니다.'
            });
        }
        
        // 동일한 회사와의 기존 채팅방 찾기
        const { data: existingRoom, error } = await supabase
            .from('chat_rooms')
            .select('id, application_id, job_posting_id')
            .eq('user_id', user_id)
            .eq('company_id', company_id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1);
            
        if (error) {
            console.error('Error finding existing chat room:', error);
            return res.status(500).json({
                success: false,
                error: '채팅방 검색 중 오류가 발생했습니다.'
            });
        }
        
        if (existingRoom && existingRoom.length > 0) {
            return res.json({
                success: true,
                data: { 
                    roomId: existingRoom[0].id,
                    applicationId: existingRoom[0].application_id,
                    jobPostingId: existingRoom[0].job_posting_id
                },
                message: '기존 채팅방을 찾았습니다.'
            });
        } else {
            return res.json({
                success: true,
                data: null,
                message: '기존 채팅방이 없습니다.'
            });
        }
        
    } catch (error) {
        console.error('Error in findExistingRoom:', error);
        res.status(500).json({
            success: false,
            error: '서버 오류가 발생했습니다.'
        });
    }
};

module.exports = {
    getUserChatRooms,
    getCompanyChatRooms,
    getChatRoomInfo,
    getChatMessages,
    sendMessage,
    markMessagesAsRead,
    createChatRoom,
    findExistingRoom,
    getTotalUnreadCount
};