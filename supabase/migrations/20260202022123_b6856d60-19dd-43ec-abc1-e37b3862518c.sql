-- Add commission_rate_at_time column to performance_data to capture the rate when revenue was earned
ALTER TABLE public.performance_data 
ADD COLUMN commission_rate_at_time numeric DEFAULT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.performance_data.commission_rate_at_time IS 'The creator commission rate at the time this performance data was recorded. Used for accurate historical commission calculations.';