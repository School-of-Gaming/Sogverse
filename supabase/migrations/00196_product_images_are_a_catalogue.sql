-- 00196: a product's picture becomes an entry in a catalogue admins own.
--
-- WHY
--
-- `products.image_path` is a bare storage key, minted fresh per upload by the
-- two admin product routes. Pictures are therefore not entities: nothing can be
-- browsed, nothing can be reused, and nothing knows that two products show the
-- same picture. They demonstrably do — the production bucket carries 104
-- referenced objects that are only 44 distinct images by byte content, one PNG
-- stored 23 times — and every copy is its own URL, so every cache downstream
-- (browser, image optimizer, link unfurl) does the work once per copy.
--
-- WHAT CHANGES
--
--   1. `product_images` — one row per distinct picture, identified by the
--      sha256 of its bytes. Admin-only, top to bottom.
--   2. `products.image_id` — a nullable FK to it, `ON DELETE SET NULL`.
--   3. One BEFORE INSERT OR UPDATE trigger on `products` that derives
--      `image_path` from the linked entry.
--
-- This migration is deliberately released on its own, ahead of any code that
-- uses it. It is purely additive: every column that exists today keeps its
-- meaning, `image_id` is NULL on every existing row, and a product with no
-- `image_id` keeps whatever `image_path` it already carries. The running app is
-- indifferent to all of it.
--
-- ENTRIES ARE IMMUTABLE EXCEPT FOR THEIR LABEL
--
-- A row's bytes never change, so its `path` never changes, so a bucket URL's
-- bytes never change — which is the contract the one-year `minimumCacheTTL`
-- floor in `next.config.ts` has been quietly relying on and could not previously
-- guarantee. The object key is `<sha256>.<ext>`, so uploading the same file
-- twice finds the same object and the same row; that identity IS the dedup
-- mechanism, which is why `sha256` is UNIQUE and why "replace this picture"
-- will mean "repoint the products at a different entry" rather than
-- "overwrite these bytes".
--
-- WHY THE COLUMN LIST IS SO SHORT
--
-- No content type (the extension already decides it, through the same map the
-- product routes use), no byte size, no author, no `updated_at`. Nothing reads
-- them. A column added for a surface that does not exist is a column nobody
-- maintains; add one back when something asks.
--
-- `image_path` STAYS THE SERVED COLUMN, AND THE TRIGGER OWNS IT
--
-- Every surface that paints a product picture — shop cards, the detail hero,
-- og:image, transactional mail — reads `products.image_path`, and after this
-- migration every one of them still does, unchanged. Nothing family-facing ever
-- touches the catalogue table, which is also why `product_images` needs no anon
-- policy and gets none.
--
-- THE TRIGGER CARRIES NO COLUMN LIST, ON PURPOSE
--
-- `update_product` assigns `image_path = p_image_path` on every call, and it is
-- not the only statement in the system that could name that column. A
-- column-listed trigger (`... UPDATE OF image_id`) would leave those writers
-- ungoverned: a save carrying a stale path would land it. With no column list
-- the trigger runs on every products write, so for any product that HAS a
-- linked entry the assignment is simply inert — the trigger overwrites it with
-- the entry's path a moment later. That is what lets the RPCs stay untouched by
-- this change, and it means a stale deployment still writing paths directly
-- cannot make a linked product drift. The cost is one indexed single-row lookup
-- per products write, on a ~110-row table that is written a few times a week.
--
-- FIRING ORDER
--
-- Row-level triggers of the same timing fire in name order. On `products` the
-- BEFORE row triggers are `products_updated_at` (stamps `updated_at`),
-- `trg_products_apply_image_path` (this one) and `trg_validate_products_location`
-- (raises or returns NEW untouched). The new name sits between the two existing
-- ones, and neither of them reads or writes `image_path`, so nothing can clobber
-- what this trigger decided.
--
-- WHY THE TRIGGER FUNCTION IS SECURITY INVOKER
--
-- It models `validate_products_location` exactly: plain `LANGUAGE plpgsql`,
-- `SET search_path TO ''`, `REVOKE ALL … FROM PUBLIC` plus `GRANT ALL … TO
-- service_role`. Running as the invoker means the lookup on `product_images` is
-- subject to that table's admin-only RLS, so it is worth naming who actually
-- writes `products`, because every one of them can see the row:
--
--   * `update_product` is SECURITY DEFINER owned by `postgres`, which holds
--     BYPASSRLS.
--   * `create_product` is SECURITY INVOKER, so it runs as the signed-in admin —
--     and the admin policy on `product_images` admits them.
--   * The admin routes' own statements run on the admin's session client, same
--     as above.
--   * The service-role client (the cleanup script, the DB suite) holds
--     BYPASSRLS.
--   * Nobody else can write `products` at all: the only non-admin policy on it
--     is SELECT.
--
--   * The referential `SET NULL` from a deleted entry takes the unlink branch,
--     which reads nothing.
--
-- So SECURITY DEFINER would buy no reachability and would add a
-- privilege-escalation surface for nothing. The one failure mode invoker
-- rights could introduce — a writer who cannot see the entry, silently
-- getting a NULL path — is closed by raising instead: the FK already
-- guarantees the row exists, so a lookup that comes back empty can only mean
-- RLS hid it, and that must be loud rather than a quietly blanked picture.
--
-- NOTE ON TRIGGER-FUNCTION GRANTS: PostgreSQL checks EXECUTE on a trigger
-- function when the trigger is CREATED, not when it fires, so the
-- service-role-only grant does not stop an admin's own statement from firing
-- it. The grant is there to keep the function off every other surface, which is
-- what the `REVOKE … FROM PUBLIC` on a freshly created function is always for.

