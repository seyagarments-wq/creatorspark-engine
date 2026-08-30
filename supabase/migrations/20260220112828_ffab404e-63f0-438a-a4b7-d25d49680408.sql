CREATE TABLE public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  chat_id uuid REFERENCES public.group_chats(id) ON DELETE CASCADE,
  dm_id uuid REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  content text NOT NULL,
  image_url text,
  scheduled_at timestamptz NOT NULL,
  sent boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scheduled messages"
  ON public.scheduled_messages
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));