const { supabase } = require('../config/database');
const SuitabilityCalculator = require('../utils/suitabilityCalculator');

class JobSeekerService {
    constructor() {
        this.calculator = new SuitabilityCalculator();
    }

    // 키워드의 카테고리를 찾는 헬퍼 메서드
    getKeywordCategory(keyword, userKeywords) {
        const found = userKeywords?.find(uk => uk.keyword.keyword === keyword);
        return found?.keyword.category || '';
    }

    async getMatchedJobSeekers(companyId) {
        try {
            console.log('Fetching matched job seekers for company:', companyId);
            
            // 1. 회사의 키워드 가져오기
            const { data: companyKeywords, error: keywordError } = await supabase
                .from('company_keyword')
                .select('keyword_id, keyword:keyword_id(*)')
                .eq('company_id', companyId);

            if (keywordError) {
                console.error('Error fetching company keywords:', keywordError);
                throw keywordError;
            }

            const companyKeywordIds = companyKeywords?.map(ck => ck.keyword_id) || [];
            const companyKeywordsForCalculator = companyKeywords?.map(ck => ({
                keyword: ck.keyword
            })) || [];

            // 2. 활성화된 구직자 목록 가져오기 (user_info와 keywords 포함)
            const { data: jobSeekers, error: seekersError } = await supabase
                .from('profiles')
                .select(`
                    *,
                    user_info (
                        age,
                        gender,
                        visa,
                        korean_level,
                        how_long,
                        experience,
                        experience_content,
                        topic
                    ),
                    user_keywords:user_keyword (
                        keyword:keyword_id (
                            id,
                            keyword,
                            category
                        )
                    )
                `)
                .eq('user_type', 'user')
                .eq('job_seeking_active', true)
                .order('created_at', { ascending: false });

            if (seekersError) throw seekersError;

            // 3. 각 구직자에 대해 매칭 점수 계산
            const matchedJobSeekers = jobSeekers.map(jobSeeker => {
                const userKeywordIds = jobSeeker.user_keywords?.map(
                    uk => uk.keyword.id
                ) || [];

                // "상관없음" 키워드를 고려한 매칭 로직
                const matchedKeywordIds = [];
                const matchedKeywordDetails = [];

                // 카테고리별로 매칭 확인
                const categories = ['국가', '직종', '근무조건', '지역', '지역이동', '성별', '나이대', '비자', '한국어수준', '근무요일'];
                
                categories.forEach(category => {
                    // 회사의 해당 카테고리 키워드들
                    const companyKeywordsInCategory = companyKeywords?.filter(
                        ck => ck.keyword?.category === category
                    ) || [];
                    
                    // 사용자의 해당 카테고리 키워드들
                    const userKeywordsInCategory = jobSeeker.user_keywords?.filter(
                        uk => uk.keyword?.category === category
                    ) || [];

                    // 회사가 "상관없음" 선택한 경우
                    const companyHasNoPreference = companyKeywordsInCategory.some(
                        ck => ck.keyword?.keyword === '상관없음'
                    );

                    // 사용자가 "상관없음" 선택한 경우
                    const userHasNoPreference = userKeywordsInCategory.some(
                        uk => uk.keyword?.keyword === '상관없음'
                    );

                    if (companyHasNoPreference || userHasNoPreference) {
                        // "상관없음"이 있으면 해당 카테고리는 매칭으로 처리
                        if (companyHasNoPreference && userKeywordsInCategory.length > 0) {
                            // 회사가 "상관없음"이면 사용자의 구체적인 키워드를 매칭으로 처리
                            userKeywordsInCategory.forEach(uk => {
                                if (uk.keyword?.keyword !== '상관없음') {
                                    // 중복 체크
                                    if (!matchedKeywordIds.includes(uk.keyword.id)) {
                                        matchedKeywordIds.push(uk.keyword.id);
                                        matchedKeywordDetails.push({
                                            keyword: uk.keyword.keyword,
                                            category: uk.keyword.category
                                        });
                                    }
                                }
                            });
                        } else if (userHasNoPreference && companyKeywordsInCategory.length > 0) {
                            // 사용자가 "상관없음"이면 "기타"로 표시
                            if (!matchedKeywordDetails.some(mkd => mkd.keyword === '기타' && mkd.category === category)) {
                                matchedKeywordDetails.push({
                                    keyword: '기타',
                                    category: category
                                });
                            }
                        }
                    } else {
                        // 일반적인 키워드 매칭 (직접 일치)
                        companyKeywordsInCategory.forEach(ck => {
                            const matchingUserKeyword = userKeywordsInCategory.find(
                                uk => uk.keyword?.id === ck.keyword?.id
                            );
                            if (matchingUserKeyword) {
                                // 중복 체크
                                if (!matchedKeywordIds.includes(matchingUserKeyword.keyword.id)) {
                                    matchedKeywordIds.push(matchingUserKeyword.keyword.id);
                                    matchedKeywordDetails.push({
                                        keyword: matchingUserKeyword.keyword.keyword,
                                        category: matchingUserKeyword.keyword.category
                                    });
                                }
                            }
                        });
                    }
                });

                // 매칭된 키워드 텍스트 배열 생성
                const matchedKeywords = matchedKeywordDetails.map(detail => detail.keyword);
                const matchedKeywordsWithCategory = matchedKeywordDetails;

                // 적합도 계산 (기존 방식 유지)
                let suitability = undefined;
                if (companyKeywordsForCalculator.length > 0) {
                    suitability = this.calculator.calculate(userKeywordIds, companyKeywordsForCalculator);
                }

                // user_keywords를 제거하고 깔끔한 형태로 반환
                const { user_keywords, ...cleanJobSeeker } = jobSeeker;

                return {
                    user: cleanJobSeeker,
                    matchedCount: matchedKeywords.length,
                    matchedKeywords,
                    matchedKeywordsWithCategory,
                    suitability
                };
            });

            // 4. 적합도 점수 높은 순으로 정렬
            matchedJobSeekers.sort((a, b) => {
                const scoreA = a.suitability?.score || a.matchedCount;
                const scoreB = b.suitability?.score || b.matchedCount;
                return scoreB - scoreA;
            });

            return matchedJobSeekers;

        } catch (error) {
            console.error('Error fetching matched job seekers:', error);
            throw error;
        }
    }
}

module.exports = new JobSeekerService();