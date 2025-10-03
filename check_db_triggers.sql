-- 1. token_transactions 테이블의 모든 트리거 확인
SELECT 
    trigger_name,
    event_manipulation as event,
    action_timing as timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' 
  AND event_object_table = 'token_transactions';

-- 2. user_tokens 관련 트리거 확인
SELECT 
    trigger_name,
    event_manipulation as event,
    action_timing as timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' 
  AND event_object_table = 'user_tokens';

-- 3. token 관련 함수 확인
SELECT 
    p.proname as function_name,
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND (p.proname LIKE '%token%' OR p.proname LIKE '%balance%');
