const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.KEY_1,  // SUPABASE_URL
    process.env.KEY_2   // SUPABASE_ANON_KEY
);

module.exports = { supabase };