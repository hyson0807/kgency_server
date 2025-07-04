const axios = require('axios');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { SolapiMessageService } = require('solapi');
const jwt = require('jsonwebtoken');
const {createClient} = require("@supabase/supabase-js");
const {OpenAI} = require("openai");
const secret = process.env.JWT_SECRET;
const PORT = process.env.PORT || 5004;

const app = express();
const otpStore = new Map();

const supabase = createClient(process.env.KEY_1, process.env.KEY_2);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY});
const messageService = new SolapiMessageService(process.env.SOLAPI_API_KEY, process.env.SOLAPI_API_SECRET);

app.use(cors());
app.use(express.json());
dotenv.config();

function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

app.listen(PORT, () => {
    console.log(`Listening on ${PORT}`);
});

//---------------------------------------------------------------------------------------------

app.post('/send-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        const otp = generateOTP();
        otpStore.set(phone, { otp, expires: Date.now() + 300000 });
        console.log('생성된 OTP:', otp);

        const result = await messageService.send({
            'to': phone,
            'from': process.env.SENDER_PHONE,
            'text': `verification: ${otp}`
        })
        console.log('SMS 발송 성공:', result);
        res.json({ success: true});

    }  catch (error) {
        console.error('OTP 발송 실패:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
})

app.post('/verify-otp', async (req, res) => {
    try {
        const { phone, otp, userType } = req.body;
        console.log('OTP 검증11111111:', phone, otp, userType);

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
                }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '7d' });

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

                if (authError) throw authError;

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
                    await supabase.auth.admin.deleteUser(authData.user.id);
                    throw profileError;
                }

                if (userType === 'user') {
                    // user_info 테이블에 기본 정보 생성
                    const { error: userInfoError } = await supabase
                        .from('user_info')
                        .insert({
                            user_id: authData.user.id,
                            // 기본값들은 DB 스키마에 정의되어 있음
                        });

                    if (userInfoError) {
                        console.error('user_info 생성 실패:', userInfoError);
                        // user_info 생성 실패해도 회원가입은 계속 진행
                        // 나중에 프로필 업데이트 시 생성될 수 있음
                    }
                }

                token = jwt.sign({
                    userId: authData.user.id,
                    phone: phone,
                    userType: testInfo.type
                }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '7d' });

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
            throw fetchError;
        }

        if (existingUser) {
            // 기존 유저 - 로그인 처리
            console.log('기존 유저 로그인:', existingUser.id);

            token = jwt.sign({
                userId: existingUser.id,
                phone: phone,
                userType: existingUser.user_type
            }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '7d' });

            userData = {
                userId: existingUser.id,
                phone: phone,
                userType: existingUser.user_type,
                isNewUser: false
            };

            // 온보딩 상태는 profiles 테이블에서 바로 확인
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
                throw authError;
            }

            // profiles 테이블에 추가 정보 저장 (onboarding_completed는 기본값 false)
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: authData.user.id,
                    phone_number: phone,
                    user_type: userType,
                    onboarding_completed: false  // 명시적으로 false 설정
                });

            if (profileError) {
                // 프로필 생성 실패 시 auth 유저도 삭제 (롤백)
                await supabase.auth.admin.deleteUser(authData.user.id);
                throw profileError;
            }

            if (userType === 'user') {
                // user_info 테이블에 기본 정보 생성
                const { error: userInfoError } = await supabase
                    .from('user_info')
                    .insert({
                        user_id: authData.user.id,
                        // 기본값들은 DB 스키마에 정의되어 있음
                    });
            }

            // JWT 토큰 생성
            token = jwt.sign({
                userId: authData.user.id,
                phone: phone,
                userType: userType
            }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '7d' });

            userData = {
                userId: authData.user.id,
                phone: phone,
                userType: userType,
                isNewUser: true
            };

            // 신규 유저는 무조건 온보딩 미완료
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
                error: '인증 처리 중 오류가 발생했습니다'
            });
        }
    }
});

// AI 이력서 생성 엔드포인트 (공고별)
app.post('/generate-resume-for-posting', async (req, res) => {
    try {
        const { user_id, job_posting_id, company_id } = req.body;

        if (!user_id || !job_posting_id || !company_id) {
            return res.status(400).json({
                success: false,
                error: '필수 정보가 누락되었습니다.'
            });
        }

        // 1. 유저 프로필 정보 가져오기
        const { data: userProfile, error: userError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user_id)
            .single();

        if (userError || !userProfile) {
            return res.status(404).json({
                success: false,
                error: '유저 정보를 찾을 수 없습니다.'
            });
        }

        // 2. user_info 테이블에서 추가 정보 가져오기
        const { data: userInfo } = await supabase
            .from('user_info')
            .select('*')
            .eq('user_id', user_id)
            .single();

        // 3. 유저 키워드 정보 가져오기
        const { data: userKeywords } = await supabase
            .from('user_keyword')
            .select(`
                keyword:keyword_id (
                    keyword,
                    category
                )
            `)
            .eq('user_id', user_id);

        // 4. 공고 정보 가져오기
        const { data: jobPosting, error: postingError } = await supabase
            .from('job_postings')
            .select(`
                *,
                company:company_id (
                    name,
                    address,
                    description
                )
            `)
            .eq('id', job_posting_id)
            .single();

        if (postingError || !jobPosting) {
            return res.status(404).json({
                success: false,
                error: '공고 정보를 찾을 수 없습니다.'
            });
        }

        // 5. 공고 키워드 정보 가져오기
        const { data: postingKeywords } = await supabase
            .from('job_posting_keyword')
            .select(`
                keyword:keyword_id (
                    keyword,
                    category
                )
            `)
            .eq('job_posting_id', job_posting_id);

        console.log(123);

        // 6. 키워드 정리
        const userCountryKeywords = userKeywords?.filter(k => k.keyword.category === '국가').map(k => k.keyword.keyword) || [];

        const userJobKeywords = userKeywords?.filter(k => k.keyword.category === '직종').map(k => k.keyword.keyword) || [];
        const userConditionKeywords = userKeywords?.filter(k => k.keyword.category === '근무조건').map(k => k.keyword.keyword) || [];
        const postingJobKeywords = postingKeywords?.filter(k => k.keyword.category === '직종').map(k => k.keyword.keyword) || [];
        const postingConditionKeywords = postingKeywords?.filter(k => k.keyword.category === '근무조건').map(k => k.keyword.keyword) || [];

        console.log(1234);

        const resume = `
            안녕하세요, ${jobPosting.company.name} 채용 담당자님.
            저는 ${userCountryKeywords}에서 온 ${userInfo.age}살 ${userInfo.gender} ${userProfile.name || ''}이라고 합니다.
            
            비자: ${userInfo?.visa}
            희망 근무 기간: ${userInfo?.how_long}
            관련 경력: ${userInfo?.experience}
            경력 내용: ${userInfo?.experience.content}
            한국어 실력: ${userInfo?.korean_level}
            토픽 급수: ${userInfo?.topic}
            희망 근무 조건: ${userConditionKeywords.join(', ') || '미입력'}
        `


        console.log(12345);

        // 9. 응답
        res.json({
            success: true,
            resume: resume,
            jobTitle: jobPosting.title,
            companyName: jobPosting.company.name
        });

    } catch (error) {
        console.error('이력서 생성 오류:', error);
        res.status(500).json({
            success: false,
            error: '이력서 생성 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

