-- Allow creators to delete their own pending or rejected videos
CREATE POLICY "Creators can delete their own videos"
ON public.videos
FOR DELETE
USING (
  creator_id = get_my_profile_id() 
  AND status IN ('pending', 'rejected')
);