CREATE TABLE public.product_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label      text NOT NULL,
  sha256     text NOT NULL UNIQUE,
  path       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_product_images_label_length CHECK (length(label) BETWEEN 1 AND 120),
  CONSTRAINT chk_product_images_path_not_empty CHECK (path <> '')
);

COMMENT ON TABLE public.product_images IS
  'The catalogue of pictures admins pick from for a product. One row per '
  'distinct image, identified by the sha256 of its bytes; the object key is '
  '<sha256>.<ext> in the public product-images bucket. A row is immutable '
  'except for its label — the bytes behind a path never change, which is what '
  'makes the image optimizer''s one-year cache floor safe. Admin-only: no anon '
  'grant and no anon policy, because nothing family-facing reads this table. '
  'Products reference it by products.image_id; products.image_path is derived '
  'from it by trg_products_apply_image_path and is what every reader still '
  'reads.';

COMMENT ON COLUMN public.product_images.sha256 IS
  'Lowercase hex sha256 of the stored bytes. UNIQUE, and that uniqueness IS '
  'the dedup mechanism: uploading the same file twice resolves to this row.';

COMMENT ON COLUMN public.product_images.path IS
  'Object key in the public product-images bucket, <sha256>.<ext>. Never '
  'changes for a given row, and no object is ever overwritten.';

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- One policy, both directions, admins only. `is_admin()` is executable by
-- `authenticated` and not by `anon`, which is exactly the shape this needs:
-- anon never reads this table, so it gets no grant and no policy. The
-- `(SELECT …)` wrapper is the standing form here — it makes the call an
-- InitPlan evaluated once per statement rather than once per row.
CREATE POLICY admin_full_access_product_images ON public.product_images
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- The grants that make the commands reachable; the policy above is what
-- authorizes them. Admins write this table from their own session client (the
-- same arrangement `products` itself has), so `authenticated` needs the full
-- set. Nothing for `anon`.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_images TO service_role;

