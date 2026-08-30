-- Create ad_insights table to store detailed Facebook ad metrics
CREATE TABLE public.ad_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_account_id TEXT NOT NULL,
  
  -- Level identifiers (campaign, adset, or ad)
  level TEXT NOT NULL DEFAULT 'ad' CHECK (level IN ('campaign', 'adset', 'ad')),
  object_id TEXT NOT NULL,
  object_name TEXT,
  
  -- Core metrics
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend NUMERIC(12,4) DEFAULT 0,
  reach BIGINT DEFAULT 0,
  
  -- Calculated metrics
  ctr NUMERIC(8,4) DEFAULT 0,
  cpc NUMERIC(12,4) DEFAULT 0,
  cpm NUMERIC(12,4) DEFAULT 0,
  
  -- Conversion metrics
  conversions INTEGER DEFAULT 0,
  conversion_value NUMERIC(12,2) DEFAULT 0,
  
  -- Date range for this insight
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  date_preset TEXT,
  
  -- Timestamps
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint to prevent duplicates for same object/date range
  UNIQUE(object_id, date_start, date_stop, level)
);

-- Enable RLS
ALTER TABLE public.ad_insights ENABLE ROW LEVEL SECURITY;

-- Only admins can manage ad insights
CREATE POLICY "Admins can manage ad insights"
ON public.ad_insights
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add updated_at trigger
CREATE TRIGGER update_ad_insights_updated_at
BEFORE UPDATE ON public.ad_insights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for common queries
CREATE INDEX idx_ad_insights_object_id ON public.ad_insights(object_id);
CREATE INDEX idx_ad_insights_date_range ON public.ad_insights(date_start, date_stop);
CREATE INDEX idx_ad_insights_level ON public.ad_insights(level);

-- Create table to log Meta API errors for debugging
CREATE TABLE public.meta_api_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  error_code INTEGER,
  error_type TEXT,
  error_message TEXT,
  error_subcode INTEGER,
  fbtrace_id TEXT,
  request_url TEXT,
  request_params JSONB,
  response_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.meta_api_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view API logs
CREATE POLICY "Admins can view API logs"
ON public.meta_api_logs
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));