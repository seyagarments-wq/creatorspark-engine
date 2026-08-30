
-- Create message_reactions table
CREATE TABLE public.message_reactions (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id   uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  emoji        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read reactions (needed to display them in shared chats)
CREATE POLICY "Authenticated users can view reactions"
  ON public.message_reactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can insert their own reactions
CREATE POLICY "Users can insert their own reactions"
  ON public.message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reactions
CREATE POLICY "Users can delete their own reactions"
  ON public.message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for live reaction updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
