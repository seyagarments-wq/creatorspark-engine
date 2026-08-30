
-- Table to store referral sign-up applications (pending admin review)
CREATE TABLE IF NOT EXISTS public.referral_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_id uuid REFERENCES public.referrals(id) ON DELETE SET NULL,
  referrer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  instagram_handle text NOT NULL,
  sample_video_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  rejection_reason text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_applications ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage referral applications"
ON public.referral_applications
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can insert (public sign-up form)
CREATE POLICY "Anyone can submit a referral application"
ON public.referral_applications
FOR INSERT
WITH CHECK (true);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.update_referral_applications_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_referral_applications_updated_at
BEFORE UPDATE ON public.referral_applications
FOR EACH ROW EXECUTE FUNCTION public.update_referral_applications_updated_at();
