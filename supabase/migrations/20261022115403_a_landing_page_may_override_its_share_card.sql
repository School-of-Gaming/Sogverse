-- A landing page may override its share card.
--
-- WHAT THIS ADDS
--
-- A page's link preview (its Open Graph and Twitter card) is derived from the
-- page: the shown version's title and summary, and the hero's picture. An
-- admin may now override, per language, while writing that language:
--
-- * A SHARE PICTURE — a landing_image catalogue entry referenced by id, in
--   share_image_id on both copies' versions. Per language because a share
--   picture often carries words of its own, which are written per language
--   like every other word on the page.
-- * A SHARE TITLE and the share picture's ALT TEXT — in share_title and
--   share_image_alt beside it.
--
-- All three are written by the version writers beside the title and summary.
-- All three are optional: absent, the card is derived as before, and none of
-- them counts toward a version's completeness. The description stays the
-- summary, so there is nothing to override for it.
--
-- THE CATALOGUE'S GUARANTEES
--
-- A copy's image_paths names every catalogue entry the copy shows, and the
-- catalogue's usage map, replace and removal all find a copy by it. A share
-- picture lives on a version row while image_paths lives on the copy's row,
-- so the copy's paths are derived from its sections and from every one of
-- its versions' share pictures:
--
-- * apply_landing_image_paths reads the copy's versions too, so the copy
--   carries each share picture's path and an entry that is gone (23503) or of
--   another purpose (23514) is refused.
-- * refresh_landing_image_paths re-derives the copy's paths whenever a
--   version's share picture is written, changed or removed with its version,
--   so a picture only one language names counts as in use, and stops
--   counting when that language goes.
-- * repoint_landing_images and unlink_removed_landing_image move or unset it
--   on the versions of both copies.
-- * The catalogue's usage map reads image_paths, so it knows about it with no
--   change of its own.
--
-- Publishing copies all three with each version, and so does a clone; the
-- unpublished-changes comparison (in the application) reads them.
--
-- ACCESS
--
-- One new function, a trigger function granted to no Data API role. The
-- writers are the existing admin-gated ones; the two version writers are
-- dropped and recreated with the new arguments, and every grant they carried
-- is issued again.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

-- The cap is a share card's, not a page title's: Facebook, LinkedIn and X cut
-- a card's title at about 60–70 characters, so a longer one is truncated
-- mid-word in the feed it was written for.
ALTER TABLE public.landing_page_translations
  ADD COLUMN share_title text DEFAULT ''::text NOT NULL,
  ADD COLUMN share_image_id uuid,
  ADD COLUMN share_image_alt text DEFAULT ''::text NOT NULL,
  ADD CONSTRAINT chk_landing_page_translations_share_title_length
    CHECK (char_length(share_title) <= 70);

ALTER TABLE public.landing_page_publication_translations
  ADD COLUMN share_title text DEFAULT ''::text NOT NULL,
  ADD COLUMN share_image_id uuid,
  ADD COLUMN share_image_alt text DEFAULT ''::text NOT NULL;

COMMENT ON COLUMN public.landing_page_translations.share_title IS 'The link preview''s title in this language, in place of the page title, or the empty string to use the page title. At most 70 characters, a share card''s length. Optional: completeness never reads it.';

COMMENT ON COLUMN public.landing_page_translations.share_image_id IS 'The share picture in this language: a landing_image catalogue entry the link preview shows in place of the hero''s picture, or NULL to use the hero''s. No foreign key, as for the pictures in sections: the copy''s image_paths names it (apply_landing_image_paths, kept current by refresh_landing_image_paths), which refuses an entry that is gone or of another purpose, and the catalogue''s replace moves it and its removal unsets it.';

COMMENT ON COLUMN public.landing_page_translations.share_image_alt IS 'The share picture''s alt text in this language, or the empty string while unwritten, when the preview falls back to the card''s title. Optional: completeness never reads it.';

COMMENT ON COLUMN public.landing_page_publication_translations.share_title IS 'The live link preview''s title in this language, copied by publishing; the empty string uses the title.';

COMMENT ON COLUMN public.landing_page_publication_translations.share_image_id IS 'The live share picture in this language, copied by publishing, or NULL to use the hero''s. The catalogue''s replace and removal change it without a republish, as they do the pictures in sections.';

