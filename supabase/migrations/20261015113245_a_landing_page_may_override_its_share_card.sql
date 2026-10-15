-- A landing page may override its share card.
--
-- WHAT THIS ADDS
--
-- A page's link preview (its Open Graph and Twitter card) is derived from the
-- page: the shown version's title and summary, and the hero's picture. An
-- admin may now override two of those, while writing the page:
--
-- * A SHARE PICTURE, per page — structure, like every other picture: a
--   landing_image catalogue entry referenced by id, in share_image_id on both
--   copies. It is written by the structure writers beside the sections.
-- * A SHARE TITLE and the share picture's ALT TEXT, per language — words,
--   in share_title and share_image_alt on both copies' versions. They are
--   written by the version writers beside the title and summary.
--
-- All three are optional: absent, the card is derived as before, and none of
-- them counts toward a version's completeness. The description stays the
-- summary, so there is nothing to override for it.
--
-- THE CATALOGUE'S GUARANTEES
--
-- The share picture is one more picture a copy names, so it rides the
-- mechanism the section pictures already use rather than a second one:
--
-- * apply_landing_image_paths derives image_paths from it too, so the copy
--   carries its path and an entry that is gone (23503) or of another purpose
--   (23514) is refused.
-- * repoint_landing_images moves it in both copies; its WHERE already finds a
--   copy by image_paths, which now names the share picture.
-- * unlink_removed_landing_image unsets it in both copies, by the same WHERE;
--   the page then falls back to the hero's picture.
-- * The catalogue's usage map reads image_paths, so it knows about it with no
--   change of its own.
--
-- Publishing copies all three, and the unpublished-changes comparison (in the
-- application) reads them.
--
-- ACCESS
--
-- No new function and no new table: the writers are the existing admin-gated
-- ones, five of them dropped and recreated with the new arguments, and every
-- grant they carried is issued again.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.landing_pages
  ADD COLUMN share_image_id uuid;

ALTER TABLE public.landing_page_publications
  ADD COLUMN share_image_id uuid;

-- The cap is a share card's, not a page title's: Facebook, LinkedIn and X cut
-- a card's title at about 60–70 characters, so a longer one is truncated
-- mid-word in the feed it was written for.
ALTER TABLE public.landing_page_translations
  ADD COLUMN share_title text DEFAULT ''::text NOT NULL,
  ADD COLUMN share_image_alt text DEFAULT ''::text NOT NULL,
  ADD CONSTRAINT chk_landing_page_translations_share_title_length
    CHECK (char_length(share_title) <= 70);

ALTER TABLE public.landing_page_publication_translations
  ADD COLUMN share_title text DEFAULT ''::text NOT NULL,
  ADD COLUMN share_image_alt text DEFAULT ''::text NOT NULL;

COMMENT ON COLUMN public.landing_pages.share_image_id IS 'The share picture: a landing_image catalogue entry the page''s link preview shows in place of its hero''s picture, or NULL to derive the preview as usual. Structure, written by the structure writers beside sections. No foreign key, as for the pictures in sections: apply_landing_image_paths refuses an entry that is gone or of another purpose and names it in image_paths, the catalogue''s replace moves it and its removal unsets it.';

COMMENT ON COLUMN public.landing_page_publications.share_image_id IS 'The live share picture, copied from the working copy by publishing. The catalogue''s replace and removal change it without a republish, as they do the pictures in sections.';

COMMENT ON COLUMN public.landing_page_translations.share_title IS 'The link preview''s title in this language, in place of the page title, or the empty string to use the page title. At most 70 characters, a share card''s length. Optional: completeness never reads it.';

COMMENT ON COLUMN public.landing_page_translations.share_image_alt IS 'The share picture''s alt text in this language, or the empty string while unwritten, when the preview falls back to the card''s title. Optional: completeness never reads it.';

COMMENT ON COLUMN public.landing_page_publication_translations.share_title IS 'The live link preview''s title in this language, copied by publishing; the empty string uses the title.';

COMMENT ON COLUMN public.landing_page_publication_translations.share_image_alt IS 'The live share picture''s alt text in this language, copied by publishing; the empty string while unwritten.';

COMMENT ON COLUMN public.landing_pages.image_paths IS 'Each catalogue entry the sections and the share picture show, as {entry id: object name in the landing-images bucket}, derived from sections and share_image_id by apply_landing_image_paths and never written by anything else.';

