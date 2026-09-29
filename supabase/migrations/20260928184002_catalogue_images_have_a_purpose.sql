-- Catalogue images have a purpose.
--
-- A catalogue entry is picked for one kind of content: a product's picture or
-- a Library article's cover, with more kinds possible later. That is its
-- purpose, recorded when the entry is created and never changed. Each purpose
-- has its own storage bucket and its own exact stored size; the application
-- holds that map, and the upload routes enforce the size.
--
-- WHAT THIS CHANGES
--
-- 1. `catalogue_image_purpose`, an enum: 'product' and 'library_cover'.
-- 2. `catalogue_images.purpose`, NOT NULL with no default, so every writer says
--    what it is adding. Every existing entry is a product picture and is
--    backfilled to 'product'.
-- 3. Dedup is per purpose. The sha256 and path UNIQUE constraints become
--    UNIQUE (purpose, sha256) and UNIQUE (purpose, path): the same bytes
--    uploaded for two purposes are two objects in two buckets, so they are two
--    rows, and within one purpose the same bytes still resolve to one row.
-- 4. The `path` CHECK no longer admits `.svg`. No row anywhere uses it, and
--    uploads are JPEG only now; the other stored extensions stay, because
--    entries uploaded before that are still png, webp or avif.
-- 5. `apply_product_image_path()` refuses to link a product to an entry whose
--    purpose is not 'product', with SQLSTATE 23514.
-- 6. `refuse_catalogue_image_purpose_change()`, a BEFORE UPDATE trigger on
--    `catalogue_images`, refuses (23514) any update that changes `purpose`. A
--    label edit, the one change the admin UI makes, passes through.
-- 7. The `library-covers` storage bucket: public, capped at the upload routes'
--    4 MB and JPEG only, with the same three admin write policies on
--    storage.objects that `product-images` carries. Like `product-images`, its
--    only writers today are the service-role routes, which bypass RLS; the
--    policies are what an admin's own session would be held to.
--
-- WHY THE TABLE STORES NO ASPECT RATIO, WIDTH OR HEIGHT
--
-- The purpose decides everything about an entry — which bucket holds it, which
-- crop the upload was cut to, and what may link it — and a ratio is only one
-- consequence of it. If the shop's crop changes, product pictures are still
-- product pictures: the size lives in the application beside the bucket and
-- moves in one place, and no row has to be rewritten. The size is enforced by
-- the upload routes, which measure the bytes; the database never sees the
-- bytes, so a stored size could only repeat what a caller claimed.

CREATE TYPE public.catalogue_image_purpose AS ENUM ('product', 'library_cover');

COMMENT ON TYPE public.catalogue_image_purpose IS 'What a catalogue picture is for: ''product'', a product''s picture, or ''library_cover'', a Library article''s cover. Each purpose has its own storage bucket (product-images, library-covers) and its own exact stored size; both live in the application''s one purpose map, and the size is enforced by the upload routes, which measure the bytes. No aspect ratio is stored: a purpose outlives any one crop.';

ALTER TABLE public.catalogue_images
  ADD COLUMN purpose public.catalogue_image_purpose NOT NULL DEFAULT 'product';

-- The default existed only to backfill the rows already here, all of which
-- are product pictures. A new entry states its purpose.
ALTER TABLE public.catalogue_images
  ALTER COLUMN purpose DROP DEFAULT;

COMMENT ON COLUMN public.catalogue_images.purpose IS 'What this picture is for, which decides the bucket its object lives in and the exact size it was cropped to. Set once, when the entry is created, and never changed: a replace creates an entry of the same purpose. A product may link only a ''product'' entry (apply_product_image_path refuses anything else), and a Library cover only a ''library_cover'' one (apply_library_cover_path). An UPDATE changing it is refused by trg_catalogue_images_purpose_is_fixed.';

ALTER TABLE public.catalogue_images
  DROP CONSTRAINT catalogue_images_sha256_key;
ALTER TABLE public.catalogue_images
  DROP CONSTRAINT catalogue_images_path_key;

ALTER TABLE public.catalogue_images
  ADD CONSTRAINT catalogue_images_purpose_sha256_key UNIQUE (purpose, sha256);
ALTER TABLE public.catalogue_images
  ADD CONSTRAINT catalogue_images_purpose_path_key UNIQUE (purpose, path);

COMMENT ON TABLE public.catalogue_images IS 'The catalogue of pictures admins pick from for content: product pictures and Library article covers, each entry marked with its purpose. One row per distinct image per purpose, identified by the sha256 of its bytes; the object key is <sha256>.<ext> in the public bucket of the entry''s purpose (product-images or library-covers). A row is immutable except for its label — the bytes behind a path never change, which is what makes the image optimizer''s one-year cache floor safe. Admin-only: no anon grant and no anon policy, because nothing family-facing reads this table. Products reference it by products.image_id and Library article copies by cover_image_id; the served products.image_path and cover_path are derived from those links by triggers and are what every reader reads.';

COMMENT ON COLUMN public.catalogue_images.sha256 IS 'Lowercase hex sha256 of the stored bytes. UNIQUE within a purpose, and that uniqueness IS the dedup mechanism: uploading the same file twice for one purpose resolves to this row. The same bytes uploaded for another purpose are another object in another bucket, and another row.';

COMMENT ON COLUMN public.catalogue_images.path IS 'Object key in the public bucket of this entry''s purpose, <sha256>.<ext>. Never changes for a given row, and no object is ever overwritten. UNIQUE within a purpose, because each purpose''s bucket is its own namespace.';

ALTER TABLE public.catalogue_images
  DROP CONSTRAINT chk_catalogue_images_path_matches_sha256;

