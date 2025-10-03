-- token_transactions 테이블의 트리거 확인
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'token_transactions';

-- token_transactions 관련 함수 확인
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_name LIKE '%token%';
