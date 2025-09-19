-- Migration: Add profile_unlocked_at to applications table
-- File: add_profile_unlocked_at.sql
-- Date: 2025-01-19
-- Description: Add profile unlock tracking for company token system

-- Add profile_unlocked_at field to applications table
ALTER TABLE applications
ADD COLUMN profile_unlocked_at timestamp with time zone DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN applications.profile_unlocked_at IS 'Timestamp when company unlocked user profile details using tokens';

-- Add index for performance optimization
CREATE INDEX idx_applications_profile_unlocked
ON applications (company_id, profile_unlocked_at)
WHERE profile_unlocked_at IS NOT NULL;

-- Add index for applications by company and token usage
CREATE INDEX idx_applications_company_tokens
ON applications (company_id, token_used, applied_at DESC);

-- Verify the migration
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'applications'
AND column_name = 'profile_unlocked_at';