
-- Ad copy templates (saved primary texts & headlines)
CREATE TABLE public.ad_copy_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  primary_texts text[] NOT NULL DEFAULT '{}',
  headlines text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_copy_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage copy templates"
  ON public.ad_copy_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Ad landing pages (saved URLs)
CREATE TABLE public.ad_landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  url text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage landing pages"
  ON public.ad_landing_pages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Ad presets (naming conventions, UTM params, default CTA — single row)
CREATE TABLE public.ad_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naming_template text DEFAULT '{creator}_{product}_{date}',
  utm_source text DEFAULT 'meta',
  utm_medium text DEFAULT 'paid',
  utm_campaign text DEFAULT '',
  utm_content text DEFAULT '',
  utm_term text DEFAULT '',
  default_cta text DEFAULT 'SHOP_NOW',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ad presets"
  ON public.ad_presets FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Ad launches (each time admin builds & launches ads)
CREATE TABLE public.ad_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  total_ads integer NOT NULL DEFAULT 0,
  ads_created integer NOT NULL DEFAULT 0,
  campaign_config jsonb NOT NULL DEFAULT '{}',
  ad_set_config jsonb NOT NULL DEFAULT '{}',
  ad_preferences jsonb NOT NULL DEFAULT '{}',
  error_message text,
  launched_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_launches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ad launches"
  ON public.ad_launches FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Ad launch items (individual ads within a launch)
CREATE TABLE public.ad_launch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id uuid NOT NULL REFERENCES public.ad_launches(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id),
  campaign_id text,
  campaign_name text,
  ad_set_id text,
  ad_set_name text,
  ad_name text,
  identity_type text NOT NULL DEFAULT 'brand',
  primary_text text,
  headline text,
  landing_url text,
  cta text DEFAULT 'SHOP_NOW',
  meta_ad_id text,
  meta_status text DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_launch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ad launch items"
  ON public.ad_launch_items FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_ad_copy_templates_updated_at
  BEFORE UPDATE ON public.ad_copy_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_landing_pages_updated_at
  BEFORE UPDATE ON public.ad_landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_presets_updated_at
  BEFORE UPDATE ON public.ad_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_launches_updated_at
  BEFORE UPDATE ON public.ad_launches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_launch_items_updated_at
  BEFORE UPDATE ON public.ad_launch_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default presets row
INSERT INTO public.ad_presets (naming_template, utm_source, utm_medium, default_cta)
VALUES ('{creator}_{product}_{date}', 'meta', 'paid', 'SHOP_NOW');