COMMENT ON COLUMN public.landing_page_publications.image_paths IS 'Each catalogue entry the live sections and share picture show, as {entry id: object name in the landing-images bucket}, derived by apply_landing_image_paths — what the public pages paint, readable without reading the admin-only catalogue.';

COMMENT ON TABLE public.catalogue_images IS 'The catalogue of pictures admins pick from for content: product pictures, Library article covers, landing page pictures and spotlight pictures, each entry marked with its purpose. One row per distinct image per purpose, identified by the sha256 of its bytes; the object key is <sha256>.<ext> in the public bucket of the entry''s purpose (product-images, library-covers, landing-images or spotlight-images). A row is immutable except for its label — the bytes behind a path never change, which is what makes the image optimizer''s one-year cache floor safe. Admin-only: no anon grant and no anon policy, because nothing family-facing reads this table. Products reference it by products.image_id, Library article copies by cover_image_id, landing page copies by the image ids in their sections and their share_image_id, and spotlights by spotlights.image_id; the served products.image_path, cover_path, image_paths and spotlights.image_path are derived from those links by triggers and are what every reader reads.';

-- ---------------------------------------------------------------------------
-- 2. The catalogue's three guarantees reach the share picture
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
BEGIN
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
      SELECT NEW.share_image_id::text
       WHERE NEW.share_image_id IS NOT NULL
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

COMMENT ON FUNCTION public.apply_landing_image_paths() IS 'BEFORE INSERT OR UPDATE on landing_pages and landing_page_publications: image_paths is derived from every catalogue entry the copy names (a section''s imageId, an image section''s images[].imageId, and the share picture''s share_image_id), as {entry id: path}. No branch keeps a statement-supplied value and the triggers carry no column list, so this is the column''s only writer. Refuses an entry that is gone (23503) or whose purpose is not landing_image (23514).';

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

  -- image_paths names the share picture as well as the sections' pictures,
  -- so a copy whose only use of p_from is its share picture is found too;
  -- sections is set either way, which moves the working copy's last-saved
  -- time and saver as for any picture.
  WITH drafts AS (
    UPDATE public.landing_pages
       SET sections       = public.landing_sections_repointed(sections, p_from, p_to),
           share_image_id = CASE WHEN share_image_id = p_from THEN p_to ELSE share_image_id END
     WHERE image_paths ? p_from::text
    RETURNING id
  ),
  live AS (
    UPDATE public.landing_page_publications
       SET sections       = public.landing_sections_repointed(sections, p_from, p_to),
           share_image_id = CASE WHEN share_image_id = p_from THEN p_to ELSE share_image_id END
     WHERE image_paths ? p_from::text
    RETURNING page_id
  )
  SELECT count(*) INTO v_moved
    FROM (SELECT id FROM drafts UNION SELECT page_id FROM live) AS moved;

  RETURN v_moved;
END;
$$;

COMMENT ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) IS 'Admin-gated landing half of the image catalogue''s replace: points every landing page picture that is entry p_from — in the sections or as the share picture, working and published copies alike — at entry p_to, and returns how many pages moved (a page whose two copies both moved counts once). A live page''s picture changes without a republish. The image-path trigger re-derives each copy''s paths and refuses a p_to that is gone or not a landing_image. Either argument NULL raises null_value_not_allowed. SECURITY DEFINER because no landing page table carries a write grant.';

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
  -- A share picture that was this entry is unset, and the page's preview
  -- falls back to its hero's picture.
  UPDATE public.landing_pages
     SET sections       = public.landing_sections_without_image(sections, OLD.id),
         share_image_id = NULLIF(share_image_id, OLD.id)
   WHERE image_paths ? OLD.id::text;

  UPDATE public.landing_page_publications
     SET sections       = public.landing_sections_without_image(sections, OLD.id),
         share_image_id = NULLIF(share_image_id, OLD.id)
   WHERE image_paths ? OLD.id::text;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.unlink_removed_landing_image() IS 'BEFORE DELETE on catalogue_images: the landing pages'' half of a removal, standing in for the foreign key a picture inside sections JSON cannot have. Takes a removed landing_image entry out of every landing page, working and published copies alike, as a cover''s SET NULL does: a hero or text section loses its picture, an image section loses that picture, an image section left with none is dropped with its text, and a share picture is unset, so the link preview falls back to the hero''s picture. A live page changes without a republish; the working copy''s updated_at and saver move, as a cover removal''s do. SECURITY DEFINER because the remover is an admin''s own session and no landing page table carries a write grant.';

