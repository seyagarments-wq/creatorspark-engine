
-- Add mentor verdict columns to videos table
ALTER TABLE public.videos 
  ADD COLUMN IF NOT EXISTS mentor_verdict text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mentor_verdict_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mentor_verdict_by uuid DEFAULT NULL REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS mentor_verdict_notes text DEFAULT NULL;

-- RLS policy: mentors can update mentor_verdict fields on videos of their assigned creators
CREATE POLICY "Mentors can update mentor verdict on assigned creator videos"
ON public.videos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM mentor_creator_assignments mca
    WHERE mca.creator_id = videos.creator_id
      AND mca.mentor_id = get_my_profile_id()
      AND mca.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM mentor_creator_assignments mca
    WHERE mca.creator_id = videos.creator_id
      AND mca.mentor_id = get_my_profile_id()
      AND mca.status = 'active'
  )
);
