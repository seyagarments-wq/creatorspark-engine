CREATE TABLE public.meta_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id text NOT NULL,
  object_name text,
  level text NOT NULL DEFAULT 'ad',
  status text,
  effective_status text,
  campaign_id text,
  adset_id text,
  daily_budget numeric,
  lifetime_budget numeric,
  objective text,
  targeting jsonb,
  ad_account_id text NOT NULL,
  meta_data jsonb DEFAULT '{}'::jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(object_id)
);
ALTER TABLE public.meta_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage meta objects" ON public.meta_objects FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role));