COMMENT ON COLUMN public.landing_page_publication_translations.share_image_alt IS 'The live share picture''s alt text in this language, copied by publishing; the empty string while unwritten.';

COMMENT ON COLUMN public.landing_pages.image_paths IS 'Each catalogue entry the sections and every version''s share picture show, as {entry id: object name in the landing-images bucket}, derived by apply_landing_image_paths and never written by anything else.';

COMMENT ON COLUMN public.landing_page_publications.image_paths IS 'Each catalogue entry the live sections and every live version''s share picture show, as {entry id: object name in the landing-images bucket}, derived by apply_landing_image_paths — what the public pages paint, readable without reading the admin-only catalogue.';

COMMENT ON TABLE public.catalogue_images IS 'The catalogue of pictures admins pick from for content: product pictures, Library article covers, landing page pictures and spotlight pictures, each entry marked with its purpose. One row per distinct image per purpose, identified by the sha256 of its bytes; the object key is <sha256>.<ext> in the public bucket of the entry''s purpose (product-images, library-covers, landing-images or spotlight-images). A row is immutable except for its label — the bytes behind a path never change, which is what makes the image optimizer''s one-year cache floor safe. Admin-only: no anon grant and no anon policy, because nothing family-facing reads this table. Products reference it by products.image_id, Library article copies by cover_image_id, landing page copies by the image ids in their sections and their versions'' share_image_id, and spotlights by spotlights.image_id; the served products.image_path, cover_path, image_paths and spotlights.image_path are derived from those links by triggers and are what every reader reads.';

-- ---------------------------------------------------------------------------
-- 2. The catalogue's guarantees reach the share pictures
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_landing_image_paths() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_ref     text;
  v_path    text;
  v_purpose public.catalogue_image_purpose;
  v_paths   jsonb := '{}'::jsonb;
  v_sections jsonb := CASE WHEN jsonb_typeof(NEW.sections) = 'array' THEN NEW.sections ELSE '[]'::jsonb END;
  v_shares  uuid[];
BEGIN
  -- The copy's versions' share pictures: the working versions for the working
  -- copy, the live ones for the published copy.
  IF TG_TABLE_NAME = 'landing_pages' THEN
    SELECT array_agg(share_image_id) INTO v_shares
      FROM public.landing_page_translations
     WHERE page_id = NEW.id AND share_image_id IS NOT NULL;
  ELSE
    SELECT array_agg(share_image_id) INTO v_shares
      FROM public.landing_page_publication_translations
     WHERE page_id = NEW.page_id AND share_image_id IS NOT NULL;
  END IF;

  FOR v_ref IN
    SELECT DISTINCT r.ref FROM (
      SELECT s.e->>'imageId' AS ref
        FROM jsonb_array_elements(v_sections) AS s(e)
       WHERE jsonb_typeof(s.e->'imageId') = 'string'
      UNION ALL
      SELECT i.e->>'imageId'
        FROM jsonb_array_elements(v_sections) AS s(e),
             jsonb_array_elements(
               CASE WHEN jsonb_typeof(s.e->'images') = 'array' THEN s.e->'images' ELSE '[]'::jsonb END
             ) AS i(e)
       WHERE jsonb_typeof(i.e->'imageId') = 'string'
      UNION ALL
      SELECT u.id::text
        FROM unnest(COALESCE(v_shares, '{}'::uuid[])) AS u(id)
    ) AS r
  LOOP
    v_path := NULL;
    IF v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT path, purpose INTO v_path, v_purpose
        FROM public.catalogue_images
       WHERE id = v_ref::uuid;
    END IF;

    -- The reachable cause is an entry another admin removed after this one
    -- was chosen; saving without the picture would be the worst answer.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'That picture is no longer in the catalogue (catalogue_images row %)', v_ref
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- An entry of another purpose lives in another bucket, cut for another
    -- frame. The picker offers only landing pictures; this refuses loudly
    -- the state it cannot produce.
    IF v_purpose <> 'landing_image' THEN
      RAISE EXCEPTION 'That picture is a % picture, and a landing page shows only landing_image ones (catalogue_images row %)', v_purpose, v_ref
        USING ERRCODE = 'check_violation';
    END IF;

    v_paths := v_paths || jsonb_build_object(v_ref, v_path);
  END LOOP;

  NEW.image_paths := v_paths;
  RETURN NEW;
