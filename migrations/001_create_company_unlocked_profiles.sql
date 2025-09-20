-- Create company_unlocked_profiles table
CREATE TABLE IF NOT EXISTS public.company_unlocked_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    token_transaction_id UUID REFERENCES public.token_transactions(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Ensure a company can only unlock a user's profile once
    CONSTRAINT unique_company_user_unlock UNIQUE (company_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_company_unlocked_profiles_company ON public.company_unlocked_profiles(company_id);
CREATE INDEX idx_company_unlocked_profiles_user ON public.company_unlocked_profiles(user_id);
CREATE INDEX idx_company_unlocked_profiles_unlocked_at ON public.company_unlocked_profiles(unlocked_at);

-- Enable RLS
ALTER TABLE public.company_unlocked_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Companies can view their own unlocked profiles" ON public.company_unlocked_profiles
    FOR SELECT
    USING (auth.uid() = company_id);

CREATE POLICY "System can insert unlocked profiles" ON public.company_unlocked_profiles
    FOR INSERT
    WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.company_unlocked_profiles IS 'Tracks which user profiles a company has unlocked for viewing';
COMMENT ON COLUMN public.company_unlocked_profiles.company_id IS 'The company that unlocked the profile';
COMMENT ON COLUMN public.company_unlocked_profiles.user_id IS 'The user whose profile was unlocked';
COMMENT ON COLUMN public.company_unlocked_profiles.unlocked_at IS 'When the profile was unlocked';
COMMENT ON COLUMN public.company_unlocked_profiles.token_transaction_id IS 'Reference to the token transaction for this unlock';

-- Migrate existing data from applications table
INSERT INTO public.company_unlocked_profiles (company_id, user_id, unlocked_at, token_transaction_id)
SELECT DISTINCT
    a.company_id,
    a.user_id,
    a.profile_unlocked_at,
    a.token_transaction_id
FROM public.applications a
WHERE a.profile_unlocked_at IS NOT NULL
ON CONFLICT (company_id, user_id) DO NOTHING;