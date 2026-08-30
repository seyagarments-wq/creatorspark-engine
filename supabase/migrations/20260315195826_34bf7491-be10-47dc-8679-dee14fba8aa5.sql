DROP POLICY "Creators can delete their own videos" ON public.videos;

CREATE POLICY "Creators can delete their own videos"
ON public.videos
FOR DELETE
TO public
USING (
  (creator_id = get_my_profile_id()) 
  AND (status = ANY (ARRAY['pending'::video_status, 'rejected'::video_status, 'revision_requested'::video_status]))
);