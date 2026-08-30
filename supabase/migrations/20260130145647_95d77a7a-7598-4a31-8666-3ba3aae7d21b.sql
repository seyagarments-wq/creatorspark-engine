-- Add a stable date key to performance_data so we can upsert one row per video per day
-- and keep analytics/earnings windows accurate.

-- 1) Add column
ALTER TABLE public.performance_data
ADD COLUMN IF NOT EXISTS metric_date date;

-- 2) Deduplicate any existing rows per (video, day) before adding a unique index
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY video_id, ((recorded_at AT TIME ZONE 'utc')::date)
      ORDER BY recorded_at DESC, created_at DESC
    ) AS rn
  FROM public.performance_data
)
DELETE FROM public.performance_data pd
USING ranked r
WHERE pd.id = r.id
  AND r.rn > 1;

-- 3) Backfill metric_date
UPDATE public.performance_data
SET metric_date = ((recorded_at AT TIME ZONE 'utc')::date)
WHERE metric_date IS NULL;

-- 4) Enforce not-null
ALTER TABLE public.performance_data
ALTER COLUMN metric_date SET NOT NULL;

-- 5) Unique index for upsert
CREATE UNIQUE INDEX IF NOT EXISTS performance_data_video_metric_date_uidx
ON public.performance_data (video_id, metric_date);

-- 6) Helpful query index
CREATE INDEX IF NOT EXISTS performance_data_metric_date_idx
ON public.performance_data (metric_date);