-- Landing pages take their pictures from the image catalogue.
--
-- A landing page's hero, text and image sections show pictures, and like a
-- product picture or a Library cover each one is an entry of the shared
-- catalogue, of a purpose of its own: 'landing_image'. The purpose has its own
-- public bucket, `landing-images`, and its own exact stored size, held in the
-- application's purpose map beside the other two.
--
-- This file only adds the purpose and the bucket. An enum value cannot be used
-- in the transaction that adds it, so everything that links an entry of this
-- purpose — the landing page tables and their triggers — comes in the next
-- migration.

ALTER TYPE public.catalogue_image_purpose ADD VALUE 'landing_image';

COMMENT ON TYPE public.catalogue_image_purpose IS 'What a catalogue picture is for: ''product'', a product''s picture; ''library_cover'', a Library article''s cover; or ''landing_image'', a picture on a landing page. Each purpose has its own storage bucket (product-images, library-covers, landing-images) and its own exact stored size; both live in the application''s one purpose map, and the size is enforced by the upload routes, which measure the bytes. No aspect ratio is stored: a purpose outlives any one crop.';

COMMENT ON TABLE public.catalogue_images IS 'The catalogue of pictures admins pick from for content: product pictures, Library article covers and landing page pictures, each entry marked with its purpose. One row per distinct image per purpose, identified by the sha256 of its bytes; the object key is <sha256>.<ext> in the public bucket of the entry''s purpose (product-images, library-covers or landing-images). A row is immutable except for its label — the bytes behind a path never change, which is what makes the image optimizer''s one-year cache floor safe. Admin-only: no anon grant and no anon policy, because nothing family-facing reads this table. Products reference it by products.image_id, Library article copies by cover_image_id, and landing page copies by the image ids in their sections; the served products.image_path, cover_path and image_paths are derived from those links by triggers and are what every reader reads.';

COMMENT ON COLUMN public.catalogue_images.purpose IS 'What this picture is for, which decides the bucket its object lives in and the exact size it was cropped to. Set once, when the entry is created, and never changed: a replace creates an entry of the same purpose. A product may link only a ''product'' entry (apply_product_image_path refuses anything else), a Library cover only a ''library_cover'' one (apply_library_cover_path), and a landing page only ''landing_image'' ones (apply_landing_image_paths). An UPDATE changing it is refused by trg_catalogue_images_purpose_is_fixed.';

-- Public like the other two, because the public landing pages paint these.
-- The cap and type list are the upload routes' own: 4 MB, JPEG only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('landing-images', 'landing-images', true, 4194304, ARRAY['image/jpeg']);

-- The same three admin write policies the other two buckets carry. The routes
-- write through the service-role client, which bypasses RLS; these are what an
-- admin's own session would be held to, so the three buckets answer alike.
CREATE POLICY landing_images_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'landing-images' AND public.get_user_role() = 'admin');

CREATE POLICY landing_images_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'landing-images' AND public.get_user_role() = 'admin')
  WITH CHECK (bucket_id = 'landing-images' AND public.get_user_role() = 'admin');

CREATE POLICY landing_images_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'landing-images' AND public.get_user_role() = 'admin');
