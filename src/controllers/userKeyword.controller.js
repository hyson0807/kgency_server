const { supabase } = require('../config/database');

// 모든 키워드 조회
const getKeywords = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('keyword')
            .select('*')
            .order('keyword', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            data: data || []
        });

    } catch (error) {
        console.error('키워드 조회 실패:', error);
        res.status(500).json({
            success: false,
            error: '키워드를 불러오는데 실패했습니다.'
        });
    }
};

// 사용자 키워드 조회
const getUserKeywords = async (req, res) => {
    try {
        const userId = req.user.userId;

        const { data, error } = await supabase
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

        if (error) throw error;

        res.json({
            success: true,
            data: data || []
        });

    } catch (error) {
        console.error('사용자 키워드 조회 실패:', error);
        res.status(500).json({
            success: false,
            error: '사용자 키워드를 불러오는데 실패했습니다.'
        });
    }
};

// 사용자 키워드 업데이트
const updateUserKeywords = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { keywordIds } = req.body;

        if (!Array.isArray(keywordIds)) {
            return res.status(400).json({
                success: false,
                error: 'keywordIds는 배열이어야 합니다.'
            });
        }

        // 기존 키워드 삭제
        const { error: deleteError } = await supabase
            .from('user_keyword')
            .delete()
            .eq('user_id', userId);

        if (deleteError) throw deleteError;

        // 새 키워드 추가
        if (keywordIds.length > 0) {
            const inserts = keywordIds.map(keywordId => ({
                user_id: userId,
                keyword_id: keywordId
            }));

            const { error: insertError } = await supabase
                .from('user_keyword')
                .insert(inserts);

            if (insertError) throw insertError;
        }

        res.json({
            success: true,
            message: '키워드가 성공적으로 업데이트되었습니다.'
        });

    } catch (error) {
        console.error('사용자 키워드 업데이트 실패:', error);
        res.status(500).json({
            success: false,
            error: '키워드 업데이트에 실패했습니다.'
        });
    }
};

module.exports = {
    getKeywords,
    getUserKeywords,
    updateUserKeywords
};