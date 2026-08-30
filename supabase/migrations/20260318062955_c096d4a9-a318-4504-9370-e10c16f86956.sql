
-- Create photo_submissions table
CREATE TABLE public.photo_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id uuid NOT NULL REFERENCES public.bounties(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  link_url text NOT NULL,
  edited_count integer NOT NULL DEFAULT 0,
  raw_count integer NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  reviewed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.photo_submissions ENABLE ROW LEVEL SECURITY;

-- Admins can manage all
CREATE POLICY "Admins can manage photo submissions"
  ON public.photo_submissions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Creators can view their own
CREATE POLICY "Creators can view their photo submissions"
  ON public.photo_submissions FOR SELECT
  USING (creator_id = get_my_profile_id());

-- Creators can insert their own
CREATE POLICY "Creators can insert photo submissions"
  ON public.photo_submissions FOR INSERT
  WITH CHECK (creator_id = get_my_profile_id());

-- Updated at trigger
CREATE TRIGGER update_photo_submissions_updated_at
  BEFORE UPDATE ON public.photo_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
