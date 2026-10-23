-- Landing page pictures come in three shapes.
--
-- A landing page picture was always one shape, wide 16:9 ('landing_image').
-- A square cover or a portrait sketch had to be cut to it, losing what was
-- outside the frame. Two more shapes join it, each a catalogue purpose of its
-- own with its own public bucket and its own exact stored size (held in the
-- application's purpose map beside the others):
--
--   'landing_square_image'    square 1:1,   in `landing-square-images`
--   'landing_portrait_image'  portrait 4:5, in `landing-portrait-images`
--
-- The shape is a property of the purpose and never a separate claim: the
-- catalogue stores no size, a page reserves each picture's box before it
-- loads, and an entry's purpose never changes, so the purpose is the one
-- place the shape can be read from without ever disagreeing with the file.
--
-- This file only adds the purposes and the buckets. An enum value cannot be
-- used in the transaction that adds it, so what links an entry of these
-- purposes — the landing page triggers — comes in the next migration.

ALTER TYPE public.catalogue_image_purpose ADD VALUE 'landing_square_image' AFTER 'landing_image';
ALTER TYPE public.catalogue_image_purpose ADD VALUE 'landing_portrait_image' AFTER 'landing_square_image';

COMMENT ON TYPE public.catalogue_image_purpose IS 'What a catalogue picture is for: ''product'', a product''s picture; ''library_cover'', a Library article''s cover; ''landing_image'', ''landing_square_image'' and ''landing_portrait_image'', a picture on a landing page, wide 16:9, square 1:1 or portrait 4:5; or ''spotlight_image'', a spotlight''s picture. Each purpose has its own storage bucket (product-images, library-covers, landing-images, landing-square-images, landing-portrait-images, spotlight-images) and its own exact stored size; both live in the application''s one purpose map, and the size is enforced by the upload routes, which measure the bytes. No size or ratio is stored beside it: the purpose is the shape.';

COMMENT ON TABLE public.catalogue_images IS 'The catalogue of pictures admins pick from for content: product pictures, Library article covers, landing page pictures (in three shapes) and spotlight pictures, each entry marked with its purpose. One row per distinct image per purpose, identified by the sha256 of its bytes; the object key is <sha256>.<ext> in the public bucket of the entry''s purpose (product-images, library-covers, landing-images, landing-square-images, landing-portrait-images or spotlight-images). A row is immutable except for its label — the bytes behind a path never change, which is what makes the image optimizer''s one-year cache floor safe. Admin-only: no anon grant and no anon policy, because nothing family-facing reads this table. Products reference it by products.image_id, Library article copies by cover_image_id, landing page copies by the image ids in their sections and spotlights by spotlights.image_id; the served products.image_path, cover_path, a landing page copy''s pictures and spotlights.image_path are derived from those links by triggers and are what every reader reads.';

-- Public like the landing-images bucket, because the public pages and the
-- image optimizer fetch these by URL. The cap and type list are the upload
-- routes' own: 4 MB, JPEG only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('landing-square-images', 'landing-square-images', true, 4194304, ARRAY['image/jpeg']),
  ('landing-portrait-images', 'landing-portrait-images', true, 4194304, ARRAY['image/jpeg']);

-- The same three admin write policies every catalogue bucket carries. The
-- routes and the MCP uploader write through the service-role client, which
-- bypasses RLS; these are what an admin's own session would be held to, so
-- the buckets answer alike.
CREATE POLICY landing_square_images_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'landing-square-images' AND public.get_user_role() = 'admin');

CREATE POLICY landing_square_images_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'landing-square-images' AND public.get_user_role() = 'admin')
  WITH CHECK (bucket_id = 'landing-square-images' AND public.get_user_role() = 'admin');

CREATE POLICY landing_square_images_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'landing-square-images' AND public.get_user_role() = 'admin');

CREATE POLICY landing_portrait_images_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'landing-portrait-images' AND public.get_user_role() = 'admin');

CREATE POLICY landing_portrait_images_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'landing-portrait-images' AND public.get_user_role() = 'admin')
  WITH CHECK (bucket_id = 'landing-portrait-images' AND public.get_user_role() = 'admin');

CREATE POLICY landing_portrait_images_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'landing-portrait-images' AND public.get_user_role() = 'admin');
