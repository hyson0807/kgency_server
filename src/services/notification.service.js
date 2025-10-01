const { Expo } = require('expo-server-sdk');
const { supabase } = require('../config/database');

// Create a new Expo SDK client
const expo = new Expo();

class NotificationService {
  /**
   * Send push notification to a user
   * @param {string} userId - User ID to send notification to
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Additional data to send with notification
   */
  async sendToUser(userId, title, body, data = {}) {
    try {
      // Get user's push token from database
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', userId)
        .single();

      if (error || !profile?.push_token) {
        console.log(`No push token found for user ${userId}`);
        return false;
      }

      // Send notification
      return await this.sendNotification(profile.push_token, title, body, data);
    } catch (error) {
      console.error('Error sending notification to user:', error);
      return false;
    }
  }

  /**
   * Send push notification to multiple users
   * @param {string[]} userIds - Array of user IDs
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Additional data
   */
  async sendToMultipleUsers(userIds, title, body, data = {}) {
    try {
      // Get push tokens for all users
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, push_token')
        .in('id', userIds)
        .not('push_token', 'is', null);

      if (error || !profiles?.length) {
        console.log('No push tokens found for users');
        return false;
      }

      // Create messages for all users
      const messages = profiles.map(profile => ({
        to: profile.push_token,
        sound: 'default',
        title,
        body,
        data: { ...data, userId: profile.id },
      }));

      return await this.sendBatchNotifications(messages);
    } catch (error) {
      console.error('Error sending notifications to multiple users:', error);
      return false;
    }
  }





  // 새로운 지원자 알림 기능 제거됨 - 채팅 알림만 사용
  // /**
  //  * Send new application notification to company
  //  * @param {string} companyId - Company ID who will receive the notification
  //  * @param {string} userName - Name of the user who applied
  //  * @param {string} jobTitle - Job title
  //  * @param {string} applicationType - Type of application ('instant_interview', 'regular')
  //  * @param {string} applicationId - Application ID for navigation
  //  * @param {string} jobPostingId - Job posting ID for navigation
  //  */
  // async sendNewApplicationNotification(companyId, userName, jobTitle, applicationType, applicationId, jobPostingId) {
  //   const typeText = applicationType === 'instant_interview' ? '즉시면접' : '일반';
  //   const title = '새로운 지원자가 있습니다!';
  //   const body = `${userName}님이 ${jobTitle} 포지션에 ${typeText} 지원했습니다.`;
  //   const data = {
  //     type: 'new_application',
  //     applicationId,
  //     jobPostingId,
  //     userName,
  //     jobTitle,
  //     applicationType,
  //   };

  //   return await this.sendToUser(companyId, title, body, data);
  // }





  /**
   * Send chat message notification to user with badge count
   * @param {string} userId - User ID who will receive the notification
   * @param {string} senderName - Name of the message sender
   * @param {string} messageContent - Content of the message (truncated for privacy)
   * @param {string} roomId - Chat room ID for navigation
   * @param {number} totalUnreadCount - Total unread message count for badge
   */
  async sendChatMessageNotification(userId, senderName, messageContent, roomId, totalUnreadCount = null) {
    try {
      const title = senderName || '새 메시지';
      // Truncate message for privacy and notification size limit
      const truncatedMessage = messageContent.length > 100 
        ? messageContent.substring(0, 97) + '...' 
        : messageContent;
      const body = truncatedMessage;
      const data = {
        type: 'chat_message',
        roomId,
        senderName,
      };

      // Get badge count if not provided
      let badgeCount = totalUnreadCount;
      if (badgeCount === null) {
        try {
          const UnreadCountManager = require('./UnreadCountManager');
          const unreadCountManager = new UnreadCountManager();
          badgeCount = await unreadCountManager.getTotalUnreadCount(userId);
        } catch (error) {
          console.error('Error getting unread count for badge:', error);
          badgeCount = 1; // Fallback to 1 to show there's at least one unread message
        }
      }

      return await this.sendToUserWithBadge(userId, title, body, data, badgeCount);
    } catch (error) {
      console.error('Error sending chat message notification:', error);
      return false;
    }
  }