-- ---------------------------------------------------------------------------
-- 3. Publishing copies the override
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

  -- The structure and the share picture are copied and the picture paths are
  -- not: the trigger derives the published copy's own.
  INSERT INTO public.landing_page_publications (page_id, sections, share_image_id, published_at, first_published_at)
  VALUES (v_page.id, v_page.sections, v_page.share_image_id, now(), now())
  ON CONFLICT (page_id) DO UPDATE SET
    sections       = EXCLUDED.sections,
    share_image_id = EXCLUDED.share_image_id,
    published_at   = EXCLUDED.published_at;
  -- first_published_at is deliberately absent from the SET list: a republish
  -- of a live page keeps the date it first went live.

  -- The live version set becomes the complete working versions, whole.
  DELETE FROM public.landing_page_publication_translations
   WHERE page_id = p_id;

  INSERT INTO public.landing_page_publication_translations
         (page_id, locale, title, summary, slug, section_texts, share_title, share_image_alt)
  SELECT page_id, locale, title, summary, slug, section_texts, share_title, share_image_alt
    FROM public.landing_page_translations
   WHERE page_id = p_id
     AND is_complete;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.publish_landing_page(p_id uuid) IS 'Admin-gated publish: copies the page''s working copy over its published copy, making it live or replacing the live version — the structure, the share picture and every complete language version at once, each with its share title and share picture alt text (is_complete: title, summary, slug and every section''s required text written); the live version set becomes exactly those. An incomplete version stays in the working copy. Refuses a page with no complete version with check_violation. A version whose slug differs from its live one moves that language to the new address; nothing redirects from the old. A republish moves published_at and keeps first_published_at. The working copy is locked for the copy. An id no page has raises no_data_found. SECURITY DEFINER because no landing page table carries a write grant.';

-- ---------------------------------------------------------------------------
-- 4. The version writers take the share title and alt text
-- ---------------------------------------------------------------------------
-- Dropped and recreated from their current bodies with two more arguments; a
-- new signature carries no privileges, so every grant is issued again.

DROP FUNCTION public.save_landing_page_version(uuid, text, text, text, text, text, jsonb);
DROP FUNCTION public.save_landing_page(uuid, jsonb, jsonb);
DROP FUNCTION public.write_landing_page_version(uuid, text, text, text, text, text, jsonb);

CREATE FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_alt text) RETURNS void
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
         (page_id, locale, title, summary, slug, section_texts, share_title, share_image_alt)
  VALUES (p_id,
          p_locale,
          btrim(p_title),
          btrim(COALESCE(p_summary, '')),
          v_slug,
          COALESCE(p_section_texts, '{}'::jsonb),
          btrim(COALESCE(p_share_title, '')),
          btrim(COALESCE(p_share_image_alt, '')))
  ON CONFLICT (page_id, locale) DO UPDATE
     SET title           = EXCLUDED.title,
         summary         = EXCLUDED.summary,
         slug            = EXCLUDED.slug,
         section_texts   = EXCLUDED.section_texts,
         share_title     = EXCLUDED.share_title,
         share_image_alt = EXCLUDED.share_image_alt;
END;
$_$;

COMMENT ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_alt text) IS 'Internal: validates and upserts one language version of a landing page''s working copy, for save_landing_page and save_landing_page_version, which have already locked the page row. A blank or over-long title, an over-long summary or share title, or text for a section the page does not have raises check_violation; section texts, or one section''s text, that are not an object raise 22023. The slug is p_slug when sent, else the stored one, else p_default_slug (the application''s derivation from the title), else unwritten; it may differ from the page''s own live slug, which changes at the next publish. A malformed or uuid-shaped one raises check_violation, and one another page holds in that locale, working or live, raises unique_violation naming that page by its title. The share title and the share picture''s alt text are written as sent, NULL as the empty string: like the words, a write carries the whole of what the version holds. Carries no guard: not granted to any Data API role.';

REVOKE ALL ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_alt text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_alt text) TO service_role;