-- `ON DELETE SET NULL` is the removal semantics: deleting a catalogue entry
-- unlinks every product that used it, and the trigger below turns each of those
-- referential updates into a blanked `image_path`.
ALTER TABLE public.products
  ADD COLUMN image_id uuid REFERENCES public.product_images(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.image_id IS
  'The catalogue entry this product shows, or NULL for no picture. Anon-readable '
  'like the rest of products (it is a UUID and reveals nothing), but only admins '
  'can resolve it against product_images. Writing it is what changes a '
  'product''s picture — image_path is derived and must not be written directly.';

COMMENT ON COLUMN public.products.image_path IS
  'The object key every reader paints. DERIVED: whenever image_id is set, '
  'trg_products_apply_image_path overwrites this with the linked entry''s path '
  'on every write, so an app-supplied value is inert for a linked product. Rows '
  'with a NULL image_id keep whatever path they carry — the pre-catalogue state, '
  'which the cleanup script folds in between this release and the feature''s.';

-- Serves the one statement replace runs (`UPDATE products SET image_id = :new
-- WHERE image_id = :old`) and the per-entry usage read behind the catalogue
-- dialog. Not partial: `image_id IS NULL` is a question the cleanup script asks.
CREATE INDEX idx_products_image_id ON public.products (image_id);

CREATE FUNCTION public.apply_product_image_path()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $$
DECLARE
  v_path text;
BEGIN
  IF NEW.image_id IS NOT NULL THEN
    SELECT path INTO v_path
      FROM public.product_images
     WHERE id = NEW.image_id;

    -- The FK guarantees the row exists, so an empty lookup can only mean the
    -- writer could not see it through RLS. Blanking the picture silently would
    -- be the worst possible answer to that; raise instead. Same SQLSTATE the
    -- FK itself would use, because it is the same claim.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'product_images row % is not visible to this writer', NEW.image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.image_path := v_path;

  -- An unlink: image_id went from something to nothing, so the picture goes
  -- with it. Guarded on TG_OP because OLD does not exist on INSERT — and an
  -- INSERT with no image_id is a product with no picture yet, not an unlink.
  ELSIF TG_OP = 'UPDATE' AND OLD.image_id IS NOT NULL THEN
    NEW.image_path := NULL;
  END IF;

  -- Everything else — a product that never had an entry — keeps whatever
  -- image_path it was given. That is the legacy state, and this trigger is not
  -- what ends it; the cleanup script is.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_product_image_path() IS
  'BEFORE INSERT OR UPDATE on products: derives image_path from the linked '
  'product_images entry, blanks it on an unlink, and leaves it alone for a '
  'product with no entry. Carries no column list on the trigger deliberately, '
  'so that every writer of image_path — including update_product''s own '
  'p_image_path assignment — is inert for a linked product.';

REVOKE ALL ON FUNCTION public.apply_product_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_product_image_path() TO service_role;

CREATE TRIGGER trg_products_apply_image_path
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.apply_product_image_path();

-- Assert the end state rather than trusting that the statements above took the
-- branch they look like they took. Apply-time protection: it says what was true
-- when 00196 ran, and nothing about later migrations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'product_images'
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'product_images is missing or has RLS disabled';
  END IF;

  -- Exactly one policy: a second one arriving unnoticed is how an admin-only
  -- table quietly becomes readable by somebody else.
  IF (
    SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'product_images'
  ) <> 1 THEN
    RAISE EXCEPTION 'product_images should carry exactly one policy';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.product_images', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.product_images', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.product_images', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.product_images', 'DELETE')
  THEN
    RAISE EXCEPTION 'authenticated is missing a grant on product_images — the admin UI writes this table on its own session client';
  END IF;

  IF has_table_privilege('anon', 'public.product_images', 'SELECT')
     OR has_table_privilege('anon', 'public.product_images', 'INSERT')
     OR has_table_privilege('anon', 'public.product_images', 'UPDATE')
     OR has_table_privilege('anon', 'public.product_images', 'DELETE')
  THEN
    RAISE EXCEPTION 'anon holds a grant on product_images — nothing family-facing reads this table';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.product_images', 'SELECT') THEN
    RAISE EXCEPTION 'service_role cannot read product_images — the DB tests assert against it through the admin client';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'products'
       AND column_name = 'image_id'
  ) THEN
    RAISE EXCEPTION 'products.image_id is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.products'::regclass
       AND contype = 'f'
       AND confrelid = 'public.product_images'::regclass
       AND confdeltype = 'n'  -- SET NULL
  ) THEN
    RAISE EXCEPTION 'products.image_id has no ON DELETE SET NULL foreign key to product_images';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'products'
       AND indexname = 'idx_products_image_id'
  ) THEN
    RAISE EXCEPTION 'idx_products_image_id is missing — the replace repoint would seq-scan';
  END IF;

  -- The whole design rests on this trigger having NO column list: with one,
  -- update_product's p_image_path assignment becomes an ungoverned writer.
  -- tgattr is the column list; it must be empty.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.products'::regclass
       AND tgname = 'trg_products_apply_image_path'
       AND NOT tgisinternal
       AND COALESCE(array_length(tgattr::int2[], 1), 0) = 0
  ) THEN
    RAISE EXCEPTION 'trg_products_apply_image_path is missing or carries a column list';
  END IF;

  IF has_function_privilege('authenticated', 'public.apply_product_image_path()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_product_image_path()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'apply_product_image_path is executable by a Data API role — the REVOKE FROM PUBLIC did not take';
  END IF;
END;
$$;
