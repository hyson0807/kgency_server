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

  /**
   * Send interview proposal notification
   * @param {string} userId - User ID who will receive the notification
   * @param {string} companyName - Name of the company
   * @param {string} jobTitle - Job title
   * @param {string} applicationId - Application ID for navigation
   */
  async sendInterviewProposalNotification(userId, companyName, jobTitle, applicationId) {
    const title = '면접 제안이 도착했습니다!';
    const body = `${companyName}에서 ${jobTitle} 포지션 면접을 제안했습니다.`;
    const data = {
      type: 'interview_proposal',
      applicationId,
      companyName,
      jobTitle,
    };

    return await this.sendToUser(userId, title, body, data);
  }

  /**
   * Send application status update notification
   * @param {string} userId - User ID
   * @param {string} companyName - Company name
   * @param {string} status - New status
   * @param {string} applicationId - Application ID
   */
  async sendApplicationStatusNotification(userId, companyName, status, applicationId) {
    const statusMessages = {
      accepted: '지원이 승인되었습니다!',
      rejected: '지원이 거절되었습니다.',
      pending: '지원이 검토 중입니다.',
    };

    const title = '지원 상태 업데이트';
    const body = `${companyName} - ${statusMessages[status] || '상태가 변경되었습니다.'}`;
    const data = {
      type: 'application_status',
      applicationId,
      status,
      companyName,
    };

    return await this.sendToUser(userId, title, body, data);
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