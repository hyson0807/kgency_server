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

        // 1. 사용자 키워드 조회 (키워드 상세 정보 포함)
        const { data: userKeywords, error: keywordError } = await supabase
            .from('user_keyword')
            .select(`
                keyword_id,
                keyword:keyword_id (
                    id,
                    keyword,
                    category
                )
            `)
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
            // 적합도 계산 (공고 키워드만 사용)
            const suitability = calculator.calculate(
                userKeywordIds,
                posting.job_posting_keywords || []
            );

            // 수동 매칭 로직으로 중복 없는 매칭된 키워드 생성
            const matchedKeywordDetails = [];
            const categories = ['국가', '직종', '근무조건', '지역', '지역이동', '성별', '나이대', '비자', '한국어수준'];
            
            categories.forEach(category => {
                // 공고의 해당 카테고리 키워드들
                const postingKeywordsInCategory = posting.job_posting_keywords?.filter(
                    jpk => jpk.keyword?.category === category
                ) || [];
                
                // 사용자의 해당 카테고리 키워드들
                const userKeywordsInCategory = userKeywords?.filter(
                    uk => uk.keyword?.category === category
                ) || [];

                // 공고가 "상관없음" 선택한 경우
                const postingHasNoPreference = postingKeywordsInCategory.some(
                    jpk => jpk.keyword?.keyword === '상관없음'
                );

                // 사용자가 "상관없음" 선택한 경우
                const userHasNoPreference = userKeywordsInCategory.some(
                    uk => uk.keyword?.keyword === '상관없음'
                );

                if (postingHasNoPreference || userHasNoPreference) {
                    // "상관없음"이 있으면 해당 카테고리는 매칭으로 처리
                    if (postingHasNoPreference && userKeywordsInCategory.length > 0) {
                        // 공고가 "상관없음"이면 사용자의 구체적인 키워드를 매칭으로 처리
                        userKeywordsInCategory.forEach(uk => {
                            if (uk.keyword?.keyword !== '상관없음') {
                                // 중복 체크 (ID 기준)
                                if (!matchedKeywordDetails.some(mkd => mkd.id === uk.keyword.id)) {
                                    matchedKeywordDetails.push({
                                        id: uk.keyword.id,
                                        keyword: uk.keyword.keyword,
                                        category: uk.keyword.category
                                    });
                                }
                            }
                        });
                    } else if (userHasNoPreference && postingKeywordsInCategory.length > 0) {
                        // 사용자가 "상관없음"이면 "기타"로 표시
                        const userAnyKeyword = userKeywordsInCategory.find(uk => uk.keyword.keyword === '상관없음');
                        if (userAnyKeyword && !matchedKeywordDetails.some(mkd => mkd.keyword === '기타')) {
                            matchedKeywordDetails.push({
                                id: userAnyKeyword.keyword.id,
                                keyword: '기타',
                                category: userAnyKeyword.keyword.category
                            });
                        }
                    }
                } else {
                    // 일반적인 키워드 매칭 (직접 일치)
                    postingKeywordsInCategory.forEach(jpk => {
                        const matchingUserKeyword = userKeywordsInCategory.find(
                            uk => uk.keyword?.id === jpk.keyword?.id
                        );
                        if (matchingUserKeyword) {
                            // 중복 체크 (ID 기준)
                            if (!matchedKeywordDetails.some(mkd => mkd.id === matchingUserKeyword.keyword.id)) {
                                matchedKeywordDetails.push({
                                    id: matchingUserKeyword.keyword.id,
                                    keyword: matchingUserKeyword.keyword.keyword,
                                    category: matchingUserKeyword.keyword.category
                                });
                            }
                        }
                    });
                }
            });

            // 카테고리별로 분류
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

            // 매칭된 키워드를 카테고리별로 분류
            matchedKeywordDetails.forEach(keywordObj => {
                // 카테고리에 따라 분류 (이미 객체에 category 정보가 있음)
                switch (keywordObj.category) {
                    case '국가':
                        translatedMatchedKeywords.countries.push(keywordObj);
                        break;
                    case '직종':
                        translatedMatchedKeywords.jobs.push(keywordObj);
                        break;
                    case '근무조건':
                        translatedMatchedKeywords.conditions.push(keywordObj);
                        break;
                    case '지역':
                        translatedMatchedKeywords.location.push(keywordObj);
                        break;
                    case '지역이동':
                        translatedMatchedKeywords.moveable.push(keywordObj);
                        break;
                    case '성별':
                        translatedMatchedKeywords.gender.push(keywordObj);
                        break;
                    case '나이대':
                        translatedMatchedKeywords.age.push(keywordObj);
                        break;
                    case '비자':
                        translatedMatchedKeywords.visa.push(keywordObj);
                        break;
                    case '한국어수준':
                        translatedMatchedKeywords.koreanLevel.push(keywordObj);
                        break;
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

exports.getCompanyJobPostings = async (companyId) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .select(`
                *,
                applications (
                    id
                ),
                job_posting_keywords:job_posting_keyword (
                    keyword:keyword_id (
                        keyword,
                        category
                    )
                )
            `)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data || [];
    } catch (error) {
        console.error('Get company job postings service error:', error);
        throw error;
    }
};

exports.toggleJobPostingActive = async (postingId, isActive) => {
    try {
        const { data, error } = await supabase
            .from('job_postings')
            .update({ is_active: isActive })
            .eq('id', postingId)
            .select()
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Toggle job posting active service error:', error);
        throw error;
    }
};

exports.deleteJobPosting = async (postingId) => {
    try {
        // 1. Update related applications status to 'reviewed'
        const { error: appUpdateError } = await supabase
            .from('applications')
            .update({
                status: 'reviewed',
                reviewed_at: new Date().toISOString()
            })
            .eq('job_posting_id', postingId);

        if (appUpdateError) {
            console.error('Update applications status error:', appUpdateError);
        }

        // 2. Soft delete related applications
        const { error: appDeleteError } = await supabase
            .from('applications')
            .update({ deleted_at: new Date().toISOString() })
            .eq('job_posting_id', postingId);

        if (appDeleteError) {
            console.error('Soft delete applications error:', appDeleteError);
        }

        // 3. Handle related messages
        const { data: applications } = await supabase
            .from('applications')
            .select('message_id')
            .eq('job_posting_id', postingId)
            .not('message_id', 'is', null);

        if (applications && applications.length > 0) {
            const messageIds = applications.map(app => app.message_id).filter(Boolean);

            await supabase
                .from('messages')
                .update({ is_deleted: true })
                .in('id', messageIds);
        }

        // 4. Delete interview proposals
        const { data: relatedApplications } = await supabase
            .from('applications')
            .select('id')
            .eq('job_posting_id', postingId);

        if (relatedApplications && relatedApplications.length > 0) {
            const applicationIds = relatedApplications.map(app => app.id);
            
            const { error: proposalDeleteError } = await supabase
                .from('interview_proposals')
                .delete()
                .in('application_id', applicationIds);

            if (proposalDeleteError) {
                console.error('Delete interview proposals error:', proposalDeleteError);
            }
        }

        // 5. Soft delete the job posting
        const { error: deleteError } = await supabase
            .from('job_postings')
            .update({
                is_active: false,
                deleted_at: new Date().toISOString()
            })
            .eq('id', postingId);

        if (deleteError) throw deleteError;

        return true;
    } catch (error) {
        console.error('Delete job posting service error:', error);
        throw error;
    }
};