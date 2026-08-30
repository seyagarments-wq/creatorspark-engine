CREATE INDEX IF NOT EXISTS idx_video_comments_video_id_created_at
ON public.video_comments (video_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_videos_status_created_at
ON public.videos (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_videos_creator_id_created_at
ON public.videos (creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_dm_id_created_at
ON public.messages (dm_id, created_at DESC)
WHERE dm_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at
ON public.messages (chat_id, created_at DESC)
WHERE chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_sender_id_created_at
ON public.messages (sender_id, created_at DESC)
WHERE sender_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payouts_status_paid_at_created_at
ON public.payouts (status, paid_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_created_at
ON public.user_roles (role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_user_id
ON public.user_roles (role, user_id);

CREATE INDEX IF NOT EXISTS idx_direct_messages_participant1_id
ON public.direct_messages (participant1_id);

CREATE INDEX IF NOT EXISTS idx_direct_messages_participant2_id
ON public.direct_messages (participant2_id);