const purchaseService = require('../services/purchase.service');

class PurchaseController {
  async verifyPurchase(req, res) {
    try {
      console.log('=== Purchase Verification Request ===');
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      console.log('User ID from token:', req.user?.userId);
      
      const { platform, receiptData, purchaseToken } = req.body;
      const userId = req.user.userId;

      if (!platform || !userId) {
        console.log('Missing required parameters - platform:', platform, 'userId:', userId);
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters'
        });
      }

      if (platform === 'ios' && !receiptData) {
        console.log('Missing receipt data for iOS');
        return res.status(400).json({
          success: false,
          error: 'Receipt data required for iOS'
        });
      }

      if (platform === 'android' && !purchaseToken) {
        console.log('Missing purchase token for Android');
        return res.status(400).json({
          success: false,
          error: 'Purchase token required for Android'
        });
      }

      console.log('Starting purchase processing for platform:', platform);

      const result = await purchaseService.processPurchase(
        userId,
        platform,
        receiptData,
        purchaseToken
      );

      res.json({
        success: true,
        tokensAdded: result.tokensAdded,
        purchaseId: result.purchase.id
      });

    } catch (error) {
      console.error('Purchase verification failed:', error);
      console.error('Error stack:', error.stack);
      
      let statusCode = 500;
      let errorMessage = 'Internal server error';
      let detailMessage = error.message;

      if (error.message.includes('already processed')) {
        statusCode = 409;
        errorMessage = 'Purchase already processed';
        detailMessage = '이미 처리된 구매입니다.';
      } else if (error.message.includes('verification failed')) {
        statusCode = 400;
        errorMessage = 'Invalid receipt';
        detailMessage = '구매 영수증 검증에 실패했습니다.';
      } else if (error.message.includes('Google Auth failed') || error.message.includes('authentication credential')) {
        statusCode = 503;
        errorMessage = 'Service temporarily unavailable';
        detailMessage = 'Google Play API 인증에 실패했습니다. 잠시 후 다시 시도해주세요.';
      } else if (error.message.includes('Google Play service account not configured')) {
        statusCode = 503;
        errorMessage = 'Service configuration error';
        detailMessage = '서버 설정 오류입니다. 관리자에게 문의해주세요.';
      }

      // 개발 환경에서는 더 자세한 에러 정보 제공
      const responseData = {
        success: false,
        error: errorMessage,
        message: detailMessage
      };

      if (process.env.NODE_ENV === 'development') {
        responseData.debugInfo = {
          originalError: error.message,
          stack: error.stack
        };
      }

      res.status(statusCode).json(responseData);
    }
  }

  async getTokenBalance(req, res) {
    try {
      const userId = req.user.userId;
      const balance = await purchaseService.getUserTokenBalance(userId);
      
      res.json({
        success: true,
        balance: balance
      });
    } catch (error) {
      console.error('Failed to get token balance:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get token balance'
      });
    }
  }

  async getPurchaseHistory(req, res) {
    try {
      const userId = req.user.userId;
      const purchases = await purchaseService.getUserPurchaseHistory(userId);
      
      res.json({
        success: true,
        purchases: purchases
      });
    } catch (error) {
      console.error('Failed to get purchase history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get purchase history'
      });
    }
  }

  async getTokenTransactions(req, res) {
    try {
      const userId = req.user.userId;
      const { limit = 50 } = req.query;
      
      const transactions = await purchaseService.getUserTokenTransactions(
        userId,
        parseInt(limit)
      );
      
      res.json({
        success: true,
        transactions: transactions
      });
    } catch (error) {
      console.error('Failed to get token transactions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get token transactions'
      });
    }
  }

  async spendTokensForInstantInterview(req, res) {
    try {
      const userId = req.user.userId;
      const { applicationId } = req.body;

      if (!applicationId) {
        return res.status(400).json({
          success: false,
          error: 'Application ID required'
        });
      }

      const result = await purchaseService.spendTokens(
        userId,
        1, // 즉시면접 1회 = 토큰 1개
        '즉시면접 예약',
        applicationId
      );

      res.json({
        success: true,
        remainingBalance: result.remainingBalance,
        transactionId: result.transactionId
      });

    } catch (error) {
      console.error('Failed to spend tokens for instant interview:', error);
      
      let statusCode = 500;
      let errorMessage = 'Failed to process token payment';

      if (error.message.includes('Insufficient tokens')) {
        statusCode = 400;
        errorMessage = 'Insufficient tokens';
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  async verifyYatraPurchase(req, res) {
    try {
      console.log('=== Yatra Package Purchase Verification ===');
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      console.log('User ID from token:', req.user?.userId);
      
      const { platform, receiptData, purchaseToken, email, productId } = req.body;
      const userId = req.user.userId;

      if (!platform || !userId || !email) {
        console.log('Missing required parameters - platform:', platform, 'userId:', userId, 'email:', email);
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters'
        });
      }

      if (!productId || productId !== 'yatra_package_1') {
        console.log('Invalid product ID:', productId);
        return res.status(400).json({
          success: false,
          error: 'Invalid product ID'
        });
      }

      if (platform === 'ios' && !receiptData) {
        console.log('Missing receipt data for iOS');
        return res.status(400).json({
          success: false,
          error: 'Receipt data required for iOS'
        });
      }

      if (platform === 'android' && !purchaseToken) {
        console.log('Missing purchase token for Android');
        return res.status(400).json({
          success: false,
          error: 'Purchase token required for Android'
        });
      }

      console.log('Starting Yatra package purchase processing for platform:', platform);

      const result = await purchaseService.processYatraPurchase(
        userId,
        email,
        platform,
        receiptData,
        purchaseToken
      );

      res.json({
        success: true,
        tokensAdded: result.tokensAdded,
        purchaseId: result.purchase.id,
        message: 'Yatra package purchase completed successfully'
      });

    } catch (error) {
      console.error('Yatra purchase verification failed:', error);
      console.error('Error stack:', error.stack);
      
      let statusCode = 500;
      let errorMessage = 'Internal server error';
      let detailMessage = error.message;

      if (error.message.includes('already processed')) {
        statusCode = 409;
        errorMessage = 'Purchase already processed';
        detailMessage = '이미 처리된 구매입니다.';
      } else if (error.message.includes('verification failed')) {
        statusCode = 400;
        errorMessage = 'Invalid receipt';
        detailMessage = '구매 영수증 검증에 실패했습니다.';
      } else if (error.message.includes('Google Auth failed') || error.message.includes('authentication credential')) {
        statusCode = 503;
        errorMessage = 'Service temporarily unavailable';
        detailMessage = 'Google Play API 인증에 실패했습니다. 잠시 후 다시 시도해주세요.';
      } else if (error.message.includes('SMS notification failed')) {
        // SMS 실패해도 구매는 성공으로 처리
        console.warn('SMS notification failed but purchase was successful');
        return res.json({
          success: true,
          tokensAdded: 20,
          message: 'Yatra package purchase completed successfully'
        });
      }

      const responseData = {
        success: false,
        error: errorMessage,
        message: detailMessage
      };

      if (process.env.NODE_ENV === 'development') {
        responseData.debugInfo = {
          originalError: error.message,
          stack: error.stack
        };
      }

      res.status(statusCode).json(responseData);
    }
  }
}

module.exports = new PurchaseController();