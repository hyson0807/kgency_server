const jwt = require('jsonwebtoken');
const { supabase } = require('../config/database');

class ChatSocketHandler {
  constructor(io) {
    this.io = io;
    this.authenticatedUsers = new Map(); // userId -> socketId 매핑
  }

  // Socket.io 이벤트 핸들러 등록
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`클라이언트 연결: ${socket.id}`, {
        총연결수: this.io.engine.clientsCount,
        인증된사용자수: this.authenticatedUsers.size
      });

      // JWT 인증
      socket.on('authenticate', async (token) => {
        try {
          await this.authenticateUser(socket, token);
        } catch (error) {
          console.error('인증 오류:', error);
          socket.emit('auth-error', { message: '인증에 실패했습니다.' });
        }
      });

      // 채팅방 입장
      socket.on('join-room', async (data) => {
        try {
          await this.joinRoom(socket, data);
        } catch (error) {
          console.error('채팅방 입장 오류:', error);
          socket.emit('error', { message: '채팅방 입장에 실패했습니다.' });
        }
      });

      // 메시지 전송
      socket.on('send-message', async (data) => {
        try {
          await this.sendMessage(socket, data);
        } catch (error) {
          console.error('메시지 전송 오류:', error);
          socket.emit('error', { message: '메시지 전송에 실패했습니다.' });
        }
      });

      // 채팅방 퇴장
      socket.on('leave-room', (roomId) => {
        this.leaveRoom(socket, roomId);
      });

      // 연결 해제
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  // JWT 토큰으로 사용자 인증
  async authenticateUser(socket, token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // 사용자 정보 조회
      const { data: user, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', decoded.userId || decoded.user_id || decoded.sub)
        .single();

      if (error || !user) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      // 소켓에 사용자 정보 저장
      socket.userId = user.id;
      socket.userType = user.user_type;
      socket.authenticated = true;

      // 사용자 매핑 저장
      this.authenticatedUsers.set(user.id, socket.id);

      console.log(`사용자 인증 성공: ${user.id} (${user.user_type})`, {
        socketId: socket.id,
        totalAuthenticatedUsers: this.authenticatedUsers.size
      });
      socket.emit('authenticated', { 
        success: true, 
        user: { id: user.id, name: user.name, user_type: user.user_type }
      });

    } catch (error) {
      console.error('JWT 인증 실패:', error);
      throw new Error('유효하지 않은 토큰입니다.');
    }
  }

  // 채팅방 입장
  async joinRoom(socket, { roomId }) {
    if (!socket.authenticated) {
      throw new Error('인증이 필요합니다.');
    }

    try {
      // 채팅방 접근 권한 확인
      const { data: room, error } = await supabase
        .from('chat_rooms')
        .select('user_id, company_id')
        .eq('id', roomId)
        .single();

      if (error || !room) {
        throw new Error('채팅방을 찾을 수 없습니다.');
      }

      // 권한 확인 (채팅방 참여자만 접근 가능)
      const hasAccess = room.user_id === socket.userId || room.company_id === socket.userId;
      if (!hasAccess) {
        console.log('채팅방 접근 권한 확인:', {
          roomId,
          socketUserId: socket.userId,
          roomUserId: room.user_id,
          roomCompanyId: room.company_id
        });
        throw new Error('채팅방 접근 권한이 없습니다.');
      }

      // 소켓을 채팅방에 추가
      socket.join(roomId);
      socket.currentRoomId = roomId;

      console.log(`사용자 ${socket.userId}가 채팅방 ${roomId}에 입장했습니다.`);
      
      // 채팅방 입장 시 읽지 않은 메시지 카운트 리셋
      await this.resetUnreadCountOnJoin(roomId, socket.userId, room);
      
      socket.emit('joined-room', { roomId, success: true });

      // 채팅방의 다른 참여자에게 알림 (선택사항)
      socket.to(roomId).emit('user-joined', { 
        userId: socket.userId, 
        userType: socket.userType 
      });

    } catch (error) {
      console.error('채팅방 입장 실패:', error);
      throw error;
    }
  }

  // 메시지 전송
  async sendMessage(socket, { roomId, message, messageType }) {
    if (!socket.authenticated) {
      throw new Error('인증이 필요합니다.');
    }

    if (!message || !message.trim()) {
      throw new Error('메시지 내용이 필요합니다.');
    }

    try {
      // 채팅방 권한 재확인
      const { data: room, error: roomError } = await supabase
        .from('chat_rooms')
        .select('user_id, company_id')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        throw new Error('채팅방을 찾을 수 없습니다.');
      }

      const hasAccess = room.user_id === socket.userId || room.company_id === socket.userId;
      if (!hasAccess) {
        throw new Error('메시지 전송 권한이 없습니다.');
      }

      // DB에 메시지 저장
      const messageData = {
        room_id: roomId,
        sender_id: socket.userId,
        message: message.trim(),
        is_read: false
      };
      
      // messageType이 있으면 추가
      if (messageType) {
        messageData.message_type = messageType;
      }
      
      const { data: newMessage, error: messageError } = await supabase
        .from('chat_messages')
        .insert(messageData)
        .select()
        .single();

      if (messageError) {
        console.error('메시지 DB 저장 실패:', messageError);
        throw new Error('메시지 저장에 실패했습니다.');
      }

      // 채팅방의 모든 참여자에게 실시간 브로드캐스트
      const broadcastMessage = {
        id: newMessage.id,
        room_id: roomId,
        sender_id: socket.userId,
        message: message.trim(),
        created_at: newMessage.created_at,
        is_read: false
      };
      
      // messageType이 있으면 포함
      if (messageType) {
        broadcastMessage.message_type = messageType;
      }
      
      this.io.to(roomId).emit('new-message', broadcastMessage);

      // 실시간 업데이트를 위한 채팅방 정보 조회 및 알림 전송
      await this.notifyRoomUpdate(roomId, socket.userId, room);

      console.log(`메시지 전송 완료: ${socket.userId} -> 채팅방 ${roomId}`);

    } catch (error) {
      console.error('메시지 전송 실패:', error);
      throw error;
    }
  }

  // 메시지 전송 후 실시간 알림 (데이터베이스 트리거가 이미 카운트를 업데이트함)
  async notifyRoomUpdate(roomId, senderId, room) {
    try {
      // 데이터베이스 트리거에 의해 업데이트된 최신 채팅방 정보 조회
      const { data: updatedRoom, error } = await supabase
        .from('chat_rooms')
        .select('last_message, last_message_at, user_unread_count, company_unread_count')
        .eq('id', roomId)
        .single();

      if (error) {
        console.error('업데이트된 채팅방 정보 조회 실패:', error);
        return;
      }

      // 메시지를 받을 사용자 결정 (발신자가 아닌 사용자)
      const receiverId = senderId === room.user_id ? room.company_id : room.user_id;
      const receiverUnreadCount = senderId === room.user_id 
        ? updatedRoom.company_unread_count 
        : updatedRoom.user_unread_count;

      // 채팅방 목록 업데이트 이벤트 전송
      this.sendToUser(receiverId, 'chat-room-updated', {
        roomId,
        last_message: updatedRoom.last_message,
        last_message_at: updatedRoom.last_message_at,
        unread_count: receiverUnreadCount
      });

      // 전체 안읽은 메시지 카운트 조회 및 전송
      await this.sendTotalUnreadCount(receiverId);

    } catch (error) {
      console.error('채팅방 업데이트 알림 실패:', error);
    }
  }


  // 총 안읽은 메시지 카운트 전송
  async sendTotalUnreadCount(userId) {
    try {
      const { data: rooms, error } = await supabase
        .from('chat_rooms')
        .select('user_unread_count, company_unread_count, user_id, company_id')
        .or(`user_id.eq.${userId},company_id.eq.${userId}`)
        .eq('is_active', true);

      if (error) {
        console.error('총 안읽은 메시지 카운트 조회 실패:', error);
        return;
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

      // 총 안읽은 메시지 카운트 전송
      this.sendToUser(userId, 'total-unread-count-updated', {
        totalUnreadCount
      });

    } catch (error) {
      console.error('총 안읽은 메시지 카운트 전송 실패:', error);
    }
  }

  // 채팅방 입장 시 읽지 않은 메시지 카운트 리셋
  async resetUnreadCountOnJoin(roomId, userId, room) {
    try {
      // 현재 사용자의 읽지 않은 메시지 카운트를 0으로 리셋
      const isUser = room.user_id === userId;
      const updateField = isUser ? 'user_unread_count' : 'company_unread_count';
      
      const { error } = await supabase
        .from('chat_rooms')
        .update({ [updateField]: 0 })
        .eq('id', roomId);

      if (error) {
        console.error('읽지 않은 메시지 카운트 리셋 실패:', error);
        return;
      }

      // 채팅방의 모든 메시지를 읽음 처리
      await supabase
        .from('chat_messages')
        .update({ is_read: true })
        .eq('room_id', roomId)
        .neq('sender_id', userId)
        .eq('is_read', false);

      // 총 안읽은 메시지 카운트 업데이트 전송
      await this.sendTotalUnreadCount(userId);

    } catch (error) {
      console.error('채팅방 입장 시 읽지 않은 메시지 카운트 리셋 실패:', error);
    }
  }

  // 채팅방 퇴장
  leaveRoom(socket, roomId) {
    socket.leave(roomId);
    socket.currentRoomId = null;
    
    console.log(`사용자 ${socket.userId}가 채팅방 ${roomId}에서 퇴장했습니다.`);
    
    // 채팅방의 다른 참여자에게 알림 (선택사항)
    socket.to(roomId).emit('user-left', { 
      userId: socket.userId, 
      userType: socket.userType 
    });
  }

  // 연결 해제 처리
  handleDisconnect(socket) {
    if (socket.userId) {
      this.authenticatedUsers.delete(socket.userId);
      console.log(`사용자 ${socket.userId} 연결 해제`);
    } else {
      console.log(`클라이언트 ${socket.id} 연결 해제`);
    }
  }

  // 특정 사용자에게 메시지 전송 (유틸리티 메서드)
  sendToUser(userId, event, data) {
    const socketId = this.authenticatedUsers.get(userId);
    console.log(`sendToUser 호출: userId=${userId}, event=${event}`, { 
      socketId, 
      hasSocket: !!socketId,
      authenticatedCount: this.authenticatedUsers.size,
      data 
    });
    
    if (socketId) {
      this.io.to(socketId).emit(event, data);
      console.log(`이벤트 전송 완료: ${event} -> ${socketId}`);
      return true;
    } else {
      console.log(`사용자 ${userId}의 소켓을 찾을 수 없음. 인증된 사용자 목록:`, 
        Array.from(this.authenticatedUsers.keys()));
    }
    return false;
  }
}

module.exports = ChatSocketHandler;