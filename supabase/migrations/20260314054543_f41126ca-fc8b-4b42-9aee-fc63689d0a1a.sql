CREATE POLICY "Mentors can create DMs with assigned creators"
ON public.direct_messages
FOR INSERT
TO authenticated
WITH CHECK (
  participant1_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND p.is_mentor = true
  )
  AND EXISTS (
    SELECT 1 FROM mentor_assignments ma
    JOIN profiles mp ON mp.id = ma.mentor_id AND mp.user_id = auth.uid()
    WHERE ma.status IN ('assigned', 'in_progress')
    AND EXISTS (
      SELECT 1 FROM videos v
      JOIN profiles cp ON cp.id = v.creator_id AND cp.user_id = direct_messages.participant2_id
      WHERE v.id = ma.video_id
    )
  )
);