END;
$_$;

COMMENT ON FUNCTION public.apply_landing_image_paths() IS 'BEFORE INSERT OR UPDATE on landing_pages and landing_page_publications: image_paths is derived from every catalogue entry the copy names (a section''s imageId, an image section''s images[].imageId, and the share_image_id of each of the copy''s versions), as {entry id: path}. No branch keeps a statement-supplied value and the triggers carry no column list, so this is the column''s only writer; refresh_landing_image_paths re-runs it when a version''s share picture changes. Refuses an entry that is gone (23503) or whose purpose is not landing_image (23514).';

-- A share picture is written on a version row, and the copy's row carries the
-- paths, so a write that adds, changes or removes one re-derives the copy's.
-- The UPDATE names no column any other trigger on the copy listens to, so it
-- moves neither the last-saved time nor the saver, and cascades nothing.
CREATE FUNCTION public.refresh_landing_image_paths() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_page uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.share_image_id IS NULL THEN RETURN NULL; END IF;
    v_page := NEW.page_id;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.share_image_id IS NULL THEN RETURN NULL; END IF;
    v_page := OLD.page_id;
  ELSE
    IF NEW.share_image_id IS NOT DISTINCT FROM OLD.share_image_id THEN RETURN NULL; END IF;
    v_page := NEW.page_id;
  END IF;

  -- A version removed with its copy (an unpublish's cascade) finds no row.
  IF TG_TABLE_NAME = 'landing_page_translations' THEN
    UPDATE public.landing_pages SET image_paths = image_paths WHERE id = v_page;
  ELSE
    UPDATE public.landing_page_publications SET image_paths = image_paths WHERE page_id = v_page;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.refresh_landing_image_paths() IS 'AFTER INSERT, UPDATE OF share_image_id or DELETE on landing_page_translations and landing_page_publication_translations: when a version''s share picture is added, changed or removed (with its version or alone), touches the copy''s row so apply_landing_image_paths re-derives the copy''s image_paths. That is what makes a share picture named by one language alone count as in use, refuses one that is gone or of another purpose at the version''s write, and lets it stop counting when no version names it.';

REVOKE ALL ON FUNCTION public.refresh_landing_image_paths() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_landing_image_paths() TO service_role;

CREATE TRIGGER trg_landing_page_translations_refresh_image_paths
  AFTER INSERT OR DELETE OR UPDATE OF share_image_id ON public.landing_page_translations
  FOR EACH ROW EXECUTE FUNCTION public.refresh_landing_image_paths();

CREATE TRIGGER trg_landing_page_publication_translations_refresh_image_paths
  AFTER INSERT OR DELETE OR UPDATE OF share_image_id ON public.landing_page_publication_translations
  FOR EACH ROW EXECUTE FUNCTION public.refresh_landing_image_paths();

CREATE OR REPLACE FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_moved integer;
BEGIN
  PERFORM public.assert_admin();

  -- Moving pictures to no entry is a removal, which the catalogue does by
  -- deleting the entry; this function only ever moves them to another.
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'A repoint needs the entry being replaced and its replacement'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  -- image_paths names every version's share picture as well as the sections'
  -- pictures, so a copy whose only use of p_from is a share picture is found
  -- and counted too; sections is set either way, which moves the working
  -- copy's last-saved time and saver as for any picture.
  WITH drafts AS (
    UPDATE public.landing_pages
       SET sections = public.landing_sections_repointed(sections, p_from, p_to)
     WHERE image_paths ? p_from::text
    RETURNING id
  ),
  live AS (
    UPDATE public.landing_page_publications
       SET sections = public.landing_sections_repointed(sections, p_from, p_to)
     WHERE image_paths ? p_from::text
    RETURNING page_id
  )
  SELECT count(*) INTO v_moved
    FROM (SELECT id FROM drafts UNION SELECT page_id FROM live) AS moved;

  -- The share pictures, once the copies have been found by them. Each version
  -- moved re-derives its copy's paths, which refuses a p_to that is gone or
  -- not a landing_image.
  UPDATE public.landing_page_translations
     SET share_image_id = p_to
   WHERE share_image_id = p_from;

  UPDATE public.landing_page_publication_translations
     SET share_image_id = p_to
   WHERE share_image_id = p_from;

  RETURN v_moved;
END;
$$;

COMMENT ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) IS 'Admin-gated landing half of the image catalogue''s replace: points every landing page picture that is entry p_from — in the sections or as any language''s share picture, working and published copies alike — at entry p_to, and returns how many pages moved (a page whose two copies both moved counts once). A live page''s picture changes without a republish. The image-path triggers re-derive each copy''s paths and refuse a p_to that is gone or not a landing_image. Either argument NULL raises null_value_not_allowed. SECURITY DEFINER because no landing page table carries a write grant.';

