-- Allow all authenticated creators to view performance data for approved/live videos
-- This enables the "Top Videos This Week" feature across all creators
CREATE POLICY "Authenticated users can view approved video performance"
ON public.performance_data
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM videos 
    WHERE videos.id = performance_data.video_id 
    AND videos.status = 'approved'
  )
);