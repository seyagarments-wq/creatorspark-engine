
-- Table for temporarily assigning creators to mentors
CREATE TABLE public.mentor_creator_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mentor_id, creator_id)
);

ALTER TABLE public.mentor_creator_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage mentor creator assignments"
ON public.mentor_creator_assignments FOR ALL TO public
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Mentors can view their creator assignments"
ON public.mentor_creator_assignments FOR SELECT TO public
USING (mentor_id = get_my_profile_id());

-- Table for per-video review discussion threads (admin + mentor only)
CREATE TABLE public.video_review_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_review_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage review messages"
ON public.video_review_messages FOR ALL TO public
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Mentors can view review messages on their assigned videos"
ON public.video_review_messages FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM mentor_creator_assignments mca
    JOIN videos v ON v.creator_id = mca.creator_id
    WHERE v.id = video_review_messages.video_id
    AND mca.mentor_id = get_my_profile_id()
    AND mca.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM mentor_assignments ma
    WHERE ma.video_id = video_review_messages.video_id
    AND ma.mentor_id = get_my_profile_id()
  )
);

CREATE POLICY "Mentors can insert review messages on their assigned videos"
ON public.video_review_messages FOR INSERT TO public
WITH CHECK (
  sender_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM mentor_creator_assignments mca
      JOIN videos v ON v.creator_id = mca.creator_id
      JOIN profiles p ON p.id = mca.mentor_id AND p.user_id = auth.uid()
      WHERE v.id = video_review_messages.video_id
      AND mca.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM mentor_assignments ma
      JOIN profiles p ON p.id = ma.mentor_id AND p.user_id = auth.uid()
      WHERE ma.video_id = video_review_messages.video_id
    )
  )
);

-- Enable realtime for review messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_review_messages;