CREATE OR REPLACE FUNCTION public.unlink_removed_landing_image() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.purpose <> 'landing_image' THEN
    RETURN OLD;
  END IF;

  -- Taken out of both copies before the entry goes, so the image-path trigger
  -- re-deriving each copy never meets the entry it is removing; the structure
  -- trigger drops the text of an image section this leaves with no picture.
  -- The copies are found by their paths before the share pictures are unset,
  -- so a working copy whose only use was a share picture moves its last-saved
  -- time too.
  UPDATE public.landing_pages
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE image_paths ? OLD.id::text;

  UPDATE public.landing_page_publications
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE image_paths ? OLD.id::text;

  -- A share picture that was this entry is unset, and that language's preview
  -- falls back to the hero's picture.
  UPDATE public.landing_page_translations
     SET share_image_id = NULL
   WHERE share_image_id = OLD.id;

  UPDATE public.landing_page_publication_translations
     SET share_image_id = NULL
   WHERE share_image_id = OLD.id;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.unlink_removed_landing_image() IS 'BEFORE DELETE on catalogue_images: the landing pages'' half of a removal, standing in for the foreign key a picture inside sections JSON cannot have. Takes a removed landing_image entry out of every landing page, working and published copies alike, as a cover''s SET NULL does: a hero or text section loses its picture, an image section loses that picture, an image section left with none is dropped with its text, and a language''s share picture is unset, so that language''s link preview falls back to the hero''s picture. A live page changes without a republish; the working copy''s updated_at and saver move, as a cover removal''s do. SECURITY DEFINER because the remover is an admin''s own session and no landing page table carries a write grant.';

