-- Create direct_messages table for one-on-one chats
CREATE TABLE public.direct_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant1_id uuid NOT NULL,
  participant2_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT unique_dm_pair UNIQUE (participant1_id, participant2_id)
);

-- Add chat_type to group_chats to distinguish group vs broadcast chats
ALTER TABLE public.group_chats ADD COLUMN IF NOT EXISTS chat_type text NOT NULL DEFAULT 'group';

-- Add dm_id to messages table for direct messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS dm_id uuid REFERENCES public.direct_messages(id) ON DELETE CASCADE;

-- Make chat_id nullable since messages can now belong to either group chat or DM
ALTER TABLE public.messages ALTER COLUMN chat_id DROP NOT NULL;

-- Add check constraint to ensure message belongs to either group chat or DM
ALTER TABLE public.messages ADD CONSTRAINT message_belongs_to_one_chat 
  CHECK ((chat_id IS NOT NULL AND dm_id IS NULL) OR (chat_id IS NULL AND dm_id IS NOT NULL));

-- Enable RLS on direct_messages
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Admins can manage all DMs
CREATE POLICY "Admins can manage all DMs"
  ON public.direct_messages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own DMs
CREATE POLICY "Users can view their own DMs"
  ON public.direct_messages FOR SELECT
  USING (participant1_id = auth.uid() OR participant2_id = auth.uid());

-- Update messages policies to include DMs
DROP POLICY IF EXISTS "Members can view messages in their chats" ON public.messages;
CREATE POLICY "Users can view messages in their chats or DMs"
  ON public.messages FOR SELECT
  USING (
    (chat_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM group_chat_members
      WHERE group_chat_members.chat_id = messages.chat_id 
      AND group_chat_members.user_id = auth.uid()
    ))
    OR
    (dm_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM direct_messages
      WHERE direct_messages.id = messages.dm_id
      AND (direct_messages.participant1_id = auth.uid() OR direct_messages.participant2_id = auth.uid())
    ))
  );

DROP POLICY IF EXISTS "Members can send messages to their chats" ON public.messages;
CREATE POLICY "Users can send messages to their chats or DMs"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND (
      (chat_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM group_chat_members
        WHERE group_chat_members.chat_id = messages.chat_id 
        AND group_chat_members.user_id = auth.uid()
      ))
      OR
      (dm_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM direct_messages
        WHERE direct_messages.id = messages.dm_id
        AND (direct_messages.participant1_id = auth.uid() OR direct_messages.participant2_id = auth.uid())
      ))
    )
  );

-- Admins can create DMs
CREATE POLICY "Admins can create DMs"
  ON public.direct_messages FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for direct_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;