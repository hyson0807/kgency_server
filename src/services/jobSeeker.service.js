const { supabase } = require('../config/database');
const SuitabilityCalculator = require('../utils/suitabilityCalculator');

class JobSeekerService {
    constructor() {
        this.calculator = new SuitabilityCalculator();
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

                // 매칭된 키워드 찾기
                const matchedKeywordIds = companyKeywordIds.filter(ckId =>
                    userKeywordIds.includes(ckId)
                );

                // 매칭된 키워드 텍스트와 카테고리 정보 가져오기
                const matchedKeywords = jobSeeker.user_keywords
                    ?.filter(uk => matchedKeywordIds.includes(uk.keyword.id))
                    .map(uk => uk.keyword.keyword) || [];

                const matchedKeywordsWithCategory = jobSeeker.user_keywords
                    ?.filter(uk => matchedKeywordIds.includes(uk.keyword.id))
                    .map(uk => ({
                        keyword: uk.keyword.keyword,
                        category: uk.keyword.category
                    })) || [];

                // 적합도 계산
                let suitability = undefined;
                if (companyKeywordsForCalculator.length > 0) {
                    suitability = this.calculator.calculate(userKeywordIds, companyKeywordsForCalculator);
                }

                // user_keywords를 제거하고 깔끔한 형태로 반환
                const { user_keywords, ...cleanJobSeeker } = jobSeeker;

                return {
                    user: cleanJobSeeker,
                    matchedCount: matchedKeywordIds.length,
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