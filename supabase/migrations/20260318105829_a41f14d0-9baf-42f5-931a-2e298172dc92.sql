ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS payout_method text NOT NULL DEFAULT 'stripe';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS paypal_email text;