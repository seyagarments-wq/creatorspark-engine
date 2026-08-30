
-- Add is_mentor flag to profiles
ALTER TABLE public.profiles ADD COLUMN is_mentor BOOLEAN NOT NULL DEFAULT false;

-- Create mentor_feedback table
CREATE TABLE public.mentor_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feedback TEXT NOT NULL,
  emailed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mentor_feedback ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can manage all
CREATE POLICY "Admins can manage all mentor feedback"
  ON public.mentor_feedback FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Mentors can insert feedback
CREATE POLICY "Mentors can insert feedback"
  ON public.mentor_feedback FOR INSERT
  WITH CHECK (
    mentor_id = get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = mentor_id AND is_mentor = true
    )
  );

-- RLS: Mentors can view their own feedback
CREATE POLICY "Mentors can view their own feedback"
  ON public.mentor_feedback FOR SELECT
  USING (mentor_id = get_my_profile_id());

-- RLS: Creators can view feedback on their own videos
CREATE POLICY "Creators can view feedback on their videos"
  ON public.mentor_feedback FOR SELECT
  USING (creator_id = get_my_profile_id());

-- RLS on videos: Mentors can view rejected videos from their cohort
CREATE POLICY "Mentors can view rejected videos in their cohort"
  ON public.videos FOR SELECT
  USING (
    status = 'rejected'::video_status
    AND EXISTS (
      SELECT 1 FROM public.profiles mp
      WHERE mp.user_id = auth.uid()
        AND mp.is_mentor = true
    )
    AND EXISTS (
      SELECT 1 FROM public.creator_cohort_members mcm
      JOIN public.creator_cohort_members vcm ON mcm.cohort_id = vcm.cohort_id
      WHERE mcm.creator_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        AND vcm.creator_id = videos.creator_id
    )
  );
