const { supabase } = require('../config/database');

const companyKeywordController = {
    async getCompanyKeywords(req, res) {
        try {
            const companyId = req.user.userId;

            const { data, error } = await supabase
                .from('company_keyword')
                .select(`
                    keyword_id,
                    keyword:keyword_id (
                        id,
                        keyword,
                        category
                    )
                `)
                .eq('company_id', companyId);

            if (error) throw error;

            res.json({
                success: true,
                data: data || []
            });
        } catch (error) {
            console.error('회사 키워드 조회 실패:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    async updateCompanyKeywords(req, res) {
        try {
            const companyId = req.user.userId;
            const { keywordIds } = req.body;

            // 입력 검증
            if (!Array.isArray(keywordIds)) {
                return res.status(400).json({
                    success: false,
                    error: 'keywordIds must be an array'
                });
            }

            // 기존 키워드 모두 삭제
            const { error: deleteError } = await supabase
                .from('company_keyword')
                .delete()
                .eq('company_id', companyId);

            if (deleteError) throw deleteError;

            // 새로운 키워드 추가
            if (keywordIds.length > 0) {
                const inserts = keywordIds.map(keywordId => ({
                    company_id: companyId,
                    keyword_id: keywordId
                }));

                const { error: insertError } = await supabase
                    .from('company_keyword')
                    .insert(inserts);

                if (insertError) throw insertError;
            }

            res.json({
                success: true,
                message: '회사 키워드가 성공적으로 업데이트되었습니다'
            });
        } catch (error) {
            console.error('회사 키워드 업데이트 실패:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
};

module.exports = companyKeywordController;