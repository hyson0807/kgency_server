const { supabase } = require('../config/database');
const appleReceiptVerify = require('node-apple-receipt-verify');
const { google } = require('googleapis');
const { SolapiMessageService } = require('solapi');

class PurchaseService {
  constructor() {
    // SMS 서비스 초기화
    this.messageService = new SolapiMessageService(
      process.env.SOLAPI_API_KEY,
      process.env.SOLAPI_API_SECRET
    );

    // Apple 영수증 검증 설정
    appleReceiptVerify.config({
      secret: process.env.APPLE_SHARED_SECRET,
      environment: process.env.IAP_ENVIRONMENT === 'production' ? ['production'] : ['sandbox'],
      verbose: process.env.NODE_ENV !== 'production'
    });

    // Google Play 검증 설정
    this.androidPublisher = google.androidpublisher('v3');
    
    try {
      // 환경변수를 사용한 안전한 인증 - GoogleAuth 방식 사용
      const formatPrivateKey = (key) => {
        if (!key) {
          console.error('GOOGLE_PRIVATE_KEY 환경변수가 설정되지 않았습니다.');
          return null;
        }
        
        // 따옴표 제거
        let formattedKey = key.replace(/^["']|["']$/g, '');
        
        // 이스케이프된 개행 문자를 실제 개행으로 변환
        formattedKey = formattedKey.replace(/\\n/g, '\n');
        
        return formattedKey;
      };
      
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        throw new Error('Google Service Account 환경변수가 설정되지 않았습니다.');
      }
      
      const privateKey = formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY);
      if (!privateKey) {
        throw new Error('GOOGLE_PRIVATE_KEY 포맷이 올바르지 않습니다.');
      }
      
      // 서비스 계정 credentials 객체 생성
      const credentials = {
        type: 'service_account',
        project_id: 'kgency-expo-project',
        private_key_id: '70bda2aee0375bbf4dc19429b867678e9e94f1c1',
        private_key: privateKey,
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        client_id: '115005557710037850665',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)}`,
        universe_domain: 'googleapis.com'
      };
      
      // GoogleAuth 객체 생성 (credentials 직접 사용)
      this.googleAuth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/androidpublisher']
      });
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Google Auth 환경변수 기반 인증 초기화 성공');
        console.log('Service Account Email:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
        console.log('Private Key Length:', privateKey.length);
      }
      
    } catch (error) {
      console.error('❌ Google Auth 초기화 실패:', error.message);
      this.googleAuth = null;
    }
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
      console.log('Google Auth Object:', this.googleAuth ? 'Initialized' : 'Not Initialized');
      
      // 환경변수 검증
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        console.error('Google Play 서비스 계정 정보가 설정되지 않았습니다.');
        console.error('Google Play Console에서 서비스 계정을 생성하고 .env 파일에 설정해주세요.');
        
        return { 
          isValid: false, 
          error: 'Google Play service account not configured' 
        };
      }
      
      // Google Auth 객체 검증
      if (!this.googleAuth) {
        console.error('Google Auth가 초기화되지 않았습니다.');
        return { 
          isValid: false, 
          error: 'Google Auth not initialized' 
        };
      }
      
      // Google Auth 클라이언트 획득
      console.log('Google Auth 클라이언트 획득 중...');
      let authClient;
      try {
        authClient = await this.googleAuth.getClient();
        console.log('✅ Google Auth 클라이언트 획득 성공');
      } catch (authError) {
        console.error('❌ Google Auth 클라이언트 획득 실패:', authError);
        return { 
          isValid: false, 
          error: `Google Auth failed: ${authError.message}` 
        };
      }
      
      // Google Play API 호출
      console.log('Google Play API 호출 중...');
      const response = await this.androidPublisher.purchases.products.get({
        packageName: process.env.GOOGLE_PACKAGE_NAME,
        productId: productId,
        token: purchaseToken,
        auth: authClient
      });

      const purchase = response.data;
      console.log('Google Play API Response Status:', response.status);
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
          description: `토큰 ${amount}개 구매 (${productId || 'token_5_pack'})`
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
          description: description
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

  async processYatraPurchase(userId, email, platform, receiptData, purchaseToken) {
    try {
      console.log('=== Processing Yatra Package Purchase ===');
      console.log('User ID:', userId);
      console.log('Email:', email);
      console.log('Platform:', platform);

      // 1. 영수증 검증
      let verificationResult;
      if (platform === 'ios') {
        verificationResult = await this.verifyAppleReceiptForYatra(receiptData, userId);
      } else if (platform === 'android') {
        verificationResult = await this.verifyGoogleReceipt(purchaseToken, userId, 'yatra_package_1');
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
        console.log('Yatra purchase already processed, returning existing data');
        return {
          success: true,
          purchase: existingPurchase,
          tokensAdded: existingPurchase.tokens_given,
          alreadyProcessed: true
        };
      }

      // 3. 구매 기록 저장 (이메일은 SMS로 별도 처리)
      const { data: purchase, error: purchaseError } = await supabase
        .from('purchases')
        .insert({
          user_id: userId,
          product_id: 'yatra_package_1',
          transaction_id: verificationResult.transactionId,
          platform: platform,
          price_cents: 5500000, // ₩55,000
          currency: 'KRW',
          tokens_given: 20,
          status: 'completed',
          receipt_data: receiptData || purchaseToken,
          verification_data: verificationResult.verificationData,
          verified_at: new Date().toISOString()
        })
        .select()
        .single();

      if (purchaseError) throw purchaseError;

      // 4. 토큰 20개 지급
      await this.addTokensToUser(userId, 10, purchase.id, 'yatra_package_1');

      // 5. 관리자에게 SMS 알림 (실패해도 구매는 성공으로 처리)
      try {
        await this.sendYatraPurchaseNotification(userId, email);
      } catch (smsError) {
        console.error('SMS notification failed:', smsError);
        // SMS 실패는 구매 성공에 영향을 주지 않음
      }

      return {
        success: true,
        purchase: purchase,
        tokensAdded: 10
      };

    } catch (error) {
      console.error('Yatra purchase processing failed:', error);
      throw error;
    }
  }

  async verifyAppleReceiptForYatra(receiptData, userId) {
    try {
      console.log('Verifying Apple receipt for Yatra package, user:', userId);
      
      const products = await appleReceiptVerify.validate({
        receipt: receiptData,
        environment: ['sandbox']
      });

      console.log('Apple receipt verification result:', JSON.stringify(products, null, 2));
      
      let yatraPurchase = null;
      
      if (Array.isArray(products)) {
        yatraPurchase = products.find(item => item.productId === 'yatra_package_1');
      } else {
        let receiptInfo = [];
        if (products.latest_receipt_info && products.latest_receipt_info.length > 0) {
          receiptInfo = products.latest_receipt_info;
        } else if (products.receipt && products.receipt.in_app && products.receipt.in_app.length > 0) {
          receiptInfo = products.receipt.in_app;
        }
        
        yatraPurchase = receiptInfo.find(item => item.product_id === 'yatra_package_1');
      }

      if (!yatraPurchase) {
        throw new Error('Yatra package purchase not found in receipt');
      }

      const transactionId = yatraPurchase.transactionId || yatraPurchase.transaction_id;
      const productId = yatraPurchase.productId || yatraPurchase.product_id;
      const purchaseDate = yatraPurchase.purchaseDate || parseInt(yatraPurchase.purchase_date_ms);

      return {
        isValid: true,
        transactionId: transactionId,
        productId: productId,
        purchaseDate: new Date(purchaseDate),
        verificationData: products
      };
    } catch (error) {
      console.error('Apple receipt verification for Yatra failed:', error);
      return { isValid: false, error: error.message };
    }
  }

  async sendYatraPurchaseNotification(userId, email) {
    try {
      console.log('Sending Yatra purchase notification SMS');
      
      // 사용자 정보 조회
      const { data: userProfile, error: userError } = await supabase
        .from('profiles')
        .select('name, phone_number')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('Failed to get user profile:', userError);
        throw new Error('Failed to get user profile');
      }

      const userName = userProfile?.name || '사용자';
      const userPhone = userProfile?.phone_number || '정보없음';
      
      // 관리자에게 SMS 전송
      const adminPhone = '010-8335-7026';
      const message = `[야트라 패키지 구매 알림]
      
구매자: ${userName}
전화번호: ${userPhone}
이메일: ${email}
구매시간: ${new Date().toLocaleString('ko-KR')}

PDF 파일과 구직 확정권을 이메일로 발송해 주세요.`;

      const result = await this.messageService.send({
        'to': adminPhone,
        'from': process.env.SENDER_PHONE,
        'text': message
      });

      console.log('Yatra purchase notification SMS sent successfully:', result);
      return { success: true };

    } catch (error) {
      console.error('Failed to send Yatra purchase notification:', error);
      throw new Error('SMS notification failed');
    }
  }
}

module.exports = new PurchaseService();