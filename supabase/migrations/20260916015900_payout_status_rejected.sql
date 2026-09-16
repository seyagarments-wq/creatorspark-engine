-- AdminPayouts already writes status 'rejected' (two buttons) but the enum never had it, so
-- those buttons threw. Kept in its own migration: an added enum value cannot be used in the
-- same transaction that adds it.
ALTER TYPE public.payout_status ADD VALUE IF NOT EXISTS 'rejected';
