const express = require('express');
const dotenv = require('dotenv');
// dotenv를 가장 먼저 로드
dotenv.config();

const cors = require('cors');
const { SolapiMessageService } = require('solapi');
const jwt = require('jsonwebtoken');
const { createClient } = require("@supabase/supabase-js");
const { OpenAI } = require("openai");

const PORT = process.env.PORT || 5004;
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';  // 기본값 제공

const app = express();
const otpStore = new Map();

// 환경 변수 검증
if (!process.env.KEY_1 || !process.env.KEY_2) {
    console.error('Supabase keys are missing!');
}

const supabase = createClient(process.env.KEY_1, process.env.KEY_2);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const messageService = new SolapiMessageService(process.env.SOLAPI_API_KEY, process.env.SOLAPI_API_SECRET);

app.use(cors());
app.use(express.json());

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

app.listen(PORT, () => {
    console.log(`Listening on ${PORT}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
});

// verify-otp 엔드포인트 수정
app.post('/verify-otp', async (req, res) => {
    try {
        const { phone, otp, userType } = req.body;
        console.log('OTP 검증 시작:', { phone, otp, userType });

        // 개발 모드 테스트 계정 (OTP: 123456)
        const isDevelopment = process.env.NODE_ENV !== 'production';
        const isTestOTP = otp === '123456';
        const testAccounts = {
            '+821011111111': { name: '테스트 구직자', type: 'user' },
            '+821022222222': { name: '테스트 회사', type: 'company' }
        };

        if (isDevelopment && isTestOTP && testAccounts[phone]) {
            // 테스트 계정 처리
            console.log('테스트 계정 로그인:', phone);

            // 기존 유저 확인
            const { data: existingUser, error: fetchError } = await supabase
                .from('profiles')
                .select('*')
                .eq('phone_number', phone)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') {
                console.error('기존 유저 확인 오류:', fetchError);
                throw fetchError;
            }

            let token;
            let userData;
            let onboardingStatus;

            if (existingUser) {
                // 기존 테스트 유저 로그인
                token = jwt.sign({
                    userId: existingUser.id,
                    phone: phone,
                    userType: existingUser.user_type
                }, JWT_SECRET, { expiresIn: '7d' });

                userData = {
                    userId: existingUser.id,
                    phone: phone,
                    userType: existingUser.user_type,
                    isNewUser: false
                };

                onboardingStatus = {
                    completed: existingUser.onboarding_completed || false
                };
            } else {
                // 신규 테스트 유저 생성
                const testInfo = testAccounts[phone];

                const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                    phone: phone,
                    phone_confirm: true
                });

                if (authError) {
                    console.error('Auth 유저 생성 오류:', authError);
                    throw authError;
                }

                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert({
                        id: authData.user.id,
                        phone_number: phone,
                        user_type: testInfo.type,
                        name: testInfo.name,
                        onboarding_completed: false
                    });

                if (profileError) {
                    console.error('프로필 생성 오류:', profileError);
                    await supabase.auth.admin.deleteUser(authData.user.id);
                    throw profileError;
                }

                // user 타입인 경우에만 user_info 생성
                if (testInfo.type === 'user') {  // userType이 아닌 testInfo.type 확인
                    const { error: userInfoError } = await supabase
                        .from('user_info')
                        .insert({
                            user_id: authData.user.id
                        });

                    if (userInfoError) {
                        console.error('user_info 생성 실패:', userInfoError);
                    }
                }

                token = jwt.sign({
                    userId: authData.user.id,
                    phone: phone,
                    userType: testInfo.type
                }, JWT_SECRET, { expiresIn: '7d' });

                userData = {
                    userId: authData.user.id,
                    phone: phone,
                    userType: testInfo.type,
                    isNewUser: true
                };

                onboardingStatus = {
                    completed: false
                };
            }

            return res.json({
                success: true,
                token: token,
                user: userData,
                onboardingStatus: onboardingStatus,
                message: '테스트 계정으로 로그인되었습니다'
            });
        }

        // 일반 OTP 확인
        const stored = otpStore.get(phone);
        if (!stored) {
            console.error('OTP를 찾을 수 없음:', phone);
            return res.status(400).json({
                success: false,
                error: 'OTP를 찾을 수 없습니다'
            });
        }

        // 만료 시간 확인
        if (Date.now() > stored.expires) {
            otpStore.delete(phone);
            return res.status(400).json({
                success: false,
                error: 'OTP가 만료되었습니다'
            });
        }

        // OTP 일치 확인
        if (stored.otp !== otp) {
            return res.status(400).json({
                success: false,
                error: '잘못된 인증번호입니다'
            });
        }

        // OTP 삭제 (한 번만 사용 가능)
        otpStore.delete(phone);

        // 기존 유저 확인
        const { data: existingUser, error: fetchError } = await supabase
            .from('profiles')
            .select('*')
            .eq('phone_number', phone)
            .single();

        let token;
        let userData;
        let onboardingStatus;

        // 에러가 있지만 단순히 유저가 없는 경우가 아닌 경우 처리
        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('유저 조회 오류:', fetchError);
            throw fetchError;
        }

        if (existingUser) {
            // 기존 유저 - 로그인 처리
            console.log('기존 유저 로그인:', existingUser.id);

            token = jwt.sign({
                userId: existingUser.id,
                phone: phone,
                userType: existingUser.user_type
            }, JWT_SECRET, { expiresIn: '7d' });

            userData = {
                userId: existingUser.id,
                phone: phone,
                userType: existingUser.user_type,
                isNewUser: false
            };

            onboardingStatus = {
                completed: existingUser.onboarding_completed || false
            };

        } else {
            // 신규 유저 - 회원가입 처리
            console.log('신규 유저 회원가입');

            // userType이 제공되지 않은 경우 체크
            if (!userType) {
                return res.status(400).json({
                    success: false,
                    error: '신규 가입 시 userType이 필요합니다'
                });
            }

            // Supabase Auth에 유저 생성
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                phone: phone,
                phone_confirm: true
            });

            if (authError) {
                console.error('Auth 유저 생성 오류:', authError);
                throw authError;
            }

            // profiles 테이블에 추가 정보 저장
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: authData.user.id,
                    phone_number: phone,
                    user_type: userType,
                    onboarding_completed: false
                });

            if (profileError) {
                console.error('프로필 생성 오류:', profileError);
                // 프로필 생성 실패 시 auth 유저도 삭제 (롤백)
                await supabase.auth.admin.deleteUser(authData.user.id);
                throw profileError;
            }

            // user 타입인 경우에만 user_info 생성
            if (userType === 'user') {
                const { error: userInfoError } = await supabase
                    .from('user_info')
                    .insert({
                        user_id: authData.user.id
                    });

                if (userInfoError) {
                    console.error('user_info 생성 실패:', userInfoError);
                }
            }

            // JWT 토큰 생성
            token = jwt.sign({
                userId: authData.user.id,
                phone: phone,
                userType: userType
            }, JWT_SECRET, { expiresIn: '7d' });

            userData = {
                userId: authData.user.id,
                phone: phone,
                userType: userType,
                isNewUser: true
            };

            onboardingStatus = {
                completed: false
            };
        }

        // 성공 응답
        console.log('인증 성공:', userData.userId);
        console.log('온보딩 완료 여부:', onboardingStatus.completed);

        res.json({
            success: true,
            token: token,
            user: userData,
            onboardingStatus: onboardingStatus,
            message: userData.isNewUser ? '회원가입이 완료되었습니다' : '로그인되었습니다'
        });

    } catch (error) {
        console.error('OTP 검증 실패:', error);

        // 에러 타입에 따른 응답
        if (error.message?.includes('duplicate key')) {
            res.status(400).json({
                success: false,
                error: '이미 등록된 전화번호입니다'
            });
        } else {
            res.status(500).json({
                success: false,
                error: '인증 처리 중 오류가 발생했습니다',
                details: process.env.NODE_ENV !== 'production' ? error.message : undefined
            });
        }
    }
});