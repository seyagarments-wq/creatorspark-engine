-- Create brands table
CREATE TABLE public.brands (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  logo_url text,
  website_url text,
  commission_rate numeric DEFAULT 10,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on brands
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view active brands
CREATE POLICY "Authenticated users can view active brands"
ON public.brands FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true);

-- Admins can manage brands
CREATE POLICY "Admins can manage brands"
ON public.brands FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create campaigns table
CREATE TABLE public.campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  brief text,
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on campaigns
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view active campaigns
CREATE POLICY "Authenticated users can view campaigns"
ON public.campaigns FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Admins can manage campaigns
CREATE POLICY "Admins can manage campaigns"
ON public.campaigns FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create creator_brands junction table for creators joining brands
CREATE TABLE public.creator_brands (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive')),
  UNIQUE(creator_id, brand_id)
);

-- Enable RLS on creator_brands
ALTER TABLE public.creator_brands ENABLE ROW LEVEL SECURITY;

-- Creators can view their own brand associations
CREATE POLICY "Creators can view their brand associations"
ON public.creator_brands FOR SELECT
USING (creator_id = get_my_profile_id());

-- Creators can join brands
CREATE POLICY "Creators can join brands"
ON public.creator_brands FOR INSERT
WITH CHECK (creator_id = get_my_profile_id());

-- Admins can manage all brand associations
CREATE POLICY "Admins can manage creator brands"
ON public.creator_brands FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Add brand_id and campaign_id to videos table
ALTER TABLE public.videos 
ADD COLUMN brand_id uuid REFERENCES public.brands(id),
ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id);

-- Create meta_credentials table for future Meta API integration
CREATE TABLE public.meta_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token text,
  ad_account_id text,
  connected_at timestamp with time zone,
  expires_at timestamp with time zone,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'expired')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on meta_credentials
ALTER TABLE public.meta_credentials ENABLE ROW LEVEL SECURITY;

-- Only admins can manage meta credentials
CREATE POLICY "Admins can manage meta credentials"
ON public.meta_credentials FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create triggers for updated_at
CREATE TRIGGER update_brands_updated_at
BEFORE UPDATE ON public.brands
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meta_credentials_updated_at
BEFORE UPDATE ON public.meta_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert a sample brand for testing
INSERT INTO public.brands (name, description, commission_rate) VALUES
  ('Demo Brand', 'This is a demo brand for testing the platform', 12);