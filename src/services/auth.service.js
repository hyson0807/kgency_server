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
    try {
        // 1. 사용자 타입 확인
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('user_type')
            .eq('id', userId)
            .single();

        if (profileError) {
            throw new Error('사용자 정보를 찾을 수 없습니다');
        }

        // 2. 관련 데이터 삭제 (역순으로 처리)

        // 2-1. 인터뷰 관련 데이터 삭제
        if (profile.user_type === 'company') {
            // 회사인 경우: company_id로 직접 삭제
            const { data: proposals } = await supabase
                .from('interview_proposals')
                .select('id')
                .eq('company_id', userId);

            if (proposals && proposals.length > 0) {
                const proposalIds = proposals.map(p => p.id);
                await supabase.from('interview_schedules')
                    .delete()
                    .in('proposal_id', proposalIds);
            }

            await supabase.from('interview_proposals').delete().eq('company_id', userId);
            await supabase.from('interview_slots').delete().eq('company_id', userId);
        } else {
            // 사용자인 경우: application_id를 통해 삭제
            const { data: userApplications } = await supabase
                .from('applications')
                .select('id')
                .eq('user_id', userId);

            if (userApplications && userApplications.length > 0) {
                const applicationIds = userApplications.map(app => app.id);

                const { data: proposals } = await supabase
                    .from('interview_proposals')
                    .select('id')
                    .in('application_id', applicationIds);

                if (proposals && proposals.length > 0) {
                    const proposalIds = proposals.map(p => p.id);
                    await supabase.from('interview_schedules')
                        .delete()
                        .in('proposal_id', proposalIds);
                }

                await supabase.from('interview_proposals')
                    .delete()
                    .in('application_id', applicationIds);
            }
        }

        // 2-2. 메시지 삭제
        await supabase.from('messages')
            .delete()
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

        // 2-3. 지원서 삭제
        if (profile.user_type === 'user') {
            await supabase.from('applications').delete().eq('user_id', userId);
        } else {
            await supabase.from('applications').delete().eq('company_id', userId);
        }

        // 2-4. 채용공고 관련 데이터 삭제 (회사인 경우)
        if (profile.user_type === 'company') {
            // 채용공고 키워드 삭제
            const { data: jobPostings } = await supabase
                .from('job_postings')
                .select('id')
                .eq('company_id', userId);

            if (jobPostings && jobPostings.length > 0) {
                const jobPostingIds = jobPostings.map(jp => jp.id);
                await supabase.from('job_posting_keyword')
                    .delete()
                    .in('job_posting_id', jobPostingIds);
            }

            // 채용공고 삭제
            await supabase.from('job_postings').delete().eq('company_id', userId);
        }

        // 2-5. 키워드 관계 삭제
        if (profile.user_type === 'user') {
            await supabase.from('user_keyword').delete().eq('user_id', userId);
        } else {
            await supabase.from('company_keyword').delete().eq('company_id', userId);
        }

        // 2-6. 오디오 데이터 삭제
        await supabase.from('user_audios').delete().eq('user_id', userId);

        // 2-7. 번역 데이터 삭제
        await supabase.from('translations')
            .delete()
            .eq('row_id', userId);

        // 2-8. 확장 정보 삭제
        if (profile.user_type === 'user') {
            await supabase.from('user_info').delete().eq('user_id', userId);
        } else {
            await supabase.from('company_info').delete().eq('company_id', userId);
        }

        // 2-8. 프로필 삭제 확인
        const { error: profileDeleteError } = await supabase.from('profiles').delete().eq('id', userId);
        if (profileDeleteError) {
            console.error('프로필 삭제 실패:', profileDeleteError);
            throw new Error('프로필 삭제 중 오류가 발생했습니다: ' + profileDeleteError.message);
        }

        // 2-9. 남은 데이터 확인 (디버깅용)
        console.log('Auth 사용자 삭제 전 남은 데이터 확인...');

        // auth.users 테이블과 연결된 모든 테이블 확인
        const tables = ['profiles', 'user_info', 'company_info', 'applications', 'messages',
                       'job_postings', 'user_keyword', 'company_keyword', 'interview_proposals',
                       'interview_schedules', 'interview_slots', 'translations', 'user_audios'];

        for (const table of tables) {
            try {
                let query;
                if (table === 'applications') {
                    // applications 테이블은 user_id와 company_id 둘 다 확인
                    query = supabase.from(table).select('*', { count: 'exact', head: true })
                        .or(`user_id.eq.${userId},company_id.eq.${userId}`);
                } else if (table === 'messages') {
                    // messages 테이블은 sender_id와 receiver_id 둘 다 확인
                    query = supabase.from(table).select('*', { count: 'exact', head: true })
                        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
                } else {
                    // 기타 테이블들
                    const column = table === 'user_info' ? 'user_id' :
                                  table === 'company_info' ? 'company_id' :
                                  table === 'job_postings' ? 'company_id' :
                                  table === 'user_keyword' ? 'user_id' :
                                  table === 'company_keyword' ? 'company_id' :
                                  table === 'interview_slots' ? 'company_id' :
                                  table === 'interview_proposals' ? 'company_id' :
                                  table === 'user_audios' ? 'user_id' :
                                  'id';
                    query = supabase.from(table).select('*', { count: 'exact', head: true })
                        .eq(column, userId);
                }

                const { data, count } = await query;

                if (count > 0) {
                    console.log(`${table} 테이블에 ${count}개 남은 레코드 발견`);
                }
            } catch (e) {
                // 테이블이 없거나 접근 권한이 없는 경우 무시
                console.log(`${table} 테이블 확인 중 오류 (무시): ${e.message}`);
            }
        }

        // 3. Auth 사용자 삭제 (마지막에 실행)
        console.log('Auth 사용자 삭제 시도:', userId);
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        if (authError) {
            console.error('Auth 사용자 삭제 실패:', authError);
            console.error('Auth 에러 상세:', JSON.stringify(authError, null, 2));
            throw new Error('계정 삭제 중 오류가 발생했습니다: ' + authError.message);
        }

        return { message: '회원 탈퇴가 완료되었습니다' };

    } catch (error) {
        console.error('회원 탈퇴 처리 중 오류:', error);
        throw new Error('회원 탈퇴 처리 중 오류가 발생했습니다: ' + error.message);
    }
};

module.exports = {
    sendOTP,
    verifyOTP,
    deleteAccount
};