-- ---------------------------------------------------------------------------
-- 3. Publishing copies the overrides
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_landing_page(p_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_page public.landing_pages;
BEGIN
  PERFORM public.assert_admin();

  -- Locked, so a save racing this publish (which writes this row first) lands
  -- wholly before or wholly after the copy rather than half in it.
  SELECT * INTO v_page
    FROM public.landing_pages
   WHERE id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- An incomplete version is not a refusal: it stays in the working copy.
  IF NOT EXISTS (SELECT 1 FROM public.landing_page_translations
                  WHERE page_id = p_id AND is_complete) THEN
    RAISE EXCEPTION 'The page cannot be published without a language version that has its title, summary, address and the text of every section written'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The structure is copied and the picture paths are not: the triggers
  -- derive the published copy's own, its versions' share pictures included.
  INSERT INTO public.landing_page_publications (page_id, sections, published_at, first_published_at)
  VALUES (v_page.id, v_page.sections, now(), now())
  ON CONFLICT (page_id) DO UPDATE SET
    sections     = EXCLUDED.sections,
    published_at = EXCLUDED.published_at;
  -- first_published_at is deliberately absent from the SET list: a republish
  -- of a live page keeps the date it first went live.

  -- The live version set becomes the complete working versions, whole.
  DELETE FROM public.landing_page_publication_translations
   WHERE page_id = p_id;

  INSERT INTO public.landing_page_publication_translations
         (page_id, locale, title, summary, slug, section_texts, share_title, share_image_id, share_image_alt)
  SELECT page_id, locale, title, summary, slug, section_texts, share_title, share_image_id, share_image_alt
    FROM public.landing_page_translations
   WHERE page_id = p_id
     AND is_complete;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.publish_landing_page(p_id uuid) IS 'Admin-gated publish: copies the page''s working copy over its published copy, making it live or replacing the live version — the structure and every complete language version at once, each with its share title, share picture and share picture alt text (is_complete: title, summary, slug and every section''s required text written); the live version set becomes exactly those. An incomplete version stays in the working copy. Refuses a page with no complete version with check_violation. A version whose slug differs from its live one moves that language to the new address; nothing redirects from the old. A republish moves published_at and keeps first_published_at. The working copy is locked for the copy. An id no page has raises no_data_found. SECURITY DEFINER because no landing page table carries a write grant.';

-- ---------------------------------------------------------------------------
-- 4. The version writers take the share card
-- ---------------------------------------------------------------------------
-- Dropped and recreated from their current bodies with three more arguments;
-- a new signature carries no privileges, so every grant is issued again.

DROP FUNCTION public.save_landing_page_version(uuid, text, text, text, text, text, jsonb);
DROP FUNCTION public.write_landing_page_version(uuid, text, text, text, text, text, jsonb);

CREATE FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_sections jsonb;
  v_stored   text;
  v_slug     text;
  v_holder   text;
  v_unknown  text;
BEGIN
  -- The admin list names a page by a title, so every version has one.
  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'The % version needs a title', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(btrim(p_title)) > 120 THEN
    RAISE EXCEPTION 'The % title is longer than 120 characters', p_locale
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(btrim(COALESCE(p_summary, ''))) > 160 THEN
    RAISE EXCEPTION 'The % summary is longer than 160 characters', p_locale
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(btrim(COALESCE(p_share_title, ''))) > 70 THEN
    RAISE EXCEPTION 'The % share title is longer than 70 characters', p_locale
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_section_texts IS NOT NULL AND jsonb_typeof(p_section_texts) <> 'object' THEN
    RAISE EXCEPTION 'The % section texts must be a JSON object keyed by section id', p_locale
      USING ERRCODE = '22023';
  END IF;

  SELECT sections INTO v_sections FROM public.landing_pages WHERE id = p_id;

  SELECT t.key INTO v_unknown
    FROM jsonb_each(COALESCE(p_section_texts, '{}'::jsonb)) AS t(key, value)
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_sections) AS s(e) WHERE s.e->>'id' = t.key)
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'The % version has text for %, which is not a section of this page', p_locale, v_unknown
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT t.key INTO v_unknown
    FROM jsonb_each(COALESCE(p_section_texts, '{}'::jsonb)) AS t(key, value)
   WHERE jsonb_typeof(t.value) <> 'object'
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'The % text of section % must be a JSON object of its fields', p_locale, v_unknown
      USING ERRCODE = '22023';
  END IF;

  -- The slug: the one sent; else the one stored; else the default derived
  -- from the title by the application, which owns slug derivation.
  SELECT NULLIF(slug, '') INTO v_stored
    FROM public.landing_page_translations
   WHERE page_id = p_id AND locale = p_locale;

  v_slug := COALESCE(NULLIF(btrim(p_slug), ''), v_stored, NULLIF(btrim(p_default_slug), ''), '');

  IF v_slug <> '' THEN
    IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(v_slug) > 80 THEN
      RAISE EXCEPTION 'The % address "%" may hold only lowercase letters a-z, digits and single hyphens, at most 80 characters', p_locale, v_slug
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'The % address "%" looks like a page id, and those are kept for each page''s id address; choose words instead', p_locale, v_slug
        USING ERRCODE = 'check_violation';
    END IF;
    -- Another page holding it, working or live, refuses it; this page's own
    -- live version never does, so a live language can change its address.
    -- The holder is named by its title in this language: its working
    -- version's, else its live one's when only the live version still holds
    -- the slug.
    SELECT h.title INTO v_holder
      FROM (SELECT title, 1 AS rank FROM public.landing_page_translations
             WHERE locale = p_locale AND slug = v_slug AND page_id <> p_id
            UNION ALL
            SELECT title, 2 FROM public.landing_page_publication_translations
             WHERE locale = p_locale AND slug = v_slug AND page_id <> p_id) AS h
     ORDER BY h.rank
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'The % address "%" is already the address of the landing page "%"; choose another', p_locale, v_slug, v_holder
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  INSERT INTO public.landing_page_translations AS t
         (page_id, locale, title, summary, slug, section_texts, share_title, share_image_id, share_image_alt)
  VALUES (p_id,
          p_locale,
          btrim(p_title),
          btrim(COALESCE(p_summary, '')),
          v_slug,
          COALESCE(p_section_texts, '{}'::jsonb),
          btrim(COALESCE(p_share_title, '')),
          p_share_image_id,
          btrim(COALESCE(p_share_image_alt, '')))
  ON CONFLICT (page_id, locale) DO UPDATE
     SET title           = EXCLUDED.title,
         summary         = EXCLUDED.summary,
         slug            = EXCLUDED.slug,
         section_texts   = EXCLUDED.section_texts,
         share_title     = EXCLUDED.share_title,
         share_image_id  = EXCLUDED.share_image_id,
         share_image_alt = EXCLUDED.share_image_alt;
  -- The page's image paths are re-derived by refresh_landing_image_paths when
  -- the share picture changed, which refuses one that is gone (23503) or of
  -- another purpose (23514).
