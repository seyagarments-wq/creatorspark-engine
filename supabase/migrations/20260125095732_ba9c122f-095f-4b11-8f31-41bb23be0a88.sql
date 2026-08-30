-- Add Shopify-related columns to sample_requests table
ALTER TABLE public.sample_requests
ADD COLUMN IF NOT EXISTS shopify_product_id TEXT,
ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT,
ADD COLUMN IF NOT EXISTS shopify_product_title TEXT,
ADD COLUMN IF NOT EXISTS shopify_variant_title TEXT,
ADD COLUMN IF NOT EXISTS shopify_product_image TEXT,
ADD COLUMN IF NOT EXISTS shopify_draft_order_id TEXT,
ADD COLUMN IF NOT EXISTS shopify_order_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sample_requests_shopify_product_id ON public.sample_requests(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_sample_requests_shopify_draft_order_id ON public.sample_requests(shopify_draft_order_id);