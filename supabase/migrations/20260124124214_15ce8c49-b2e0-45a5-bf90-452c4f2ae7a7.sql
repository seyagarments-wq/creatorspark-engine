-- Add Instagram connection fields to profiles for full Partnership Ads OAuth
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instagram_user_id text,
  ADD COLUMN IF NOT EXISTS instagram_username text,
  ADD COLUMN IF NOT EXISTS instagram_connected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS instagram_access_token text,
  ADD COLUMN IF NOT EXISTS instagram_token_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS instagram_business_account_id text,
  ADD COLUMN IF NOT EXISTS partnership_ads_enabled boolean DEFAULT false;

-- Add index for quick lookup by Instagram user ID
CREATE INDEX IF NOT EXISTS idx_profiles_instagram_user_id ON public.profiles(instagram_user_id);

-- Create table to track creator-brand partnership permissions
CREATE TABLE IF NOT EXISTS public.partnership_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  permission_status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected, revoked
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone,
  revoked_at timestamp with time zone,
  meta_permission_id text, -- ID from Meta's partnership_ad_permissions API
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(creator_id, brand_id)
);

-- Enable RLS on partnership_permissions
ALTER TABLE public.partnership_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can manage all partnership permissions
CREATE POLICY "Admins can manage partnership permissions"
  ON public.partnership_permissions
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Creators can view their own partnership permissions
CREATE POLICY "Creators can view own permissions"
  ON public.partnership_permissions
  FOR SELECT
  USING (
    creator_id = public.get_my_profile_id()
  );

-- Creators can update their own permissions (approve/revoke)
CREATE POLICY "Creators can update own permissions"
  ON public.partnership_permissions
  FOR UPDATE
  USING (
    creator_id = public.get_my_profile_id()
  );

-- Add trigger for updated_at
CREATE TRIGGER update_partnership_permissions_updated_at
  BEFORE UPDATE ON public.partnership_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment explaining the Instagram OAuth fields
COMMENT ON COLUMN public.profiles.instagram_user_id IS 'Meta/Instagram user ID from OAuth';
COMMENT ON COLUMN public.profiles.instagram_business_account_id IS 'Instagram Business Account ID for Partnership Ads';
COMMENT ON COLUMN public.profiles.partnership_ads_enabled IS 'Whether creator has granted branded content permissions';