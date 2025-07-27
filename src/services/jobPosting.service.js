const { supabase } = require('../config/database');

exports.getActiveJobPostings = async () => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .select(`
                *,
                company:company_id (
                    id,
                    name,
                    address,
                    description,
                    phone_number
                ),
                job_posting_keywords:job_posting_keyword (
                    keyword:keyword_id (
                        id,
                        keyword,
                        category
                    )
                )
            `)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data || [];
    } catch (error) {
        console.error('Get active job postings service error:', error);
        throw error;
    }
};

exports.getJobPostingById = async (postingId) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .select(`
                *,
                company:company_id (
                    id,
                    name,
                    address,
                    description,
                    phone_number
                ),
                job_posting_keywords:job_posting_keyword (
                    keyword:keyword_id (
                        id,
                        keyword,
                        category
                    )
                )
            `)
            .eq('id', postingId)
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Get job posting by id service error:', error);
        throw error;
    }
};

exports.createJobPosting = async (jobPostingData) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .insert(jobPostingData)
            .select()
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Create job posting service error:', error);
        throw error;
    }
};

exports.updateJobPosting = async (postingId, jobPostingData) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .update(jobPostingData)
            .eq('id', postingId)
            .select()
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Update job posting service error:', error);
        throw error;
    }
};

exports.getCompanyJobPostingsWithStatus = async (companyId, jobSeekerId) => {
    try {
        // 회사 공고 목록 가져오기
        const { data: jobPostings, error: jobError } = await supabase
            .from('job_postings')
            .select('id, title')
            .eq('company_id', companyId)
            .eq('is_active', true)
            .is('deleted_at', null);

        if (jobError) throw jobError;

        // 구직자의 기존 지원서 확인
        const { data: existingApplications, error: appError } = await supabase
            .from('applications')
            .select('job_posting_id')
            .eq('user_id', jobSeekerId)
            .eq('company_id', companyId)
            .is('deleted_at', null);

        if (appError) throw appError;

        const appliedJobPostingIds = new Set(existingApplications?.map(app => app.job_posting_id) || []);

        // 공고에 지원 여부 정보 추가
        const jobPostingsWithStatus = (jobPostings || []).map(posting => ({
            ...posting,
            hasExistingApplication: appliedJobPostingIds.has(posting.id)
        }));

        return jobPostingsWithStatus;
    } catch (error) {
        console.error('Get company job postings with status service error:', error);
        throw error;
    }
};

// 사용자 키워드 기반 매칭된 공고 조회 (적합도 계산 포함) - 성능 최적화
exports.getMatchedPostingsForUser = async (userId) => {
    try {
        console.log('Getting matched postings for user:', userId);

        // 1. 사용자 키워드 조회
        const { data: userKeywords, error: keywordError } = await supabase
            .from('user_keyword')
            .select('keyword_id')
            .eq('user_id', userId);

        if (keywordError) throw keywordError;

        if (!userKeywords || userKeywords.length === 0) {
            console.log('No user keywords found');
            return [];
        }

        const userKeywordIds = userKeywords.map(uk => uk.keyword_id);
        console.log('User keyword IDs:', userKeywordIds);

        // 2. 모든 활성 공고와 키워드 조회
        const { data: jobPostings, error: postingError } = await supabase
            .from('job_postings')
            .select(`
                *,
                company:company_id (
                    id,
                    name,
                    address,
                    description,
                    phone_number
                ),
                job_posting_keywords:job_posting_keyword (
                    keyword:keyword_id (
                        id,
                        keyword,
                        category
                    )
                )
            `)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (postingError) throw postingError;

        console.log('Found job postings:', jobPostings?.length || 0);

        if (!jobPostings || jobPostings.length === 0) {
            return [];
        }

        // 3. 서버에서 적합도 계산 및 매칭 처리
        const SuitabilityCalculator = require('../utils/suitabilityCalculator');
        const calculator = new SuitabilityCalculator();

        const matchedPostings = jobPostings.map(posting => {
            // 적합도 계산
            const suitability = calculator.calculate(
                userKeywordIds,
                posting.job_posting_keywords || []
            );

            // 번역된 키워드 매칭 (간단한 버전)
            const translatedMatchedKeywords = {
                countries: [],
                jobs: [],
                conditions: [],
                location: [],
                moveable: [],
                gender: [],
                age: [],
                visa: [],
                koreanLevel: []
            };

            // 매칭된 키워드 분류
            posting.job_posting_keywords?.forEach(jpk => {
                if (userKeywordIds.includes(jpk.keyword.id)) {
                    const keyword = jpk.keyword.keyword;
                    switch (jpk.keyword.category) {
                        case '국가':
                            translatedMatchedKeywords.countries.push(keyword);
                            break;
                        case '직종':
                            translatedMatchedKeywords.jobs.push(keyword);
                            break;
                        case '근무조건':
                            translatedMatchedKeywords.conditions.push(keyword);
                            break;
                        case '지역':
                            translatedMatchedKeywords.location.push(keyword);
                            break;
                        case '지역이동':
                            translatedMatchedKeywords.moveable.push(keyword);
                            break;
                        case '성별':
                            translatedMatchedKeywords.gender.push(keyword);
                            break;
                        case '나이대':
                            translatedMatchedKeywords.age.push(keyword);
                            break;
                        case '비자':
                            translatedMatchedKeywords.visa.push(keyword);
                            break;
                        case '한국어수준':
                            translatedMatchedKeywords.koreanLevel.push(keyword);
                            break;
                    }
                }
            });

            return {
                posting: {
                    id: posting.id,
                    title: posting.title,
                    description: posting.description,
                    salary_range: posting.salary_range,
                    salary_range_negotiable: posting.salary_range_negotiable,
                    working_hours: posting.working_hours,
                    working_hours_negotiable: posting.working_hours_negotiable,
                    working_days: posting.working_days,
                    working_days_negotiable: posting.working_days_negotiable,
                    hiring_count: posting.hiring_count,
                    pay_day: posting.pay_day,
                    pay_day_negotiable: posting.pay_day_negotiable,
                    is_active: posting.is_active,
                    created_at: posting.created_at,
                    job_address: posting.job_address,
                    company: posting.company,
                    job_posting_keywords: posting.job_posting_keywords
                },
                matchedCount: Object.values(translatedMatchedKeywords).reduce((sum, arr) => sum + arr.length, 0),
                matchedKeywords: translatedMatchedKeywords,
                suitability
            };
        });

        // 4. 적합도 점수 높은 순으로 정렬
        matchedPostings.sort((a, b) => b.suitability.score - a.suitability.score);

        console.log('Matched postings processed:', matchedPostings.length);

        return matchedPostings;

    } catch (error) {
        console.error('Get matched postings service error:', error);
        throw error;
    }
};