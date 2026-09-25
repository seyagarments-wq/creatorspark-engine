-- Direct inserts into sample_requests (the path an app tab still on the old single-item bundle
-- uses) may only create a fresh, pending request for a brand the creator is active with. Before
-- this, a creator could insert status 'approved' or pre-fill the Shopify order columns, which
-- shopify-create-sample-order reads. create_sample_request() is SECURITY DEFINER and unaffected.
DROP POLICY IF EXISTS "Creators can create sample requests" ON public.sample_requests;

CREATE POLICY "Creators can create sample requests"
ON public.sample_requests FOR INSERT
WITH CHECK (
  creator_id = public.get_my_profile_id()
  AND status = 'requested'
  AND shopify_order_id IS NULL
  AND shopify_draft_order_id IS NULL
  AND shopify_order_name IS NULL
  AND shopify_order_claimed_at IS NULL
  AND tracking_number IS NULL
  AND shipped_at IS NULL
  AND delivered_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.creator_brands cb
    WHERE cb.creator_id = public.get_my_profile_id()
      AND cb.brand_id = sample_requests.brand_id
      AND cb.status = 'active'
  )
);
