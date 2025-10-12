const jwt = require('jsonwebtoken');
const { supabase } = require('../config/database');
const notificationService = require('../services/notification.service');
const UnreadCountManager = require('../services/UnreadCountManager');

class ChatSocketHandler {
  constructor(io) {
    this.io = io;
    this.authenticatedUsers = new Map(); // userId -> socketId 매핑
    this.userCurrentRoom = new Map(); // userId -> currentRoomId 매핑 (사용자가 현재 있는 채팅방)
    this.unreadCountManager = new UnreadCountManager(); // Redis 기반 카운트 관리자
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

      // 기존 연결이 있으면 정리 (중복 로그인 방지)
      if (this.authenticatedUsers.has(user.id)) {
        const oldSocketId = this.authenticatedUsers.get(user.id);
        const oldSocket = this.io.sockets.sockets.get(oldSocketId);
        if (oldSocket && oldSocket.id !== socket.id) {
          console.log(`기존 연결 정리: userId=${user.id}, oldSocketId=${oldSocketId}`);
          oldSocket.emit('force-disconnect', { reason: '다른 기기에서 로그인됨' });
          oldSocket.disconnect();
        }
      }

      // 소켓에 사용자 정보 저장
      socket.userId = user.id;
      socket.userType = user.user_type;
      socket.authenticated = true;

      // 사용자 매핑 저장 (새로운 연결로 업데이트)
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
        const errorMessage = error?.code === 'PGRST116' 
          ? '채팅방을 찾을 수 없습니다. 상대방이 탈퇴했거나 채팅방이 삭제되었을 수 있습니다.'
          : '채팅방에 접근할 수 없습니다.';
        console.log(`채팅방 ${roomId} 접근 실패: ${errorMessage}`, { userId: socket.userId, error: error?.code });
        throw new Error(errorMessage);
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
      
      // 사용자의 현재 채팅방 추적
      this.userCurrentRoom.set(socket.userId, roomId);

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

      // 수신자의 Redis 카운트 업데이트 - 채팅방 내 사용자는 카운트 증가 방지
      const receiverId = socket.userId === room.user_id ? room.company_id : room.user_id;
      if (receiverId) {
        // 수신자가 현재 채팅방에 있는지 확인
        const isReceiverInRoom = this.userCurrentRoom.get(receiverId) === roomId;
        
        if (!isReceiverInRoom) {
          // 채팅방 밖에 있을 때만 카운트 증가
          await this.unreadCountManager.incrementUnreadCount(receiverId, roomId, 1);
          console.log(`카운트 증가: 수신자 ${receiverId}가 채팅방 밖에 있음`);
        } else {
          // 채팅방 안에 있으면 즉시 읽음 처리
          await this.markMessagesAsReadInRoom(roomId, receiverId);
          console.log(`즉시 읽음 처리: 수신자 ${receiverId}가 채팅방 ${roomId} 안에 있음`);
        }
      }

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
      
      // receiverId가 없는 경우 (상대방이 탈퇴한 경우 등)
      if (!receiverId) {
        console.log('수신자가 없습니다. (탈퇴한 사용자일 수 있음)');
        return;
      }
      
      const receiverUnreadCount = senderId === room.user_id 
        ? updatedRoom.company_unread_count 
        : updatedRoom.user_unread_count;

      // 수신자가 현재 해당 채팅방에 있는지 확인
      const receiverCurrentRoom = this.userCurrentRoom.get(receiverId);
      const isReceiverInRoom = receiverCurrentRoom === roomId;
      
      // 수신자가 온라인이지만 다른 채팅방에 있거나 채팅방 밖에 있을 때
      const isReceiverOnline = this.authenticatedUsers.has(receiverId);

      // 채팅방 목록 업데이트 이벤트 전송 (온라인인 경우)
      if (isReceiverOnline) {
        // 수신자가 채팅방에 있으면 unread_count는 0으로 전송
        const actualUnreadCount = isReceiverInRoom ? 0 : receiverUnreadCount;
        
        this.sendToUser(receiverId, 'chat-room-updated', {
          roomId,
          last_message: updatedRoom.last_message,
          last_message_at: updatedRoom.last_message_at,
          unread_count: actualUnreadCount
        });
        
        console.log(`채팅방 업데이트 전송: receiverId=${receiverId}, inRoom=${isReceiverInRoom}, unreadCount=${actualUnreadCount}`);
      }

      // 전체 안읽은 메시지 카운트 조회 및 전송 (온라인인 경우) - Redis 기반 최적화
      if (isReceiverOnline) {
        await this.sendTotalUnreadCountWithRedis(receiverId);
      }

      // 수신자가 채팅방에 없을 때 푸시 알림 전송
      if (!isReceiverInRoom) {
        await this.sendChatPushNotification(senderId, receiverId, updatedRoom.last_message, roomId);
      }

    } catch (error) {
      console.error('채팅방 업데이트 알림 실패:', error);
    }
  }

  // 채팅 푸시 알림 전송 (중복 카운트 방지 로직 포함)
  async sendChatPushNotification(senderId, receiverId, messageContent, roomId) {
    try {
      // CS 계정 ID (고정값)
      const CS_ACCOUNT_ID = 'a0000000-0000-4000-8000-000000000001';

      // 발신자 정보 조회
      const { data: sender, error: senderError } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', senderId)
        .single();

      if (senderError) {
        console.error('발신자 정보 조회 실패:', senderError);
        return;
      }

      const senderName = sender?.name || '알 수 없는 사용자';

      // CS 채팅인지 확인 (발신자가 CS 계정인 경우)
      const isCS = senderId === CS_ACCOUNT_ID;

      // 🔧 현재 총 안읽은 메시지 카운트 조회 (Redis에서)
      let totalUnreadCount = 1; // 기본값: 적어도 1개는 있다고 가정
      try {
        totalUnreadCount = await this.unreadCountManager.getTotalUnreadCount(receiverId);
        console.log(`푸시 알림 배지 카운트 조회: receiverId=${receiverId}, count=${totalUnreadCount}`);
      } catch (error) {
        console.error('Redis에서 안읽은 카운트 조회 실패, 기본값 사용:', error);
      }

      // 푸시 알림 전송 (배지 카운트 및 CS 플래그 포함)
      const notificationSent = await notificationService.sendChatMessageNotification(
        receiverId,
        senderName,
        messageContent,
        roomId,
        totalUnreadCount, // 🔧 배지 카운트 전달
        isCS // 🔧 CS 채팅 플래그 전달
      );

      if (notificationSent) {
        console.log(`채팅 푸시 알림 전송 완료: ${senderName} -> ${receiverId} (CS: ${isCS})`);
      } else {
        console.log(`채팅 푸시 알림 전송 실패: ${receiverId}의 푸시 토큰이 없음`);
      }

    } catch (error) {
      console.error('채팅 푸시 알림 전송 중 오류:', error);
    }
  }


  // Redis 기반 총 안읽은 메시지 카운트 전송 (성능 최적화)
  async sendTotalUnreadCountWithRedis(userId) {
    try {
      // Redis에서 캐시된 카운트 조회 (0.1초 이내)
      let totalUnreadCount = await this.unreadCountManager.getCachedTotalUnreadCount(userId);
      
      // Redis에 데이터가 없으면 DB에서 동기화 후 캐시
      if (totalUnreadCount === 0) {
        totalUnreadCount = await this.unreadCountManager.syncFromDatabase(userId);
      }

      // 즉시 배지 업데이트 전송
      this.sendToUser(userId, 'total-unread-count-updated', {
        totalUnreadCount
      });

      console.log(`✅ Redis 배지 업데이트 전송: ${userId} → ${totalUnreadCount}`);

    } catch (error) {
      console.error('Redis 배지 업데이트 실패:', error);
      // Fallback: 기존 DB 방식
      await this.sendTotalUnreadCountFallback(userId);
    }
  }

  // 기존 DB 기반 총 안읽은 메시지 카운트 전송 (Fallback)
  async sendTotalUnreadCountFallback(userId) {
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

      console.log(`⚠️ Fallback 배지 업데이트 전송: ${userId} → ${totalUnreadCount}`);

    } catch (error) {
      console.error('Fallback 배지 업데이트 실패:', error);
    }
  }

  // 기존 메서드 유지 (하위 호환성)
  async sendTotalUnreadCount(userId) {
    return await this.sendTotalUnreadCountWithRedis(userId);
  }

  // 채팅방 입장 시 읽지 않은 메시지 카운트 리셋 (Redis 최적화)
  async resetUnreadCountOnJoin(roomId, userId, room) {
    try {
      // 1. DB에서 카운트 리셋 (기존 방식 유지)
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

      // 2. 채팅방의 모든 메시지를 읽음 처리
      await supabase
        .from('chat_messages')
        .update({ is_read: true })
        .eq('room_id', roomId)
        .neq('sender_id', userId)
        .eq('is_read', false);

      // 3. Redis 캐시에서도 해당 룸의 카운트 리셋 (즉시 반영)
      const totalUnreadCount = await this.unreadCountManager.resetRoomUnreadCount(userId, roomId);

      // 4. 즉시 배지 업데이트 전송
      this.sendToUser(userId, 'total-unread-count-updated', {
        totalUnreadCount
      });

      console.log(`🚪 채팅방 입장 배지 리셋: ${userId} → 룸 ${roomId} → 총 ${totalUnreadCount}`);

    } catch (error) {
      console.error('채팅방 입장 시 배지 리셋 실패:', error);
      // Fallback: 기존 방식으로 재시도
      await this.sendTotalUnreadCountFallback(userId);
    }
  }

  // 채팅방 퇴장
  leaveRoom(socket, roomId) {
    socket.leave(roomId);
    socket.currentRoomId = null;
    
    // 사용자의 현재 채팅방 정보 제거
    if (socket.userId) {
      this.userCurrentRoom.delete(socket.userId);
    }
    
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
      this.userCurrentRoom.delete(socket.userId); // 현재 채팅방 정보도 제거
      console.log(`사용자 ${socket.userId} 연결 해제`);
    } else {
      console.log(`클라이언트 ${socket.id} 연결 해제`);
    }
  }

  // 채팅방 내 사용자의 메시지를 즉시 읽음 처리
  async markMessagesAsReadInRoom(roomId, userId) {
    try {
      // 1. 해당 채팅방의 읽지 않은 메시지를 읽음으로 처리
      const { error: messageError } = await supabase
        .from('chat_messages')
        .update({ is_read: true })
        .eq('room_id', roomId)
        .neq('sender_id', userId) // 자신이 보낸 메시지는 제외
        .eq('is_read', false);

      if (messageError) {
        console.error('메시지 읽음 처리 실패:', messageError);
        return false;
      }

      // 2. 채팅방 테이블의 읽지 않은 카운트 리셋
      const { data: room } = await supabase
        .from('chat_rooms')
        .select('user_id, company_id')
        .eq('id', roomId)
        .single();

      if (room) {
        const isUser = room.user_id === userId;
        const updateField = isUser ? 'user_unread_count' : 'company_unread_count';
        
        const { error: countError } = await supabase
          .from('chat_rooms')
          .update({ [updateField]: 0 })
          .eq('id', roomId);

        if (countError) {
          console.error('채팅방 카운트 리셋 실패:', countError);
        }
      }

      // 3. Redis 카운트도 리셋
      await this.unreadCountManager.resetUnreadCount(userId, roomId);

      // 4. 전체 안읽은 메시지 카운트 업데이트 전송
      await this.sendTotalUnreadCountWithRedis(userId);

      console.log(`즉시 읽음 처리 완료: userId=${userId}, roomId=${roomId}`);
      return true;

    } catch (error) {
      console.error('즉시 읽음 처리 오류:', error);
      return false;
    }
  }

  // 특정 사용자에게 메시지 전송 (유틸리티 메서드)
  sendToUser(userId, event, data) {
    const socketId = this.authenticatedUsers.get(userId);
    
    if (socketId) {
      this.io.to(socketId).emit(event, data);
      if (process.env.NODE_ENV === 'development') {
        console.log(`이벤트 전송 완료: ${event} -> userId:${userId}`);
      }
      return true;
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log(`사용자 ${userId}의 소켓을 찾을 수 없음`);
      }
    }
    return false;
  }
}

module.exports = ChatSocketHandler;