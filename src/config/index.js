const { supabase } = require('./database');
const corsOptions = require('./cors');

module.exports = {
    supabase,
    corsOptions,
    jwtSecret: process.env.JWT_SECRET,
    port: process.env.PORT || 5004
};