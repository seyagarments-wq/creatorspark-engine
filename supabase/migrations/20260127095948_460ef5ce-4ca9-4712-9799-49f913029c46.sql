-- Add performance indexes for ad_insights queries
CREATE INDEX IF NOT EXISTS idx_ad_insights_ad_account_id ON public.ad_insights(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_ad_insights_fetched_at ON public.ad_insights(fetched_at DESC);