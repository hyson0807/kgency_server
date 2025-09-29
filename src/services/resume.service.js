const { supabase } = require('../config');
const translateService = require('./translate.service');

// AI 이력서 생성
const generateResume = async (data) => {
    const { user_id, job_posting_id, company_id, question, workDaysString, workTimesString } = data;

    // 1. 유저 프로필 정보
    const { data: userProfile, error: userError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user_id)
        .single();

    if (userError || !userProfile) {
        throw new Error('유저 정보를 찾을 수 없습니다.');
    }

    // 2. user_info 정보
    const { data: userInfo } = await supabase
        .from('user_info')
        .select('*')
        .eq('user_id', user_id)
        .single();

    // 3. 유저 키워드
    const { data: userKeywords } = await supabase
        .from('user_keyword')
        .select(`
      keyword:keyword_id (
        keyword,
        category
      )
    `)
        .eq('user_id', user_id);

    // 4. 공고 정보
    const { data: jobPosting, error: postingError } = await supabase
        .from('job_postings')
        .select(`
      *,
      company:company_id (
        name,
        address
      )
    `)
        .eq('id', job_posting_id)
        .single();

    if (postingError || !jobPosting) {
        throw new Error('공고 정보를 찾을 수 없습니다.');
    }

    // 5. 공고 키워드
    const { data: postingKeywords } = await supabase
        .from('job_posting_keyword')
        .select(`
      keyword:keyword_id (
        keyword,
        category
      )
    `)
        .eq('job_posting_id', job_posting_id);

    // 6. 키워드 정리
    const userCountryKeywords = userKeywords?.filter(k => k.keyword.category === '국가')
        .map(k => k.keyword.keyword).join(', ') || '';

    // 7. 번역 준비
    const textsToTranslate = [];
    const translateIndexMap = {};
    
    if (userInfo?.experience_content && userInfo.experience_content !== '정보 없음') {
        translateIndexMap.experience_content = textsToTranslate.length;
        textsToTranslate.push(userInfo.experience_content);
    }
    
    if (question && question !== '없음') {
        translateIndexMap.question = textsToTranslate.length;
        textsToTranslate.push(question);
    }
    
    // 8. 번역 실행
    let translatedTexts = {};
    if (textsToTranslate.length > 0) {
        try {
            const translations = await translateService.translateBatch(textsToTranslate, 'ko');
            
            if (translateIndexMap.experience_content !== undefined) {
                translatedTexts.experience_content = translations[translateIndexMap.experience_content];
            }
            
            if (translateIndexMap.question !== undefined) {
                translatedTexts.question = translations[translateIndexMap.question];
            }
        } catch (error) {
            console.error('번역 오류:', error);
            // 번역 실패 시 원본 사용
            translatedTexts.experience_content = userInfo?.experience_content || '정보 없음';
            translatedTexts.question = question || '없음';
        }
    }
    
    // 9. 이력서 생성
    const resume = `안녕하세요!, ${jobPosting.company.name} 채용 담당자님!
저는 케이전시 ${jobPosting.title}를 보고 지원한 ${userProfile.name || ''}입니다. 

국가: ${userCountryKeywords}
비자: ${userInfo?.visa || '정보 없음'}
나이: ${userInfo?.age || '정보 없음'} (${userInfo?.gender || '정보 없음'})
희망 근무 기간: ${userInfo?.how_long || '정보 없음'}
희망 근무 요일: ${workDaysString || '없음'}
희망 시간대: ${workTimesString || '없음'}
관련 경력: ${userInfo?.experience || '정보 없음'}
경력 내용: ${translatedTexts.experience_content || userInfo?.experience_content || '정보 없음'}
한국어 실력: ${userInfo?.korean_level || '정보 없음'}  토픽 급수: ${userInfo?.topic || 'x'}
궁금한 점: ${translatedTexts.question || question || '없음'}

저는 진심으로 ${jobPosting.company.name} 팀과 면접보고 싶어서 인사 드립니다.
가능한 시간 알려주시면 감사하겠습니다!`;

    return {
        resume,
        jobTitle: jobPosting.title,
        companyName: jobPosting.company.name
    };
};

// 이력서 저장 (메시지로 저장)
const saveResume = async (senderId, receiverId, subject, content) => {
    if (!receiverId || !subject || !content) {
        throw new Error('receiverId, subject, content가 필요합니다.');
    }

    // 메시지 저장
    const { data: message, error } = await supabase
        .from('messages')
        .insert({
            sender_id: senderId,
            receiver_id: receiverId,
            subject: subject,
            content: content
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return message;
};

module.exports = {
    generateResume,
    saveResume
};