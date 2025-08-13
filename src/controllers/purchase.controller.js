const purchaseService = require('../services/purchase.service');

class PurchaseController {
  async verifyPurchase(req, res) {
    try {
      const { platform, receiptData, purchaseToken } = req.body;
      const userId = req.user.userId;

      if (!platform || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters'
        });
      }

      if (platform === 'ios' && !receiptData) {
        return res.status(400).json({
          success: false,
          error: 'Receipt data required for iOS'
        });
      }

      if (platform === 'android' && !purchaseToken) {
        return res.status(400).json({
          success: false,
          error: 'Purchase token required for Android'
        });
      }

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
      
      let statusCode = 500;
      let errorMessage = 'Internal server error';

      if (error.message.includes('already processed')) {
        statusCode = 409;
        errorMessage = 'Purchase already processed';
      } else if (error.message.includes('verification failed')) {
        statusCode = 400;
        errorMessage = 'Invalid receipt';
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
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
}

module.exports = new PurchaseController();