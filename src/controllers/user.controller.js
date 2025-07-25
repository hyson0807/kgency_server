const { supabase } = require('../config/database');

// 유저 상세 정보 조회 (profiles, user_info, keywords 통합)
exports.getUserDetails = async (req, res) => {
    try {
        const { userId } = req.params;

        // 1. profiles 정보 조회
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError) {
            return res.status(404).json({
                success: false,
                error: '사용자를 찾을 수 없습니다.'
            });
        }

        // 2. user_info 정보 조회
        const { data: userInfo, error: userInfoError } = await supabase
            .from('user_info')
            .select('*')
            .eq('user_id', userId)
            .single();

        // 3. user keywords 조회
        const { data: keywords, error: keywordsError } = await supabase
            .from('user_keyword')
            .select(`
                keyword_id,
                keyword:keyword_id(
                    id,
                    keyword,
                    category
                )
            `)
            .eq('user_id', userId);

        const extractedKeywords = keywords?.map(item => item.keyword).filter(Boolean) || [];

        res.status(200).json({
            success: true,
            data: {
                profile,
                userInfo,
                keywords: extractedKeywords
            }
        });

    } catch (error) {
        console.error('유저 상세 정보 조회 오류:', error);
        res.status(500).json({
            success: false,
            error: '유저 정보를 불러오는 중 오류가 발생했습니다.'
        });
    }
};