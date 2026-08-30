-- Allow mentors to read video_comments for their assigned creators' videos
CREATE POLICY "Mentors can read assigned creator video comments"
ON public.video_comments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.videos v
    JOIN public.mentor_creator_assignments mca
      ON mca.creator_id = v.creator_id
    WHERE v.id = video_comments.video_id
      AND mca.mentor_id = public.get_my_profile_id()
      AND mca.status = 'active'
  )
);

-- Allow mentors to insert video_comments on their assigned creators' videos
CREATE POLICY "Mentors can comment on assigned creator videos"
ON public.video_comments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.videos v
    JOIN public.mentor_creator_assignments mca
      ON mca.creator_id = v.creator_id
    WHERE v.id = video_comments.video_id
      AND mca.mentor_id = public.get_my_profile_id()
      AND mca.status = 'active'
  )
);