const { supabase } = require('../config/database');

exports.getApplication = async (id) => {
    try {
        const { data, error } = await supabase
            .from('applications')
            .select(`
                *,
                job_posting: job_posting_id (
                    id,
                    title,
                    description,
                    job_address,   
                    company: company_id (
                        id,
                        name,
                        address
                    )
                ),
                message: message_id (
                    content
                )
            `)
            .eq('user_id', id)
            .order('applied_at', { ascending: false })


        if (error) throw error
        return data
    } catch (error) {
        console.error('Get application error:', error)
        throw error
    }

}


exports.getApplicationsByPosting = async (jobPostingId) => {
    try {
        const { data, error } = await supabase
            .from('applications')
            .select(`
                *,
                user:user_id (
                    id,
                    name,
                    phone_number,
                    address,
                    user_info!user_info_user_id_fkey (
                        age,
                        gender,
                        visa,
                        how_long,
                        topic,
                        korean_level,
                        experience,
                        experience_content
                    ),
                    user_keyword (
                        keyword_id,
                        keywords:keyword_id (
                            id,
                            keyword,
                            category
                        )
                    )
                ),
                message:message_id (
                    content,
                    is_read
                )
            `)
            .eq('job_posting_id', jobPostingId)
            .order('applied_at', { ascending: false })

        if (error) throw error

        // 데이터 구조 정리 (Supabase의 외래키 관계를 평탄화)
        const formattedData = data?.map(application => {
            // user_info가 배열로 반환될 수 있으므로 첫 번째 요소 사용
            const userInfo = Array.isArray(application.user?.user_info)
                ? application.user.user_info[0]
                : application.user?.user_info;

            // user_keyword 구조 정리
            const userKeywords = application.user?.user_keyword?.map(uk => ({
                keyword_id: uk.keyword_id,
                keywords: Array.isArray(uk.keywords) ? uk.keywords[0] : uk.keywords
            })) || [];

            return {
                ...application,
                user: {
                    ...application.user,
                    user_info: userInfo || null,
                    user_keyword: userKeywords
                }
            };
        }) || [];

        return formattedData;
    } catch (error) {
        console.error('Get applications by posting error:', error);
        throw error;
    }
}