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
      console.log(`클라이언트 연결: ${socket.id}`);

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

      console.log(`사용자 인증 성공: ${user.id} (${user.user_type})`);
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
      if (room.user_id !== socket.userId && room.company_id !== socket.userId) {
        throw new Error('채팅방 접근 권한이 없습니다.');
      }

      // 소켓을 채팅방에 추가
      socket.join(roomId);
      socket.currentRoomId = roomId;

      console.log(`사용자 ${socket.userId}가 채팅방 ${roomId}에 입장했습니다.`);
      
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
  async sendMessage(socket, { roomId, message }) {
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

      if (room.user_id !== socket.userId && room.company_id !== socket.userId) {
        throw new Error('메시지 전송 권한이 없습니다.');
      }

      // DB에 메시지 저장
      const { data: newMessage, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          room_id: roomId,
          sender_id: socket.userId,
          message: message.trim(),
          is_read: false
        })
        .select()
        .single();

      if (messageError) {
        console.error('메시지 DB 저장 실패:', messageError);
        throw new Error('메시지 저장에 실패했습니다.');
      }

      // 채팅방의 모든 참여자에게 실시간 브로드캐스트
      this.io.to(roomId).emit('new-message', {
        id: newMessage.id,
        room_id: roomId,
        sender_id: socket.userId,
        message: message.trim(),
        created_at: newMessage.created_at,
        is_read: false
      });

      // 채팅방 정보 업데이트 (마지막 메시지, 읽지 않은 메시지 수)
      await this.updateChatRoomInfo(roomId, message.trim(), socket.userId, room);

      console.log(`메시지 전송 완료: ${socket.userId} -> 채팅방 ${roomId}`);

    } catch (error) {
      console.error('메시지 전송 실패:', error);
      throw error;
    }
  }

  // 채팅방 정보 업데이트 (마지막 메시지, 읽지 않은 메시지 수)
  async updateChatRoomInfo(roomId, lastMessage, senderId, room) {
    try {
      // 읽지 않은 메시지 수 증가
      const updates = {
        last_message: lastMessage,
        last_message_at: new Date().toISOString()
      };

      // 발신자가 아닌 사용자의 읽지 않은 메시지 수 증가
      if (senderId === room.user_id) {
        // 구직자가 보낸 메시지 -> 회사의 읽지 않은 메시지 수 증가
        updates.company_unread_count = supabase.rpc('increment', { x: 1 });
      } else {
        // 회사가 보낸 메시지 -> 구직자의 읽지 않은 메시지 수 증가
        updates.user_unread_count = supabase.rpc('increment', { x: 1 });
      }

      const { error } = await supabase
        .from('chat_rooms')
        .update(updates)
        .eq('id', roomId);

      if (error) {
        console.error('채팅방 정보 업데이트 실패:', error);
      }
    } catch (error) {
      console.error('채팅방 정보 업데이트 오류:', error);
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
    if (socketId) {
      this.io.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }
}

module.exports = ChatSocketHandler;