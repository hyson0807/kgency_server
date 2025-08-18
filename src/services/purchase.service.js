const { supabase } = require('../config/database');
const appleReceiptVerify = require('node-apple-receipt-verify');
const { google } = require('googleapis');

class PurchaseService {
  constructor() {
    // Apple 영수증 검증 설정
    appleReceiptVerify.config({
      secret: process.env.APPLE_SHARED_SECRET,
      environment: process.env.IAP_ENVIRONMENT === 'production' ? ['production'] : ['sandbox'],
      verbose: process.env.NODE_ENV !== 'production'
    });

    // Google Play 검증 설정
    this.androidPublisher = google.androidpublisher('v3');
    
    // Private key를 완전한 PEM 형식으로 변환
    const formatPrivateKey = (key) => {
      if (!key) return null;
      if (key.includes('-----BEGIN PRIVATE KEY-----')) return key;
      return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`;
    };
    
    this.googleAuth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY),
      ['https://www.googleapis.com/auth/androidpublisher']
    );
  }

  async verifyAppleReceipt(receiptData, userId) {
    try {
      console.log('Verifying Apple receipt for user:', userId);
      console.log('Receipt data length:', receiptData?.length || 'undefined');
      
      // Apple Receipt 검증 옵션 단순화
      const products = await appleReceiptVerify.validate({
        receipt: receiptData,
        environment: ['sandbox']  // 개발 환경에서는 sandbox만 사용
      });

      // node-apple-receipt-verify가 이미 파싱된 결과를 배열로 반환함
      console.log('Full products response:', JSON.stringify(products, null, 2));
      console.log('products type:', typeof products);
      console.log('products is array:', Array.isArray(products));
      
      let tokenPurchase = null;
      
      // products가 배열인 경우 (라이브러리가 파싱한 결과)
      if (Array.isArray(products)) {
        console.log('products is array, searching directly');
        tokenPurchase = products.find(item => item.productId === 'token_5_pack');
        console.log('Found in array:', tokenPurchase);
      } else {
        // products가 객체인 경우 (원시 응답)
        console.log('products is object, searching in receipt info');
        let receiptInfo = [];
        if (products.latest_receipt_info && products.latest_receipt_info.length > 0) {
          receiptInfo = products.latest_receipt_info;
          console.log('Using latest_receipt_info:', receiptInfo);
        } else if (products.receipt && products.receipt.in_app && products.receipt.in_app.length > 0) {
          receiptInfo = products.receipt.in_app;
          console.log('Using receipt.in_app:', receiptInfo);
        }
        
        console.log('Receipt info to search:', receiptInfo);
        tokenPurchase = receiptInfo.find(item => item.product_id === 'token_5_pack');
      }

      if (!tokenPurchase) {
        throw new Error('Token purchase not found in receipt');
      }

      // 필드명 통일 처리
      const transactionId = tokenPurchase.transactionId || tokenPurchase.transaction_id;
      const productId = tokenPurchase.productId || tokenPurchase.product_id;
      const purchaseDate = tokenPurchase.purchaseDate || parseInt(tokenPurchase.purchase_date_ms);

      return {
        isValid: true,
        transactionId: transactionId,
        productId: productId,
        purchaseDate: new Date(purchaseDate),
        verificationData: products
      };
    } catch (error) {
      console.error('Apple receipt verification failed:', error);
      return { isValid: false, error: error.message };
    }
  }

  async verifyGoogleReceipt(purchaseToken, userId, productId = 'token_5_pack_android') {
    try {
      console.log('=== Google Receipt Verification ===');
      console.log('Purchase Token:', purchaseToken ? `${purchaseToken.substring(0, 20)}...` : 'Missing');
      console.log('Product ID:', productId);
      console.log('Package Name:', process.env.GOOGLE_PACKAGE_NAME);
      console.log('Service Account Email:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'Present' : 'Missing');
      console.log('Private Key:', process.env.GOOGLE_PRIVATE_KEY ? 'Present' : 'Missing');
      
      // 환경변수 검증
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        console.error('Google Play 서비스 계정 정보가 설정되지 않았습니다.');
        console.error('Google Play Console에서 서비스 계정을 생성하고 .env 파일에 설정해주세요.');
        
        // 개발 환경에서는 임시로 성공 처리 (테스트용)
        if (process.env.NODE_ENV === 'development') {
          console.warn('개발 환경: Google Play 검증을 건너뜁니다.');
          return {
            isValid: true,
            transactionId: `DEV_${Date.now()}`,
            productId: productId,
            purchaseDate: new Date(),
            verificationData: { 
              developmentMode: true,
              message: 'Google Play verification skipped in development'
            }
          };
        }
        
        return { 
          isValid: false, 
          error: 'Google Play service account not configured' 
        };
      }
      
      // Google Play API 호출
      const response = await this.androidPublisher.purchases.products.get({
        packageName: process.env.GOOGLE_PACKAGE_NAME,
        productId: productId,
        token: purchaseToken,
        auth: this.googleAuth
      });

      const purchase = response.data;
      console.log('Google Play API Response:', JSON.stringify(purchase, null, 2));
      
      // 구매 상태 확인 (0 = purchased, 1 = canceled)
      if (purchase.purchaseState !== 0) {
        console.error('Purchase state is not valid:', purchase.purchaseState);
        throw new Error('Purchase not in purchased state');
      }
      
      // acknowledgementState 확인 (0 = unacknowledged, 1 = acknowledged)
      if (purchase.acknowledgementState === 0) {
        console.log('Purchase needs acknowledgement');
        // 여기서 acknowledgement 처리 가능
      }

      // 고유한 transaction ID 생성 (재구매 지원을 위해)
      const transactionId = purchase.orderId || `ANDROID_${userId}_${purchase.purchaseTimeMillis}`;
      
      return {
        isValid: true,
        transactionId: transactionId,
        productId: productId,
        purchaseDate: new Date(parseInt(purchase.purchaseTimeMillis)),
        verificationData: purchase
      };
    } catch (error) {
      console.error('Google receipt verification failed:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        response: error.response?.data
      });
      
      // API 키 관련 에러 처리
      if (error.message?.includes('invalid_grant') || error.status === 401) {
        console.error('Google Play API 인증 실패. 서비스 계정 키를 확인해주세요.');
      }
      
      return { isValid: false, error: error.message };
    }
  }

  async processPurchase(userId, platform, receiptData, purchaseToken) {
    try {
      // 1. 영수증 검증 - 플랫폼별 제품 ID 전달
      let verificationResult;
      if (platform === 'ios') {
        verificationResult = await this.verifyAppleReceipt(receiptData, userId);
      } else if (platform === 'android') {
        // Android의 경우 token_5_pack_android 제품 ID로 검증
        verificationResult = await this.verifyGoogleReceipt(purchaseToken, userId, 'token_5_pack_android');
      } else {
        throw new Error('Invalid platform');
      }

      if (!verificationResult.isValid) {
        throw new Error(`Receipt verification failed: ${verificationResult.error}`);
      }

      // 2. 중복 구매 확인
      const { data: existingPurchase } = await supabase
        .from('purchases')
        .select('id, tokens_given')
        .eq('transaction_id', verificationResult.transactionId)
        .single();

      if (existingPurchase) {
        console.log('Purchase already processed, returning existing data');
        return {
          success: true,
          purchase: existingPurchase,
          tokensAdded: existingPurchase.tokens_given,
          alreadyProcessed: true
        };
      }

      // 3. 트랜잭션 시작
      const { data: purchase, error: purchaseError } = await supabase
        .from('purchases')
        .insert({
          user_id: userId,
          product_id: verificationResult.productId,
          transaction_id: verificationResult.transactionId,
          platform: platform,
          price_cents: 550000, // ₩5,500
          currency: 'KRW',
          tokens_given: 5,
          status: 'completed',
          receipt_data: receiptData || purchaseToken,
          verification_data: verificationResult.verificationData,
          verified_at: new Date().toISOString()
        })
        .select()
        .single();

      if (purchaseError) throw purchaseError;

      // 4. 토큰 지급
      await this.addTokensToUser(userId, 5, purchase.id, verificationResult.productId);

      return {
        success: true,
        purchase: purchase,
        tokensAdded: 5
      };

    } catch (error) {
      console.error('Purchase processing failed:', error);
      throw error;
    }
  }

  async addTokensToUser(userId, amount, purchaseId, productId = null) {
    try {
      // 1. 사용자 토큰 잔액 업데이트 (UPSERT)
      const { data: currentTokens } = await supabase
        .from('user_tokens')
        .select('balance')
        .eq('user_id', userId)
        .single();

      const newBalance = (currentTokens?.balance || 0) + amount;

      const { error: upsertError } = await supabase
        .from('user_tokens')
        .upsert({
          user_id: userId,
          balance: newBalance
        }, {
          onConflict: 'user_id'
        });

      if (upsertError) throw upsertError;

      // 2. 거래 내역 기록
      const { error: transactionError } = await supabase
        .from('token_transactions')
        .insert({
          user_id: userId,
          amount: amount,
          type: 'purchase',
          reference_id: purchaseId,
          description: `토큰 ${amount}개 구매`,
          metadata: { product_id: productId || 'token_5_pack', purchase_id: purchaseId }
        });

      if (transactionError) throw transactionError;

      return { success: true };

    } catch (error) {
      console.error('Failed to add tokens:', error);
      throw error;
    }
  }

  async spendTokens(userId, amount, description, referenceId = null) {
    try {
      // 1. 현재 잔액 확인
      const { data: userTokens, error: fetchError } = await supabase
        .from('user_tokens')
        .select('balance')
        .eq('user_id', userId)
        .single();

      if (fetchError || !userTokens) {
        throw new Error('User tokens not found');
      }

      if (userTokens.balance < amount) {
        throw new Error('Insufficient tokens');
      }

      // 2. 잔액 차감
      const newBalance = userTokens.balance - amount;
      const { error: updateError } = await supabase
        .from('user_tokens')
        .update({ balance: newBalance })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // 3. 거래 내역 기록
      const { data: transaction, error: transactionError } = await supabase
        .from('token_transactions')
        .insert({
          user_id: userId,
          amount: -amount, // 음수로 기록
          type: 'spend',
          reference_id: referenceId,
          description: description,
          metadata: { remaining_balance: newBalance }
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      return {
        success: true,
        remainingBalance: newBalance,
        transactionId: transaction.id
      };

    } catch (error) {
      console.error('Failed to spend tokens:', error);
      throw error;
    }
  }

  async getUserTokenBalance(userId) {
    const { data, error } = await supabase
      .from('user_tokens')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    return data?.balance || 0;
  }

  async getUserPurchaseHistory(userId) {
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getUserTokenTransactions(userId, limit = 50) {
    const { data, error } = await supabase
      .from('token_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }
}

module.exports = new PurchaseService();