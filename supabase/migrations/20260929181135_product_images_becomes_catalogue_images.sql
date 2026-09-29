-- product_images becomes catalogue_images.
--
-- The table is the catalogue admins pick pictures from for content. Today that
-- is product pictures, and the Library's article covers are joining it; more
-- kinds may follow. "product" names only one of them, so the table, and every
-- name of its own that said product_images, now says catalogue_images.
--
-- WHAT THIS CHANGES
--
-- 1. The table: public.product_images -> public.catalogue_images. Its grants,
--    RLS and rows move with it, and the foreign key from products.image_id
--    follows the table by itself.
-- 2. The table's own names: its four CHECK constraints, its primary key and
--    two unique constraints (each renaming its index with it), and its admin
--    policy.
-- 3. apply_product_image_path() is replaced, because a function body is text
--    and does not follow a table rename: it reads the table by name. It keeps
--    its name, since it derives a product's picture, and its grants stand.
-- 4. Every comment that named product_images says catalogue_images.
--
-- WHAT THIS KEEPS
--
-- The storage bucket is still `product-images`, with its product_images_admin_*
-- storage.objects policies, and that name stays accurate: the bucket holds
-- product pictures, and each other kind of catalogue picture gets a bucket of
-- its own.

ALTER TABLE public.product_images RENAME TO catalogue_images;

ALTER TABLE public.catalogue_images
  RENAME CONSTRAINT chk_product_images_label_length TO chk_catalogue_images_label_length;
ALTER TABLE public.catalogue_images
  RENAME CONSTRAINT chk_product_images_path_matches_sha256 TO chk_catalogue_images_path_matches_sha256;
ALTER TABLE public.catalogue_images
  RENAME CONSTRAINT chk_product_images_path_not_empty TO chk_catalogue_images_path_not_empty;
ALTER TABLE public.catalogue_images
  RENAME CONSTRAINT chk_product_images_sha256_is_a_hash TO chk_catalogue_images_sha256_is_a_hash;
ALTER TABLE public.catalogue_images
  RENAME CONSTRAINT product_images_pkey TO catalogue_images_pkey;
ALTER TABLE public.catalogue_images
  RENAME CONSTRAINT product_images_path_key TO catalogue_images_path_key;
ALTER TABLE public.catalogue_images
  RENAME CONSTRAINT product_images_sha256_key TO catalogue_images_sha256_key;

ALTER POLICY admin_full_access_product_images ON public.catalogue_images
  RENAME TO admin_full_access_catalogue_images;

COMMENT ON TABLE public.catalogue_images IS 'The catalogue of pictures admins pick from for content. One row per distinct image, identified by the sha256 of its bytes; the object key is <sha256>.<ext> in the public product-images bucket. A row is immutable except for its label — the bytes behind a path never change, which is what makes the image optimizer''s one-year cache floor safe. Admin-only: no anon grant and no anon policy, because nothing family-facing reads this table. Products reference it by products.image_id; products.image_path is derived from it by trg_products_apply_image_path and is what every reader reads.';

COMMENT ON CONSTRAINT chk_catalogue_images_path_matches_sha256 ON public.catalogue_images IS 'The object key is the hash plus a stored extension and nothing else. The extension list is the accept list in src/services/catalogue-images/catalogue-images.contracts.ts minus jpeg, which is accepted on upload and normalised to jpg before anything is stored — the two lists must be widened in the same change or an upload the route accepts is a row this constraint refuses after the bytes are already in the bucket. The pattern is built by concatenating the sha256 column into a regex, which is only safe because chk_catalogue_images_sha256_is_a_hash guarantees that column holds no regex metacharacters — relax that constraint and this one silently becomes a wildcard.';

CREATE OR REPLACE FUNCTION public.apply_product_image_path() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_path text;
BEGIN
  IF NEW.image_id IS NOT NULL THEN
    SELECT path INTO v_path
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

COMMENT ON FUNCTION public.apply_product_image_path() IS 'BEFORE INSERT OR UPDATE on products: image_path is derived from the linked catalogue_images entry, and is NULL whenever image_id is. No branch preserves an app-supplied path, so this function is the column''s ONLY writer — which is what carries the invariant that a served path is a catalogue path, and why there is deliberately no foreign key on image_path (a second relationship between products and catalogue_images makes every PostgREST embed ambiguous). Carries no column list on the trigger deliberately, so no statement can name image_path and win.';

REVOKE ALL ON FUNCTION public.apply_product_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_product_image_path() TO service_role;

COMMENT ON COLUMN public.products.image_path IS 'The object key every reader paints. DERIVED, with no exceptions: trg_products_apply_image_path writes the linked entry''s path on every products write and NULLs the column whenever image_id is NULL, so an app-supplied value is always inert and this column has exactly one writer. It deliberately carries NO foreign key into catalogue_images(path): a second relationship between these two tables makes every PostgREST embed of catalogue_images ambiguous (PGRST201) unless every caller hints it, and the trigger already guarantees what such a key would check.';

COMMENT ON COLUMN public.products.image_id IS 'The catalogue entry this product shows, or NULL for no picture. Anon-readable like the rest of products (it is a UUID and reveals nothing), but only admins can resolve it against catalogue_images. Writing it is what changes a product''s picture — image_path is derived and must not be written directly.';

COMMENT ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, the staff-only material link and the consent documents enrolling on it requires. It takes NO status: a product''s lifecycle is derived from its dates, so there is nothing for a creating caller to choose and nothing stored for a later reader to mistake for a fact. p_start_date is defaulted like every other optional argument, but the column behind it is NOT NULL — an omitting caller is refused by the column rather than creating a product with no day it begins. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. p_required_consent_slugs is defaulted on the same argument and is NOT written inline: this function is SECURITY INVOKER and product_required_consents carries no write grant, so the row goes through set_product_required_consents, the join table''s single guarded writer. p_requires_gamer_creations is defaulted to FALSE rather than to null, because the column is NOT NULL and false is the resting state of that whole feature — so an omitting caller creates an unflagged product, which is what omission should mean, and an explicit null is refused loudly by the column rather than silently becoming false. p_invoice_customer_id is defaulted on the same argument as p_tag — null is legal, nothing backstops its absence, and codegen cannot express an explicit null — and names the FENNOA CUSTOMER a municipality club is invoiced to; it is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type. This function does NOT take a picture: a product''s picture is the catalogue_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. p_spoken_language_code is public.spoken_language, an enum rather than a text key into a reference table.';
