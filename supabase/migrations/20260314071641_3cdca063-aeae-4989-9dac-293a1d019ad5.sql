
-- Allow mentors to view videos for their assigned creators
CREATE POLICY "Mentors can view assigned creator videos"
ON public.videos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM mentor_creator_assignments mca
    WHERE mca.creator_id = videos.creator_id
      AND mca.mentor_id = get_my_profile_id()
      AND mca.status = 'active'
  )
);

-- Allow mentors to view performance data for their assigned creators' videos
CREATE POLICY "Mentors can view assigned creator performance"
ON public.performance_data
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM videos v
    JOIN mentor_creator_assignments mca ON mca.creator_id = v.creator_id
    WHERE v.id = performance_data.video_id
      AND mca.mentor_id = get_my_profile_id()
      AND mca.status = 'active'
  )
);
