-- Drop the SELECT policy on storage.objects for product-images.
--
-- Public buckets serve files via the /storage/v1/object/public/<bucket>/<path>
-- CDN endpoint, which bypasses RLS entirely. The SELECT policy added in 00027
-- only affected the authenticated storage.objects query API, which we never
-- use for this bucket — its practical effect was letting clients enumerate
-- every file in the bucket via `supabase.storage.from('product-images').list()`.
-- Supabase's advisor flags that as data exposure, so drop the policy.
-- Reads of individual files by known path continue to work through the public
-- CDN endpoint (that's what productImageUrl() constructs).

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