  /**
   * Send push notification to a user with badge count
   * @param {string} userId - User ID to send notification to
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Additional data to send with notification
   * @param {number} badgeCount - Badge count for app icon
   */
  async sendToUserWithBadge(userId, title, body, data = {}, badgeCount = 0) {
    try {
      // Get user's push token from database
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', userId)
        .single();

      if (error || !profile?.push_token) {
        console.log(`No push token found for user ${userId}`);
        return false;
      }

      // Send notification with badge
      return await this.sendNotificationWithBadge(profile.push_token, title, body, data, badgeCount);
    } catch (error) {
      console.error('Error sending notification with badge to user:', error);
      return false;
    }
  }

  /**
   * Core notification sending logic
   * @param {string} pushToken - Expo push token
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Additional data
   */
  async sendNotification(pushToken, title, body, data = {}) {
    // Check that push token is valid
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`Push token ${pushToken} is not a valid Expo push token`);
      return false;
    }

    try {
      const message = {
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
      };

      const chunks = expo.chunkPushNotifications([message]);
      const tickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error('Error sending notification chunk:', error);
        }
      }

      // Check receipts after a delay
      setTimeout(() => this.checkReceipts(tickets), 5000);

      return true;
    } catch (error) {
      console.error('Error sending notification:', error);
      return false;
    }
  }

  /**
   * Core notification sending logic with badge count
   * @param {string} pushToken - Expo push token
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Additional data
   * @param {number} badgeCount - Badge count for app icon
   */
  async sendNotificationWithBadge(pushToken, title, body, data = {}, badgeCount = 0) {
    // Check that push token is valid
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`Push token ${pushToken} is not a valid Expo push token`);
      return false;
    }

    try {
      const message = {
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
        badge: badgeCount, // 🔧 배지 카운트 추가
        priority: 'high',
      };

      const chunks = expo.chunkPushNotifications([message]);
      const tickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error('Error sending notification chunk:', error);
        }
      }

      // Check receipts after a delay
      setTimeout(() => this.checkReceipts(tickets), 5000);

      console.log(`푸시 알림 전송 완료 - 배지 카운트: ${badgeCount}`);
      return true;
    } catch (error) {
      console.error('Error sending notification with badge:', error);
      return false;
    }
  }

  /**
   * Send batch notifications
   * @param {Array} messages - Array of message objects
   */
  async sendBatchNotifications(messages) {
    // Filter out invalid tokens
    const validMessages = messages.filter(message => 
      Expo.isExpoPushToken(message.to)
    );

    if (validMessages.length === 0) {
      console.log('No valid push tokens in batch');
      return false;
    }

    try {
      const chunks = expo.chunkPushNotifications(validMessages);
      const tickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error('Error sending notification chunk:', error);
        }
      }

      // Check receipts after a delay
      setTimeout(() => this.checkReceipts(tickets), 5000);

      return true;
    } catch (error) {
      console.error('Error sending batch notifications:', error);
      return false;
    }
  }

  /**
   * Check notification receipts
   * @param {Array} tickets - Array of notification tickets
   */
  async checkReceipts(tickets) {
    const receiptIds = tickets
      .filter(ticket => ticket.id)
      .map(ticket => ticket.id);

    if (receiptIds.length === 0) return;

    try {
      const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
      
      for (const chunk of receiptIdChunks) {
        try {
          const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
          
          for (const receiptId in receipts) {
            const { status, message, details } = receipts[receiptId];
            
            if (status === 'error') {
              console.error(`Error sending notification ${receiptId}:`, message);
              
              if (details && details.error === 'DeviceNotRegistered') {
                // TODO: Remove invalid push token from database
                console.log('Device not registered, should remove token');
              }
            }
          }
        } catch (error) {
          console.error('Error fetching receipts:', error);
        }
      }
    } catch (error) {
      console.error('Error checking receipts:', error);
    }
  }
}

module.exports = new NotificationService();