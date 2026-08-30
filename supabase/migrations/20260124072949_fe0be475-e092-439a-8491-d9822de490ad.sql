-- Add brand_id to invites table for brand-specific creator invitations
ALTER TABLE public.invites ADD COLUMN brand_id uuid REFERENCES public.brands(id);

-- Create sample_requests table for sample seeding system
CREATE TABLE public.sample_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_description text,
  shipping_address text NOT NULL,
  shipping_city text,
  shipping_state text,
  shipping_zip text,
  shipping_country text DEFAULT 'US',
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'shipped', 'delivered', 'cancelled')),
  tracking_number text,
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  shipped_at timestamp with time zone,
  delivered_at timestamp with time zone
);

-- Enable RLS on sample_requests
ALTER TABLE public.sample_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for sample_requests
CREATE POLICY "Creators can view their own sample requests"
ON public.sample_requests
FOR SELECT
USING (creator_id = get_my_profile_id());

CREATE POLICY "Creators can create sample requests"
ON public.sample_requests
FOR INSERT
WITH CHECK (creator_id = get_my_profile_id());

CREATE POLICY "Creators can update their pending requests"
ON public.sample_requests
FOR UPDATE
USING (creator_id = get_my_profile_id() AND status = 'requested');

CREATE POLICY "Admins can manage all sample requests"
ON public.sample_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create creative_briefs table for content guidelines
CREATE TABLE public.creative_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  guidelines text,
  dos text[],
  donts text[],
  mood_board_urls text[],
  example_video_urls text[],
  deadline timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on creative_briefs
ALTER TABLE public.creative_briefs ENABLE ROW LEVEL SECURITY;

-- RLS policies for creative_briefs
CREATE POLICY "Authenticated users can view active briefs"
ON public.creative_briefs
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Admins can manage all briefs"
ON public.creative_briefs
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Add brief_id to videos table for linking submissions to briefs
ALTER TABLE public.videos ADD COLUMN brief_id uuid REFERENCES public.creative_briefs(id);

-- Add whitelisting fields to videos table
ALTER TABLE public.videos 
  ADD COLUMN whitelisted_at timestamp with time zone,
  ADD COLUMN whitelisting_approved boolean DEFAULT false,
  ADD COLUMN creator_instagram_handle text;

-- Create trigger for updated_at on sample_requests
CREATE TRIGGER update_sample_requests_updated_at
  BEFORE UPDATE ON public.sample_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on creative_briefs
CREATE TRIGGER update_creative_briefs_updated_at
  BEFORE UPDATE ON public.creative_briefs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();