CREATE FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_default_slug text DEFAULT NULL::text, p_section_texts jsonb DEFAULT NULL::jsonb, p_share_title text DEFAULT NULL::text, p_share_image_alt text DEFAULT NULL::text) RETURNS uuid
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
  -- wholly before or after a publish. Nothing else on the row changes.
  UPDATE public.landing_pages SET updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_landing_page_version(
    p_id, p_locale, p_title, p_summary, p_slug, p_default_slug, p_section_texts,
    p_share_title, p_share_image_alt);

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_alt text) IS 'Admin-gated save of ONE language version of a landing page''s working copy — its title, summary, slug, every section''s text, and its share title and share picture alt text, in that locale; returns the page id. Writes the (page, locale) row by write_landing_page_version''s rules, creating it when the language is new, and touches no other version and not the structure, so a structure write and a one-language write never undo each other. Never touches the published copy. An id no page has raises no_data_found. SECURITY DEFINER because no working table carries a write grant. The optional parameters default NULL because codegen cannot express an explicit null for a non-defaulted argument.';

REVOKE ALL ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_alt text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_alt text) TO authenticated;
GRANT ALL ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_alt text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The structure writers take the share picture
-- ---------------------------------------------------------------------------
-- save_landing_page takes the share picture beside the structure, and passes
-- each version's share title and alt text on; create_landing_page calls it.

DROP FUNCTION public.create_landing_page(jsonb, jsonb);
DROP FUNCTION public.save_landing_page_structure(uuid, jsonb);

CREATE FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb, p_share_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
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
  -- the text of any section this structure no longer holds; the image-path
  -- trigger refuses a share picture that is gone or of another purpose.
  UPDATE public.landing_pages
     SET sections       = p_sections,
         share_image_id = p_share_image_id
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
      v_version->>'share_image_alt');
  END LOOP;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb, p_share_image_id uuid) IS 'Admin-gated save of a landing page''s WHOLE working copy; returns its id. Never touches the published copy. p_sections is the structure (landing_sections_problem names what is wrong with one, as check_violation), and p_share_image_id the share picture beside it, NULL for none. p_versions is the whole version set, a JSON array of {locale, title, summary, slug, default_slug, section_texts, share_title, share_image_alt}, replacing what was stored: a locale it omits is removed. At least one version, each written by write_landing_page_version''s rules; a locale named twice, or p_versions not an array, raises 22023. An id no page has raises no_data_found. SECURITY DEFINER because no landing page table carries a write grant.';

REVOKE ALL ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb, p_share_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb, p_share_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb, p_share_image_id uuid) TO service_role;

CREATE FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb, p_share_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();

  -- An empty structure stands in until the save below writes the real one; a
  -- refusal there aborts this whole call, the row included.
  INSERT INTO public.landing_pages (author_id, sections)
  VALUES (auth.uid(), '[]'::jsonb)
  RETURNING id INTO v_id;

  PERFORM public.save_landing_page(v_id, p_sections, p_versions, p_share_image_id);

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb, p_share_image_id uuid) IS 'Admin-gated create of a landing page''s working copy; returns its id. Stamps the caller as author, then writes the structure, the share picture and the versions through save_landing_page, whose rules and refusals are this function''s. Nothing is published. SECURITY DEFINER because the working tables carry no write grant.';

REVOKE ALL ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb, p_share_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb, p_share_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb, p_share_image_id uuid) TO service_role;

CREATE FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb, p_share_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_problem text;
BEGIN
  PERFORM public.assert_admin();

  v_problem := public.landing_sections_problem(p_sections);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.landing_pages
     SET sections       = p_sections,
         share_image_id = p_share_image_id
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb, p_share_image_id uuid) IS 'Admin-gated save of a landing page''s working-copy STRUCTURE alone — the ordered sections and their shared fields, and the share picture (p_share_image_id, NULL for none: the structure is sent whole, so leaving it out removes it); returns the page id. No version''s words are written, except that the text of a section the new structure drops is dropped from every language (cascade_landing_structure). A malformed structure raises check_violation naming the problem; a picture that is gone raises foreign_key_violation, and one of another purpose check_violation; an id no page has raises no_data_found. Never touches the published copy. SECURITY DEFINER because the working copy carries no write grant.';

REVOKE ALL ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb, p_share_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb, p_share_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb, p_share_image_id uuid) TO service_role;
