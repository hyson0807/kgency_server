const chatService = require('../services/chat.service');

// 채팅방 목록 가져오기 (구직자용)
const getUserChatRooms = async (req, res) => {
    try {
        const userId = req.user.userId;
        const data = await chatService.getUserChatRooms(userId);
        
        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Error in getUserChatRooms:', error);
        res.status(500).json({
            success: false,
            error: '채팅방을 불러오는데 실패했습니다.'
        });
    }
};

// 채팅방 목록 가져오기 (회사용)
const getCompanyChatRooms = async (req, res) => {
    try {
        const companyId = req.user.userId;
        const data = await chatService.getCompanyChatRooms(companyId);
        
        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Error in getCompanyChatRooms:', error);
        res.status(500).json({
            success: false,
            error: '채팅방을 불러오는데 실패했습니다.'
        });
    }
};

// 특정 채팅방 정보 가져오기
const getChatRoomInfo = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;
        
        const data = await chatService.getChatRoomInfo(roomId, userId);
        
        const response = {
            success: true,
            data
        };
        
        if (data.hasWithdrawnUser) {
            response.hasWithdrawnUser = true;
        }
        
        res.json(response);
    } catch (error) {
        console.error('Error in getChatRoomInfo:', error);
        
        if (error.code === 'ROOM_NOT_FOUND') {
            return res.status(404).json({
                success: false,
                error: error.message,
                errorType: 'room_not_found'
            });
        }
        
        res.status(500).json({
            success: false,
            error: '채팅방 정보를 불러올 수 없습니다.',
            errorType: 'general'
        });
    }
};

// 채팅 메시지 목록 가져오기 (커서 기반 페이지네이션)
const getChatMessages = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;
        const limit = parseInt(req.query.limit) || 20;
        const before = req.query.before;
        
        const data = await chatService.getChatMessages(roomId, userId, {
            limit,
            before
        });
        
        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Error in getChatMessages:', error);
        
        if (error.code === 'ROOM_NOT_FOUND') {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }
        
        if (error.code === 'ACCESS_ERROR') {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '메시지를 불러올 수 없습니다.'
        });
    }
};

// 메시지 읽음 처리
const markMessagesAsRead = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;
        
        await chatService.markMessagesAsRead(roomId, userId);
        
        // WebSocket을 통한 실시간 총 안읽은 메시지 카운트 전송
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
        
        if (error.code === 'ROOM_NOT_FOUND') {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }
        
        if (error.code === 'ACCESS_ERROR') {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '서버 오류가 발생했습니다.'
        });
    }
};

// 채팅방 생성
const createChatRoom = async (req, res) => {
    try {
        const { application_id, user_id, company_id, job_posting_id } = req.body;
        
        const room = await chatService.createChatRoom(
            application_id,
            user_id,
            company_id,
            job_posting_id
        );
        
        if (room.alreadyExists) {
            return res.json({
                success: true,
                data: { id: room.id },
                message: '이미 존재하는 채팅방입니다.'
            });
        }
        
        res.json({
            success: true,
            data: room,
            message: '채팅방이 성공적으로 생성되었습니다.'
        });
    } catch (error) {
        console.error('Error in createChatRoom:', error);
        
        if (error.code === 'MISSING_PARAMS') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '채팅방 생성에 실패했습니다.'
        });
    }
};

// 총 안읽은 메시지 카운트 조회
const getTotalUnreadCount = async (req, res) => {
    try {
        const userId = req.user.userId;
        const totalUnreadCount = await chatService.getTotalUnreadCount(userId);
        
        res.json({
            success: true,
            data: { totalUnreadCount }
        });
    } catch (error) {
        console.error('Error in getTotalUnreadCount:', error);
        res.status(500).json({
            success: false,
            error: '안읽은 메시지 카운트 조회에 실패했습니다.'
        });
    }
};

// 기존 채팅방 찾기 (동일한 회사와의 채팅방)
const findExistingRoom = async (req, res) => {
    try {
        const { user_id, company_id } = req.query;
        const currentUserId = req.user.userId;
        
        const room = await chatService.findExistingRoom(
            user_id,
            company_id,
            currentUserId
        );
        
        if (room) {
            return res.json({
                success: true,
                data: room,
                message: '기존 채팅방을 찾았습니다.'
            });
        }
        
        res.json({
            success: true,
            data: null,
            message: '기존 채팅방이 없습니다.'
        });
    } catch (error) {
        console.error('Error in findExistingRoom:', error);
        
        if (error.code === 'MISSING_PARAMS') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        if (error.code === 'FORBIDDEN') {
            return res.status(403).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '채팅방 검색 중 오류가 발생했습니다.'
        });
    }
};

module.exports = {
    getUserChatRooms,
    getCompanyChatRooms,
    getChatRoomInfo,
    getChatMessages,
    markMessagesAsRead,
    createChatRoom,
    findExistingRoom,
    getTotalUnreadCount
};