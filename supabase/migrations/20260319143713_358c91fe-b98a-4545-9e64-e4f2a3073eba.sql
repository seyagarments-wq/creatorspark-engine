
-- plan_items table
CREATE TABLE public.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.mentor_plans(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'note',
  content text DEFAULT '',
  title text DEFAULT '',
  note text DEFAULT '',
  image_url text,
  color text DEFAULT '#6366f1',
  position_order integer DEFAULT 0,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentor and creator can select plan items"
ON public.plan_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.mentor_plans mp
    WHERE mp.id = plan_items.plan_id
    AND (mp.mentor_id = get_my_profile_id() OR mp.creator_id = get_my_profile_id())
  )
);

CREATE POLICY "Mentor and creator can insert plan items"
ON public.plan_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.mentor_plans mp
    WHERE mp.id = plan_items.plan_id
    AND (mp.mentor_id = get_my_profile_id() OR mp.creator_id = get_my_profile_id())
  )
);

CREATE POLICY "Mentor and creator can update plan items"
ON public.plan_items FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.mentor_plans mp
    WHERE mp.id = plan_items.plan_id
    AND (mp.mentor_id = get_my_profile_id() OR mp.creator_id = get_my_profile_id())
  )
);

CREATE POLICY "Mentor and creator can delete plan items"
ON public.plan_items FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.mentor_plans mp
    WHERE mp.id = plan_items.plan_id
    AND (mp.mentor_id = get_my_profile_id() OR mp.creator_id = get_my_profile_id())
  )
);

CREATE POLICY "Admins can manage all plan items"
ON public.plan_items FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- plan_comments table
CREATE TABLE public.plan_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.mentor_plans(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.plan_items(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL DEFAULT '',
  audio_url text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentor and creator can select plan comments"
ON public.plan_comments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.mentor_plans mp
    WHERE mp.id = plan_comments.plan_id
    AND (mp.mentor_id = get_my_profile_id() OR mp.creator_id = get_my_profile_id())
  )
);

CREATE POLICY "Mentor and creator can insert plan comments"
ON public.plan_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = get_my_profile_id() AND
  EXISTS (
    SELECT 1 FROM public.mentor_plans mp
    WHERE mp.id = plan_comments.plan_id
    AND (mp.mentor_id = get_my_profile_id() OR mp.creator_id = get_my_profile_id())
  )
);

CREATE POLICY "Mentor and creator can delete own comments"
ON public.plan_comments FOR DELETE TO authenticated
USING (author_id = get_my_profile_id());

CREATE POLICY "Admins can manage all plan comments"
ON public.plan_comments FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Storage bucket for plan uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('plan-uploads', 'plan-uploads', true);

CREATE POLICY "Authenticated users can upload plan files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'plan-uploads');

CREATE POLICY "Anyone can view plan files"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'plan-uploads');

CREATE POLICY "Users can delete their own plan files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'plan-uploads' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_comments;
