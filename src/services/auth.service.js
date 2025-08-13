const { supabase } = require('../config');
const jwt = require('jsonwebtoken');
const { SolapiMessageService } = require('solapi');

const messageService = new SolapiMessageService(
    process.env.SOLAPI_API_KEY,
    process.env.SOLAPI_API_SECRET
);

const otpStore = new Map();

// OTP 생성
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// OTP 발송
const sendOTP = async (phone) => {
    const otp = generateOTP();
    otpStore.set(phone, { otp, expires: Date.now() + 300000 }); // 5분

    console.log('생성된 OTP:', otp);

    const result = await messageService.send({
        'to': phone,
        'from': process.env.SENDER_PHONE,
        'text': `인증번호: ${otp}`
    });

    console.log('SMS 발송 성공:', result);
    return { success: true };
};

// OTP 검증 및 인증
const verifyOTP = async (phone, otp, userType, isDemoAccount = false) => {
    console.log('OTP 검증:', phone, otp, userType, isDemoAccount);

    // 애플 심사용 데모 계정 처리
    const demoAccounts = {
        '+821099999999': { name: '애플 심사 구직자', type: 'user', validOtp: '999999' },
        '+821088888888': { name: '애플 심사 회사', type: 'company', validOtp: '888888' }
    };
    
    // 데모 계정 체크 (프로덕션에서도 동작)
    if (isDemoAccount && demoAccounts[phone]) {
        const demoInfo = demoAccounts[phone];
        if (otp === demoInfo.validOtp && userType === demoInfo.type) {
            return handleDemoAccount(phone, demoInfo);
        }
    }

    // 개발 모드 테스트 계정 처리
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const isTestOTP = otp === '123456';
    const testAccounts = {
        '+821011111111': { name: '테스트 구직자', type: 'user' },
        '+821022222222': { name: '테스트 회사', type: 'company' }
    };

    // 테스트 계정 처리
    if (isDevelopment && isTestOTP && testAccounts[phone]) {
        return handleTestAccount(phone, testAccounts[phone]);
    }

    // 일반 OTP 확인
    const stored = otpStore.get(phone);
    if (!stored) {
        throw new Error('OTP를 찾을 수 없습니다');
    }

    if (Date.now() > stored.expires) {
        otpStore.delete(phone);
        throw new Error('OTP가 만료되었습니다');
    }

    if (stored.otp !== otp) {
        throw new Error('잘못된 인증번호입니다');
    }

    otpStore.delete(phone);

    // 실제 인증 처리
    return handleAuthentication(phone, userType);
};

// 애플 심사용 데모 계정 처리
const handleDemoAccount = async (phone, demoInfo) => {
    const { data: existingUser } = await supabase
        .from('profiles')
        .select('*')
        .eq('phone_number', phone)
        .single();

    if (existingUser) {
        // 데모 계정도 userType 검증
        if (existingUser.user_type !== demoInfo.type) {
            throw new Error(
                existingUser.user_type === 'user'
                    ? '구직자 계정입니다. 구직자 로그인을 이용해주세요.'
                    : '구인자 계정입니다. 구인자 로그인을 이용해주세요.'
            );
        }

        // 기존 데모 유저 로그인
        const token = jwt.sign({
            userId: existingUser.id,
            phone: phone,
            userType: demoInfo.type
        }, process.env.JWT_SECRET, { expiresIn: '7d' });

        return {
            token,
            user: {
                userId: existingUser.id,
                phone: phone,
                userType: demoInfo.type,
                isNewUser: false
            },
            onboardingStatus: {
                completed: existingUser.onboarding_completed || false
            },
            message: '데모 계정으로 로그인되었습니다'
        };
    }

    // 신규 데모 유저 생성
    return createNewUser(phone, demoInfo.type, demoInfo.name);
};

// 테스트 계정 처리
const handleTestAccount = async (phone, testInfo) => {
    const { data: existingUser } = await supabase
        .from('profiles')
        .select('*')
        .eq('phone_number', phone)
        .single();

    if (existingUser) {
        // 테스트 계정도 userType 검증 추가
        if (existingUser.user_type !== testInfo.type) {
            throw new Error(
                existingUser.user_type === 'user'
                    ? '구직자 테스트 계정입니다. 구직자 로그인을 이용해주세요.'
                    : '구인자 테스트 계정입니다. 구인자 로그인을 이용해주세요.'
            );
        }

        // 기존 테스트 유저 로그인
        const token = jwt.sign({
            userId: existingUser.id,
            phone: phone,
            userType: testInfo.type
        }, process.env.JWT_SECRET, { expiresIn: '7d' });

        return {
            token,
            user: {
                userId: existingUser.id,
                phone: phone,
                userType: testInfo.type,
                isNewUser: false
            },
            onboardingStatus: {
                completed: existingUser.onboarding_completed || false
            },
            message: '테스트 계정으로 로그인되었습니다'
        };
    }

    // 신규 테스트 유저 생성
    return createNewUser(phone, testInfo.type, testInfo.name);
};


// 실제 인증 처리
const handleAuthentication = async (phone, userType) => {
    const { data: existingUser, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('phone_number', phone)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
    }

    if (existingUser) {
        // 기존 유저 로그인 시 userType 검증 추가
        if (existingUser.user_type !== userType) {
            throw new Error(
                existingUser.user_type === 'user'
                    ? '구직자 계정입니다. 구직자 로그인을 이용해주세요.'
                    : '구인자 계정입니다. 구인자 로그인을 이용해주세요.'
            );
        }

        // 기존 유저 로그인
        const token = jwt.sign({
            userId: existingUser.id,
            phone: phone,
            userType: existingUser.user_type
        }, process.env.JWT_SECRET, { expiresIn: '7d' });

        return {
            token,
            user: {
                userId: existingUser.id,
                phone: phone,
                userType: existingUser.user_type,
                isNewUser: false
            },
            onboardingStatus: {
                completed: existingUser.onboarding_completed || false
            },
            message: '로그인되었습니다'
        };
    }

    // 신규 유저 생성 (기존 코드 유지)
    if (!userType) {
        throw new Error('신규 가입 시 userType이 필요합니다');
    }

    return createNewUser(phone, userType);
};


// 신규 유저 생성
const createNewUser = async (phone, userType, name = null) => {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        phone: phone,
        phone_confirm: true
    });

    if (authError) throw authError;

    try {
        // 프로필 생성
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: authData.user.id,
                phone_number: phone,
                user_type: userType,
                name: name,
                onboarding_completed: false
            });

        if (profileError) throw profileError;

        // user_info 또는 company_info 생성
        if (userType === 'user') {
            await supabase.from('user_info').insert({ user_id: authData.user.id });
        } else if (userType === 'company') {
            await supabase.from('company_info').insert({ company_id: authData.user.id });
        }

        const token = jwt.sign({
            userId: authData.user.id,
            phone: phone,
            userType: userType
        }, process.env.JWT_SECRET, { expiresIn: '7d' });

        return {
            token,
            user: {
                userId: authData.user.id,
                phone: phone,
                userType: userType,
                isNewUser: true
            },
            onboardingStatus: {
                completed: false
            },
            message: '회원가입이 완료되었습니다'
        };

    } catch (error) {
        // 롤백
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw error;
    }
};

// 회원 탈퇴
const deleteAccount = async (userId) => {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
    return { message: '회원 탈퇴 완료' };
};

module.exports = {
    sendOTP,
    verifyOTP,
    deleteAccount
};