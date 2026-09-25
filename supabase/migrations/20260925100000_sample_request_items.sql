-- Multi-item sample orders.
--
-- A sample request becomes an order that holds 1-4 items, and one approval makes one Shopify
-- order. The one-size-per-product rule is the unique constraint below. Additive: the old
-- single-item columns on sample_requests stay and keep being filled (first item + a
-- "Daydream Hoodie — Pink + 2 more" summary in product_name), so every existing reader
-- (notifications, onboarding reminders, badges, admin search) keeps working unchanged.

-- 1. Items ---------------------------------------------------------------------------------
CREATE TABLE public.sample_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.sample_requests(id) ON DELETE CASCADE,
  position smallint NOT NULL,
  shopify_product_id text NOT NULL,
  shopify_variant_id text NOT NULL,
  product_title text NOT NULL,
  variant_title text,
  product_image text,
  -- Set by an admin who drops the item before approving. Dropped items never reach Shopify.
  removed_at timestamptz,
  removed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sample_request_items_one_per_product UNIQUE (request_id, shopify_product_id),
  CONSTRAINT sample_request_items_position UNIQUE (request_id, position)
);

CREATE INDEX idx_sample_request_items_request_id ON public.sample_request_items(request_id);

ALTER TABLE public.sample_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all sample request items"
ON public.sample_request_items FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Creators only read. They create items through create_sample_request(), never directly.
CREATE POLICY "Creators can view their own sample request items"
ON public.sample_request_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.sample_requests r
  WHERE r.id = sample_request_items.request_id AND r.creator_id = public.get_my_profile_id()
));

-- 2. Order bookkeeping on the request --------------------------------------------------------
-- shopify_order_claimed_at is taken atomically by shopify-create-sample-order before it calls
-- Shopify, so a double click or a replayed call can never produce a second free order.
ALTER TABLE public.sample_requests
  ADD COLUMN IF NOT EXISTS shopify_order_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS shopify_order_name text;

-- Unused by the app, and it let a creator rewrite a pending request's Shopify fields.
DROP POLICY IF EXISTS "Creators can update their pending requests" ON public.sample_requests;

-- 3. Backfill: every existing request gets its one item ------------------------------------
INSERT INTO public.sample_request_items
  (request_id, position, shopify_product_id, shopify_variant_id, product_title, variant_title, product_image, created_at)
SELECT r.id, 0, r.shopify_product_id, r.shopify_variant_id,
       COALESCE(r.shopify_product_title, r.product_name), r.shopify_variant_title, r.shopify_product_image, r.created_at
FROM public.sample_requests r
WHERE r.shopify_product_id IS NOT NULL AND r.shopify_variant_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.sample_request_items i WHERE i.request_id = r.id);

-- 4. The one way a creator places an order ---------------------------------------------------
-- p_items: [{ "product_id", "variant_id", "product_title", "variant_title", "image" }, ...]
-- Keep the 4 in step with SAMPLE_ORDER_MAX_ITEMS in supabase/functions/_shared/sample-order.ts.
CREATE OR REPLACE FUNCTION public.create_sample_request(
  p_brand_id uuid,
  p_items jsonb,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_state text,
  p_shipping_zip text,
  p_shipping_country text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid := public.get_my_profile_id();
  v_count int;
  v_products int;
  v_first jsonb;
  v_id uuid;
BEGIN
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'Sign in as a creator to request samples' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.creator_brands
    WHERE creator_id = v_creator AND brand_id = p_brand_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You are not an active creator for this brand' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Pick at least one item' USING ERRCODE = '22023';
  END IF;

  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 4 THEN
    RAISE EXCEPTION 'Pick between 1 and 4 items' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR COALESCE(trim(e->>'product_id'), '') = ''
       OR COALESCE(trim(e->>'variant_id'), '') = ''
       OR COALESCE(trim(e->>'product_title'), '') = ''
  ) THEN
    RAISE EXCEPTION 'Every item needs a product and a size' USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT e->>'product_id') INTO v_products FROM jsonb_array_elements(p_items) e;
  IF v_products <> v_count THEN
    RAISE EXCEPTION 'Each product can only be picked once, in one size' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(trim(p_shipping_address), '') = '' THEN
    RAISE EXCEPTION 'Add a shipping address' USING ERRCODE = '22023';
  END IF;

  v_first := p_items->0;

  INSERT INTO public.sample_requests (
    creator_id, brand_id, product_name, product_description,
    shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country,
    shopify_product_id, shopify_variant_id, shopify_product_title, shopify_variant_title, shopify_product_image
  ) VALUES (
    v_creator, p_brand_id,
    (v_first->>'product_title') || CASE WHEN v_count > 1 THEN ' + ' || (v_count - 1) || ' more' ELSE '' END,
    NULLIF(NULLIF(v_first->>'variant_title', ''), 'Default Title'),
    trim(p_shipping_address), NULLIF(trim(p_shipping_city), ''), NULLIF(trim(p_shipping_state), ''),
    NULLIF(trim(p_shipping_zip), ''), COALESCE(NULLIF(trim(p_shipping_country), ''), 'US'),
    v_first->>'product_id', v_first->>'variant_id', v_first->>'product_title',
    NULLIF(v_first->>'variant_title', ''), NULLIF(v_first->>'image', '')
  ) RETURNING id INTO v_id;

  INSERT INTO public.sample_request_items
    (request_id, position, shopify_product_id, shopify_variant_id, product_title, variant_title, product_image)
  SELECT v_id, (t.ord - 1)::smallint, t.e->>'product_id', t.e->>'variant_id', t.e->>'product_title',
         NULLIF(t.e->>'variant_title', ''), NULLIF(t.e->>'image', '')
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sample_request(uuid, jsonb, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sample_request(uuid, jsonb, text, text, text, text, text) TO authenticated;
