-- Create table to track daily video sequence counters
CREATE TABLE public.daily_video_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counter_date DATE NOT NULL UNIQUE,
  next_sequence INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_video_counters ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to call the function (which handles the insert/update)
CREATE POLICY "Allow authenticated access to counters"
ON public.daily_video_counters
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Create atomic function to get next sequence number
CREATE OR REPLACE FUNCTION public.get_next_video_sequence(target_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  -- Insert new row if doesn't exist, or increment existing
  INSERT INTO daily_video_counters (counter_date, next_sequence)
  VALUES (target_date, 2)
  ON CONFLICT (counter_date) 
  DO UPDATE SET 
    next_sequence = daily_video_counters.next_sequence + 1,
    updated_at = now()
  RETURNING next_sequence - 1 INTO seq_num;
  
  RETURN seq_num;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_next_video_sequence(DATE) TO authenticated;