END;
$_$;

COMMENT ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) IS 'Internal: validates and upserts one language version of a landing page''s working copy, for save_landing_page and save_landing_page_version, which have already locked the page row. A blank or over-long title, an over-long summary or share title, or text for a section the page does not have raises check_violation; section texts, or one section''s text, that are not an object raise 22023. The slug is p_slug when sent, else the stored one, else p_default_slug (the application''s derivation from the title), else unwritten; it may differ from the page''s own live slug, which changes at the next publish. A malformed or uuid-shaped one raises check_violation, and one another page holds in that locale, working or live, raises unique_violation naming that page by its title. The share title, share picture and share picture alt text are written as sent, NULL as the empty string or no picture: like the words, a write carries the whole of what the version holds. A share picture that is gone raises foreign_key_violation, and one of another purpose check_violation. Carries no guard: not granted to any Data API role.';

REVOKE ALL ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) TO service_role;

CREATE FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_default_slug text DEFAULT NULL::text, p_section_texts jsonb DEFAULT NULL::jsonb, p_share_title text DEFAULT NULL::text, p_share_image_id uuid DEFAULT NULL::uuid, p_share_image_alt text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'The % version needs a title', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Written first, so an id no page has is refused before the version is, the
  -- row's updated_at and saver move, and publish's row lock orders this write
  -- wholly before or after a publish. Nothing else on the row is written here.
  UPDATE public.landing_pages SET updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_landing_page_version(
    p_id, p_locale, p_title, p_summary, p_slug, p_default_slug, p_section_texts,
    p_share_title, p_share_image_id, p_share_image_alt);

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) IS 'Admin-gated save of ONE language version of a landing page''s working copy — its title, summary, slug, every section''s text, and its share card (share title, share picture and share picture alt text), in that locale; returns the page id. Writes the (page, locale) row by write_landing_page_version''s rules, creating it when the language is new, and touches no other version and not the structure, so a structure write and a one-language write never undo each other. Never touches the published copy. An id no page has raises no_data_found. SECURITY DEFINER because no working table carries a write grant. The optional parameters default NULL because codegen cannot express an explicit null for a non-defaulted argument.';

REVOKE ALL ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) TO authenticated;
GRANT ALL ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The whole-copy save passes each version's share card on
-- ---------------------------------------------------------------------------
-- Same arguments, so the grants stand; create_landing_page calls it unchanged.

CREATE OR REPLACE FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_problem text;
  v_version jsonb;
BEGIN
  PERFORM public.assert_admin();

  IF p_versions IS NULL OR jsonb_typeof(p_versions) <> 'array' THEN
    RAISE EXCEPTION 'p_versions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  v_problem := public.landing_sections_problem(p_sections);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_array_length(p_versions) = 0 THEN
    RAISE EXCEPTION 'A landing page needs a title'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(DISTINCT e->>'locale') <> count(*)
        FROM jsonb_array_elements(p_versions) AS t(e)) THEN
    RAISE EXCEPTION 'Each language may have one version'
      USING ERRCODE = '22023';
  END IF;

  -- Written first, so an id no page has is refused before any version is, the
  -- row's updated_at and saver move, and the row lock publish takes orders
  -- this save wholly before or after a publish. The structure trigger drops
  -- the text of any section this structure no longer holds.
  UPDATE public.landing_pages SET sections = p_sections
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The version set is replaced whole: a locale the save no longer names is
  -- gone, and every named one is written as sent.
  DELETE FROM public.landing_page_translations t
   WHERE t.page_id = p_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_versions) e
        WHERE e->>'locale' = t.locale);

  FOR v_version IN SELECT e FROM jsonb_array_elements(p_versions) AS t(e) LOOP
    PERFORM public.write_landing_page_version(
      p_id,
      v_version->>'locale',
      v_version->>'title',
      v_version->>'summary',
      v_version->>'slug',
      v_version->>'default_slug',
      v_version->'section_texts',
      v_version->>'share_title',
      (v_version->>'share_image_id')::uuid,
      v_version->>'share_image_alt');
  END LOOP;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) IS 'Admin-gated save of a landing page''s WHOLE working copy; returns its id. Never touches the published copy. p_sections is the structure (landing_sections_problem names what is wrong with one, as check_violation). p_versions is the whole version set, a JSON array of {locale, title, summary, slug, default_slug, section_texts, share_title, share_image_id, share_image_alt}, replacing what was stored: a locale it omits is removed. At least one version, each written by write_landing_page_version''s rules; a locale named twice, or p_versions not an array, raises 22023. An id no page has raises no_data_found. SECURITY DEFINER because no landing page table carries a write grant.';

