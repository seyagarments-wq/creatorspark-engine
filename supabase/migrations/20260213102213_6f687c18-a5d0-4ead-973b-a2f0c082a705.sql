
CREATE TABLE public.video_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;

-- Admins can read all comments
CREATE POLICY "Admins can read all video comments"
  ON public.video_comments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Creators can read comments on their own videos
CREATE POLICY "Creators can read own video comments"
  ON public.video_comments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.videos WHERE id = video_comments.video_id AND creator_id = (
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
    ))
  );

-- Authenticated users can insert comments
CREATE POLICY "Users can insert video comments"
  ON public.video_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_comments;
