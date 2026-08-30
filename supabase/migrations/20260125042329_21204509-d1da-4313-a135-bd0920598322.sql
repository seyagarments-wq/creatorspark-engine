-- Allow authenticated users to view all approved videos (for top videos showcase)
CREATE POLICY "Authenticated users can view approved videos" 
ON public.videos 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND status = 'approved');