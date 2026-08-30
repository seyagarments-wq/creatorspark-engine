
-- Create mentor_plans table
CREATE TABLE public.mentor_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  script_text text DEFAULT '',
  reference_links jsonb DEFAULT '[]'::jsonb,
  notes text DEFAULT '',
  video_call_url text DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, creator_id)
);

-- Enable RLS
ALTER TABLE public.mentor_plans ENABLE ROW LEVEL SECURITY;

-- Admins can manage all plans
CREATE POLICY "Admins can manage all mentor plans"
ON public.mentor_plans FOR ALL TO public
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Mentors can CRUD their own plans
CREATE POLICY "Mentors can manage their plans"
ON public.mentor_plans FOR ALL TO authenticated
USING (mentor_id = get_my_profile_id())
WITH CHECK (mentor_id = get_my_profile_id());

-- Creators can view and update plans where they are the creator
CREATE POLICY "Creators can view their plans"
ON public.mentor_plans FOR SELECT TO authenticated
USING (creator_id = get_my_profile_id());

CREATE POLICY "Creators can update their plans"
ON public.mentor_plans FOR UPDATE TO authenticated
USING (creator_id = get_my_profile_id())
WITH CHECK (creator_id = get_my_profile_id());

-- Auto-update updated_at
CREATE TRIGGER update_mentor_plans_updated_at
  BEFORE UPDATE ON public.mentor_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.mentor_plans;