-- ---------------------------------------------------------------------------
-- 6. A clone copies the share card
-- ---------------------------------------------------------------------------
-- A clone copies the working copy verbatim apart from its ids and titles, so
-- it carries each language's share card (title, picture and alt text) with
-- its words. The share title is copied as written, like the summary: a clone
-- is rewritten for its own audience before it is published, and the status
-- page shows each language's card while it stands.
-- Same arguments, so the grants stand.

CREATE OR REPLACE FUNCTION public.clone_landing_page(p_id uuid, p_versions jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_sections  jsonb;
  v_section   jsonb;
  v_field     text;
  v_value     jsonb;
  v_list      jsonb;
  v_item      jsonb;
  v_new_item  text;
  v_items     jsonb;
  -- Each source section id to its copy's, and to its own item map.
  v_ids       jsonb := '{}'::jsonb;
  v_item_ids  jsonb := '{}'::jsonb;
  v_copy      jsonb := '[]'::jsonb;
  v_sent      jsonb;
  v_locale    text;
  v_source    record;
  v_texts     jsonb;
  v_base      text;
  v_slug      text;
  v_n         integer;
  v_versions  jsonb := '[]'::jsonb;
  v_new_id    uuid;
BEGIN
  PERFORM public.assert_admin();

  IF p_versions IS NULL OR jsonb_typeof(p_versions) <> 'array' THEN
    RAISE EXCEPTION 'p_versions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- Shared, so no write to the source lands while it is being copied.
  SELECT sections INTO v_sections
    FROM public.landing_pages
   WHERE id = p_id
     FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF jsonb_array_length(p_versions) = 0 THEN
    RAISE EXCEPTION 'A landing page needs a title'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(DISTINCT e->>'locale') <> count(*)
        FROM jsonb_array_elements(p_versions) AS t(e)) THEN
    RAISE EXCEPTION 'Each language may have one version'
      USING ERRCODE = '22023';
  END IF;

  SELECT e->>'locale' INTO v_locale
    FROM jsonb_array_elements(p_versions) AS t(e)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.landing_page_translations
      WHERE page_id = p_id AND locale = e->>'locale')
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'The page has no % version to copy', COALESCE(v_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  -- The structure, with a new id for every section and item.
  FOR v_section IN
    SELECT e FROM jsonb_array_elements(v_sections) WITH ORDINALITY AS t(e, n) ORDER BY n
  LOOP
    v_items := '{}'::jsonb;

    FOR v_field, v_value IN
      SELECT key, value FROM jsonb_each(v_section) WHERE jsonb_typeof(value) = 'array'
    LOOP
      v_list := '[]'::jsonb;
      FOR v_item IN
        SELECT e FROM jsonb_array_elements(v_value) WITH ORDINALITY AS t(e, n) ORDER BY n
      LOOP
        IF jsonb_typeof(v_item) = 'object' AND jsonb_typeof(v_item->'id') = 'string' THEN
          v_new_item := gen_random_uuid()::text;
          v_items := v_items || jsonb_build_object(v_item->>'id', v_new_item);
          v_item := v_item || jsonb_build_object('id', v_new_item);
        END IF;
        v_list := v_list || jsonb_build_array(v_item);
      END LOOP;
      v_section := v_section || jsonb_build_object(v_field, v_list);
    END LOOP;

    v_ids := v_ids || jsonb_build_object(v_section->>'id', gen_random_uuid()::text);
    v_item_ids := v_item_ids || jsonb_build_object(v_section->>'id', v_items);
    v_copy := v_copy
      || jsonb_build_array(v_section || jsonb_build_object('id', v_ids->>(v_section->>'id')));
  END LOOP;

  -- Each named language: its words re-keyed, its new title, its free slug.
  FOR v_source IN
    SELECT t.locale, t.summary, t.section_texts, t.share_title, t.share_image_id, t.share_image_alt
      FROM public.landing_page_translations t
     WHERE t.page_id = p_id
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_versions) AS s(e)
                    WHERE s.e->>'locale' = t.locale)
     ORDER BY t.locale
  LOOP
    SELECT e INTO v_sent
      FROM jsonb_array_elements(p_versions) AS t(e)
     WHERE e->>'locale' = v_source.locale;

    SELECT COALESCE(jsonb_object_agg(v_ids->>s.key, (
             SELECT COALESCE(jsonb_object_agg(f.key,
                      CASE WHEN jsonb_typeof(f.value) = 'object' THEN (
                        SELECT COALESCE(jsonb_object_agg((v_item_ids->s.key)->>i.key, i.value), '{}'::jsonb)
                          FROM jsonb_each(f.value) AS i(key, value)
                         WHERE (v_item_ids->s.key) ? i.key)
                      ELSE f.value END), '{}'::jsonb)
               FROM jsonb_each(s.value) AS f(key, value))), '{}'::jsonb)
      INTO v_texts
      FROM jsonb_each(v_source.section_texts) AS s(key, value)
     WHERE v_ids ? s.key
       AND jsonb_typeof(s.value) = 'object';

    -- The first slug no page holds in this locale, working or live; none at
    -- all when the title derives none.
    v_base := COALESCE(btrim(v_sent->>'default_slug'), '');
    v_slug := v_base;
    v_n := 1;
    WHILE v_slug <> '' AND (
            EXISTS (SELECT 1 FROM public.landing_page_translations
                     WHERE locale = v_source.locale AND slug = v_slug)
         OR EXISTS (SELECT 1 FROM public.landing_page_publication_translations
                     WHERE locale = v_source.locale AND slug = v_slug))
    LOOP
      v_n := v_n + 1;
      v_slug := rtrim(left(v_base, 80 - char_length('-' || v_n)), '-') || '-' || v_n;
    END LOOP;

    v_versions := v_versions || jsonb_build_array(jsonb_build_object(
      'locale',        v_source.locale,
      'title',         v_sent->>'title',
      'summary',       v_source.summary,
      'slug',          v_slug,
      'section_texts', v_texts,
      'share_title',     v_source.share_title,
      'share_image_id',  v_source.share_image_id,
      'share_image_alt', v_source.share_image_alt));
  END LOOP;

  -- As create_landing_page writes a new page: an empty structure stands in
  -- until the save writes the copy; a refusal there aborts the whole call.
  INSERT INTO public.landing_pages (author_id, sections)
  VALUES (auth.uid(), '[]'::jsonb)
  RETURNING id INTO v_new_id;

  PERFORM public.save_landing_page(v_new_id, v_copy, v_versions);

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.clone_landing_page(p_id uuid, p_versions jsonb) IS 'Admin-gated clone of a landing page''s working copy into a new, unpublished page; returns its id. p_versions names the languages to copy, a JSON array of {locale, title, default_slug}: the copy''s title in that language and the slug the application derives from it. Each named language''s summary and words, and its share card (share title, share picture and share picture alt text), are copied from the source, the words re-keyed to the copy''s ids; the structure is copied with a new id for every section and every item (any object with an id inside a section''s array field), pictures included. A default_slug another page holds in that locale, working or live, takes the first free number (<slug>-2, …, cut to 80 characters). Written through save_landing_page on a new row, as create_landing_page writes one, whose rules and refusals are this function''s. An id no page has raises no_data_found; a named language the source lacks raises check_violation; no language, or p_versions not an array, or a language named twice, raises check_violation or 22023. SECURITY DEFINER because no landing page table carries a write grant.';