ALTER TABLE public.catalogue_images
  ADD CONSTRAINT chk_catalogue_images_path_matches_sha256
  CHECK (path ~ ('^' || sha256 || '\.(jpg|png|webp|avif)$'));

COMMENT ON CONSTRAINT chk_catalogue_images_path_matches_sha256 ON public.catalogue_images IS 'The object key is the hash plus a stored extension and nothing else. Uploads are JPEG only (the accept list in src/services/catalogue-images/catalogue-images.contracts.ts, where jpeg is normalised to jpg before anything is stored), so jpg is the only extension a new row gets; png, webp and avif stay admitted for entries uploaded before that. Widening the accept list means widening this list in the same change, or an upload the route accepts is a row this constraint refuses after the bytes are already in the bucket. The pattern is built by concatenating the sha256 column into a regex, which is only safe because chk_catalogue_images_sha256_is_a_hash guarantees that column holds no regex metacharacters — relax that constraint and this one silently becomes a wildcard.';

CREATE OR REPLACE FUNCTION public.apply_product_image_path() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_path    text;
  v_purpose public.catalogue_image_purpose;
BEGIN
  IF NEW.image_id IS NOT NULL THEN
    SELECT path, purpose INTO v_path, v_purpose
      FROM public.catalogue_images
     WHERE id = NEW.image_id;

    -- This runs BEFORE the FK — which is an AFTER-row constraint trigger fired
    -- at statement end — so it pre-empts the FK's own check rather than relying
    -- on it. The reachable cause of an empty lookup is that the row is gone
    -- (another admin removed the entry between this admin loading the form and
    -- saving it); RLS hiding it is the other half of the message, and a half
    -- that is not reachable in practice. Blanking the picture silently would
    -- be the worst possible answer to either; raise instead, with the SQLSTATE
    -- the FK itself would have used, because it is the same claim made earlier.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'catalogue_images row % does not exist or is not visible to this writer', NEW.image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- An entry of another purpose lives in another bucket and was cropped for
    -- another frame, so a product showing it would paint a path its readers
    -- resolve against the wrong bucket. The admin picker offers only product
    -- entries; this is the schema refusing loudly the state that picker
    -- cannot produce.
    IF v_purpose <> 'product' THEN
      RAISE EXCEPTION 'catalogue_images row % is a % picture; a product can only show a product picture', NEW.image_id, v_purpose
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.image_path := v_path;
  ELSE
    -- No entry, no picture — on UPDATE and INSERT alike, and whatever the
    -- statement said about image_path. No branch preserves an app-supplied
    -- path, so this one has exactly one meaning: a product with no entry has
    -- no picture. With no column list on the trigger, this function is the
    -- only writer of image_path — which is why no foreign key on that column
    -- is needed, and why one must not be added (see the function comment).
    NEW.image_path := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_product_image_path() IS 'BEFORE INSERT OR UPDATE on products: image_path is derived from the linked catalogue_images entry, and is NULL whenever image_id is. No branch preserves an app-supplied path, so this function is the column''s ONLY writer — which is what carries the invariant that a served path is a catalogue path, and why there is deliberately no foreign key on image_path (a second relationship between products and catalogue_images makes every PostgREST embed ambiguous). Refuses (23514) an entry whose purpose is not ''product'': its object lives in another bucket. Carries no column list on the trigger deliberately, so no statement can name image_path and win.';

REVOKE ALL ON FUNCTION public.apply_product_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_product_image_path() TO service_role;

-- The purpose is fixed once an entry exists: its object sits in that purpose's
-- bucket, and every product or article linking it was checked against the
-- purpose when it linked. Admins hold UPDATE on the table for the label, and
-- the admin UI changes nothing else, so this refuses loudly the state that UI
-- cannot produce.
CREATE FUNCTION public.refuse_catalogue_image_purpose_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.purpose IS DISTINCT FROM OLD.purpose THEN
    RAISE EXCEPTION 'catalogue_images row % is a % picture, and an entry''s purpose never changes', OLD.id, OLD.purpose
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.refuse_catalogue_image_purpose_change() IS 'BEFORE UPDATE on catalogue_images: refuses (23514) any update that changes purpose. The entry''s object lives in its purpose''s bucket, and every product and Library cover linking it was checked against its purpose when it linked, so a changed purpose would leave the row naming the wrong bucket and its links holding a picture they may not show. The label, the only column the admin UI edits, is unaffected.';

REVOKE EXECUTE ON FUNCTION public.refuse_catalogue_image_purpose_change() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refuse_catalogue_image_purpose_change() TO service_role;

CREATE TRIGGER trg_catalogue_images_purpose_is_fixed
  BEFORE UPDATE ON public.catalogue_images
  FOR EACH ROW EXECUTE FUNCTION public.refuse_catalogue_image_purpose_change();

-- The Library's covers get their own bucket, public like product-images
-- because the public Library paints them. The cap and type list are the upload
-- routes' own: 4 MB, JPEG only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('library-covers', 'library-covers', true, 4194304, ARRAY['image/jpeg']);

-- The same three admin write policies product-images carries. The routes write
-- through the service-role client, which bypasses RLS; these are what an
-- admin's own session would be held to, so the two buckets answer alike.
CREATE POLICY library_covers_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'library-covers' AND public.get_user_role() = 'admin');

CREATE POLICY library_covers_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'library-covers' AND public.get_user_role() = 'admin')
  WITH CHECK (bucket_id = 'library-covers' AND public.get_user_role() = 'admin');

CREATE POLICY library_covers_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'library-covers' AND public.get_user_role() = 'admin');
