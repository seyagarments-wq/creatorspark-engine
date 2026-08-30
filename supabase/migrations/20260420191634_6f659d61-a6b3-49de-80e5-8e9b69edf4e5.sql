
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS rejection_reason_code TEXT
    CHECK (rejection_reason_code IN ('batch_content','low_effort','off_brand','duplicate','quality','other')),
  ADD COLUMN IF NOT EXISTS similarity_flag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS similarity_reason TEXT;
