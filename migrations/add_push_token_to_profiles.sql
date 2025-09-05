-- Migration: Add push_token fields to profiles table
-- Created: 2024-01-09
-- Description: Add fields for storing Expo push tokens for push notifications

-- Add push_token column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Add push_token_updated_at column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMPTZ;

-- Create index for faster push token lookups
CREATE INDEX IF NOT EXISTS idx_profiles_push_token 
ON profiles(push_token) 
WHERE push_token IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.push_token IS 'Expo push token for sending push notifications';
COMMENT ON COLUMN profiles.push_token_updated_at IS 'Timestamp when push token was last updated';