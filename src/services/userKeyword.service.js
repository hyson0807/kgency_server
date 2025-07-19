const { supabase } = require('../config/database');


exports.getUserKeywords = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('user_keyword')
            .select('keyword_id')
            .eq('user_id', userId);

        if (error) throw error;

        return data || [];
    } catch (error) {
        console.error('Get user keywords service error:', error);
        throw error;
    }

}