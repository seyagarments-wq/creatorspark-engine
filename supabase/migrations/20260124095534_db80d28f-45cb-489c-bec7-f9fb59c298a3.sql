-- Add Stripe Connect account ID to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE;

-- Add stripe_transfer_id to payouts table to track transfers
ALTER TABLE public.payouts
ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;