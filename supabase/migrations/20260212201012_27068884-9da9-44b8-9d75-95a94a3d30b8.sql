-- Add expires_at timestamp column to bounties for exact expiration date/time
ALTER TABLE public.bounties ADD COLUMN expires_at timestamptz NULL;