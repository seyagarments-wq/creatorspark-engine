
-- Create mentor_assignments table for assignment-based mentor system
CREATE TABLE public.mentor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES public.profiles(id),
  assigned_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'assigned',
  task_contacted BOOLEAN NOT NULL DEFAULT false,
  task_feedback_sent BOOLEAN NOT NULL DEFAULT false,
  task_example_shared BOOLEAN NOT NULL DEFAULT false,
  mentor_notes TEXT,
  admin_notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(video_id, mentor_id)
);

-- Enable RLS
ALTER TABLE public.mentor_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can manage all assignments
CREATE POLICY "Admins can manage all mentor assignments"
ON public.mentor_assignments
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Mentors can view their own assignments
CREATE POLICY "Mentors can view their own assignments"
ON public.mentor_assignments
FOR SELECT
TO public
USING (mentor_id = get_my_profile_id());

-- Mentors can update their own assignments (tasks, notes, status)
CREATE POLICY "Mentors can update their own assignments"
ON public.mentor_assignments
FOR UPDATE
TO public
USING (mentor_id = get_my_profile_id())
WITH CHECK (mentor_id = get_my_profile_id());

-- RLS policy on videos: mentors can see rejected videos assigned to them
CREATE POLICY "Mentors can view assigned rejected videos"
ON public.videos
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.mentor_assignments ma
    WHERE ma.video_id = videos.id
    AND ma.mentor_id = get_my_profile_id()
  )
);

-- Enable realtime for mentor_assignments so mentors see updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.mentor_assignments;
