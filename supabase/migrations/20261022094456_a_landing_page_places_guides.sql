-- A landing page places guides.
--
-- WHAT THIS CHANGES
--
-- A landing page gains a section type, `guide`: one guide from Marketing's
-- store, placed by id, offered for download to signed-in readers. Its shared
-- fields are {guideId, imageId?} — the guide, and an optional cover picture
-- from the image catalogue, handled by the same picture triggers as every
-- other section's single picture. Its words are a required heading, and an
-- optional eyebrow, description and, with a picture, its alt text, required
-- then.
--
-- - landing_sections_problem learns the type and its shape: a guide's
--   lowercase uuid, and an optional picture like a hero's or a text
--   section's.
-- - landing_version_missing names its required words: the heading, and the
--   picture's alt text when it has one. The TypeScript half of the
--   required-text rule says the same, and the DB test holds the two equal.
-- - check_landing_guide_picks, a trigger on the working copy, refuses a save
--   that places an id no guide has (foreign_key_violation), naming the section
--   by its number and the id. Only an id the save adds is checked, exactly as
--   check_landing_testimonial_picks does.
-- - list_landing_page_guides, the public read: the ids of the guides one live
--   landing page's published copy places — nothing about their files, their
--   label or who uploaded them.
-- - get_guide_download_files, the download route's read: on the reader's own
--   session, every file of one guide the reader may download — any signed-in
--   account for a guide a live page places, and an admin for any guide, so a
--   preview of a working copy downloads too. It returns every locale's file;
--   the reader's pick is the app's, through its one picker.
--
-- ACCESS
--
-- The store stays admin-only. list_landing_page_guides crosses that boundary
-- for anon and authenticated alike and hands back only the ids of the guides a
-- live page's published copy places. get_guide_download_files is granted to authenticated alone: a
-- signed-out visitor sees the section but has no file, which is the gate.

-- ---------------------------------------------------------------------------
-- 1. The structure check
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.landing_sections_problem(p_sections jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
DECLARE
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_section  jsonb;
  v_n        bigint;
  v_id       text;
  v_type     text;
  v_ids      text[] := ARRAY[]::text[];
  v_heroes   integer := 0;
  v_key      text;
  v_min      integer;
  v_max      integer;
  v_field    text;
  v_item     jsonb;
  v_item_ids text[];
  v_slots    integer;
  v_count    integer;
BEGIN
  IF p_sections IS NULL OR jsonb_typeof(p_sections) <> 'array' THEN
    RETURN 'The sections must be a JSON array';
  END IF;

  IF jsonb_array_length(p_sections) = 0
     OR p_sections->0->>'type' IS DISTINCT FROM 'hero' THEN
    RETURN 'A page starts with its hero section';
  END IF;

  FOR v_section, v_n IN
    SELECT e, n FROM jsonb_array_elements(p_sections) WITH ORDINALITY AS t(e, n)
     ORDER BY n
  LOOP
    IF jsonb_typeof(v_section) <> 'object' THEN
      RETURN format('Section %s is not an object', v_n);
    END IF;

    v_id   := v_section->>'id';
    v_type := v_section->>'type';

    IF jsonb_typeof(v_section->'id') IS DISTINCT FROM 'string' OR v_id !~ c_uuid THEN
      RETURN format('Section %s needs a lowercase uuid as its id', v_n);
    END IF;
    IF v_id = ANY (v_ids) THEN
      RETURN format('Two sections share the id %s', v_id);
    END IF;
    v_ids := array_append(v_ids, v_id);

    -- A single picture, where a type takes one, is optional and a uuid.
    IF v_type IN ('hero', 'text', 'guide') AND v_section ? 'imageId'
       AND (jsonb_typeof(v_section->'imageId') IS DISTINCT FROM 'string'
            OR v_section->>'imageId' !~ c_uuid) THEN
      RETURN format('The picture of section %s must be a catalogue entry''s lowercase uuid', v_id);
    END IF;

    v_key := NULL;

    CASE v_type
      WHEN 'hero' THEN
        v_heroes := v_heroes + 1;
        IF v_section ? 'button' AND NOT public.landing_button_is_valid(v_section->'button') THEN
          RETURN format('The button of section %s needs a site path, an http(s) URL or an email address', v_id);
        END IF;
      WHEN 'text' THEN
        IF v_section->>'imageSide' IS NULL OR v_section->>'imageSide' NOT IN ('start', 'end') THEN
          RETURN format('Section %s needs its picture side, start or end', v_id);
        END IF;
      WHEN 'image' THEN
        v_key := 'images'; v_min := 1; v_max := 4;  v_field := 'imageId';
      WHEN 'points' THEN
        v_key := 'items';  v_min := 2; v_max := 6;  v_field := 'icon';
      WHEN 'steps' THEN
        v_key := 'items';  v_min := 2; v_max := 6;  v_field := NULL;
      WHEN 'faq' THEN
        v_key := 'items';  v_min := 1; v_max := 20; v_field := NULL;
      WHEN 'cta' THEN
        IF NOT public.landing_button_is_valid(v_section->'button') THEN
          RETURN format('The button of section %s needs a site path, an http(s) URL or an email address', v_id);
        END IF;
      WHEN 'testimonials' THEN
        -- Each arrangement shows exactly this many: the TypeScript half's
        -- LANDING_TESTIMONIAL_SLOTS.
        v_slots := CASE v_section->>'arrangement'
                     WHEN 'feature'  THEN 1
                     WHEN 'pair'     THEN 2
                     WHEN 'row'      THEN 3
                     WHEN 'showcase' THEN 6
                   END;
        IF jsonb_typeof(v_section->'arrangement') IS DISTINCT FROM 'string' OR v_slots IS NULL THEN
          RETURN format('Section %s needs its arrangement: feature, pair, row or showcase', v_id);
        END IF;
        IF jsonb_typeof(v_section->'testimonialIds') IS DISTINCT FROM 'array' THEN
          RETURN format('Section %s needs its testimonials, as a list of ids', v_id);
        END IF;
        v_item_ids := ARRAY[]::text[];
        FOR v_item IN SELECT e FROM jsonb_array_elements(v_section->'testimonialIds') AS t(e) LOOP
          IF jsonb_typeof(v_item) IS DISTINCT FROM 'string' OR v_item #>> '{}' !~ c_uuid THEN
            RETURN format('Every testimonial of section %s must be a testimonial''s lowercase uuid', v_id);
          END IF;
          IF v_item #>> '{}' = ANY (v_item_ids) THEN
            RETURN format('Section %s names the testimonial %s twice', v_id, v_item #>> '{}');
          END IF;
          v_item_ids := array_append(v_item_ids, v_item #>> '{}');
        END LOOP;
        v_count := jsonb_array_length(v_section->'testimonialIds');
        IF v_count <> v_slots THEN
          RETURN format('Section %s: a %s arrangement shows exactly %s %s; this section has %s',
                        v_id, v_section->>'arrangement', v_slots,
                        CASE WHEN v_slots = 1 THEN 'testimonial' ELSE 'testimonials' END,
                        v_count);
        END IF;
      WHEN 'guide' THEN
        IF jsonb_typeof(v_section->'guideId') IS DISTINCT FROM 'string'
           OR v_section->>'guideId' !~ c_uuid THEN
          RETURN format('Section %s needs its guide, as a guide''s lowercase uuid', v_id);
        END IF;
      ELSE
        RETURN format('Section %s has no type a landing page knows (%s)', v_id, COALESCE(v_type, 'none'));
    END CASE;

    IF v_key IS NOT NULL THEN
      IF jsonb_typeof(v_section->v_key) IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_section->v_key) NOT BETWEEN v_min AND v_max THEN
        RETURN format('Section %s needs between %s and %s %s', v_id, v_min, v_max, v_key);
      END IF;

      v_item_ids := ARRAY[]::text[];
      FOR v_item IN SELECT e FROM jsonb_array_elements(v_section->v_key) AS t(e) LOOP
        IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
           OR jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string'
           OR v_item->>'id' !~ c_uuid THEN
          RETURN format('Every one of the %s of section %s needs a lowercase uuid as its id', v_key, v_id);
        END IF;
        IF v_item->>'id' = ANY (v_item_ids) THEN
          RETURN format('Two of the %s of section %s share the id %s', v_key, v_id, v_item->>'id');
        END IF;
        v_item_ids := array_append(v_item_ids, v_item->>'id');

        IF v_field = 'imageId'
           AND (jsonb_typeof(v_item->'imageId') IS DISTINCT FROM 'string'
                OR v_item->>'imageId' !~ c_uuid) THEN
          RETURN format('Every picture of section %s must be a catalogue entry''s lowercase uuid', v_id);
        END IF;
        IF v_field = 'icon' AND NOT public.landing_text_is_written(v_item->'icon') THEN
          RETURN format('Every item of section %s needs an icon', v_id);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF v_heroes <> 1 THEN
    RETURN 'A page has exactly one hero section';
  END IF;

  RETURN NULL;
END;
$_$;

COMMENT ON FUNCTION public.landing_sections_problem(p_sections jsonb) IS 'What is wrong with a landing page''s section structure, in a sentence for the admin, or NULL when nothing is. The structure is a JSON array of sections, each {id, type, ...shared fields}, ids lowercase uuids distinct within the page; the first is the page''s one hero. Per type: hero {imageId?, button?}; text {imageId?, imageSide: start|end}; image {images: 1-4 of {id, imageId}}; points {items: 2-6 of {id, icon}}; steps {items: 2-6 of {id}}; testimonials {arrangement: feature|pair|row|showcase, testimonialIds: exactly 1, 2, 3 or 6 distinct testimonial uuids, by arrangement}; guide {guideId: a guide uuid, imageId?}; faq {items: 1-20 of {id}}; cta {button}. Item ids are lowercase uuids distinct within their section. A button is checked by landing_button_is_valid. The curated icon list and the text fields are the application''s to check; whether a picture exists and has the landing_image purpose is apply_landing_image_paths''; whether a placed testimonial exists is check_landing_testimonial_picks'', and a placed guide check_landing_guide_picks''. The TypeScript structure schema in src/lib/landing-pages/sections/ states the testimonials counts too, and a DB test holds the two equal.';

-- ---------------------------------------------------------------------------
-- 2. The required-text rule
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_section jsonb;
  v_id      text;
  v_type    text;
  v_texts   jsonb;
  v_item    jsonb;
  v_iid     text;
  v_prefix  text;
BEGIN
  IF COALESCE(p_title, '') !~ '\S' THEN
    v_missing := array_append(v_missing, 'title');
  END IF;
  IF COALESCE(p_summary, '') !~ '\S' THEN
    v_missing := array_append(v_missing, 'summary');
  END IF;
  IF COALESCE(p_slug, '') !~ '\S' THEN
    v_missing := array_append(v_missing, 'slug');
  END IF;

  IF jsonb_typeof(p_sections) IS DISTINCT FROM 'array' THEN
    RETURN v_missing;
  END IF;

  FOR v_section IN
    SELECT e FROM jsonb_array_elements(p_sections) WITH ORDINALITY AS t(e, n) ORDER BY n
  LOOP
    v_id     := v_section->>'id';
    v_type   := v_section->>'type';
    v_texts  := COALESCE(p_section_texts->v_id, '{}'::jsonb);
    v_prefix := 'sections.' || v_id || '.';

    CASE v_type
      WHEN 'hero' THEN
        IF NOT public.landing_text_is_written(v_texts->'headline') THEN
          v_missing := array_append(v_missing, v_prefix || 'headline');
        END IF;
        IF v_section ? 'button' AND NOT public.landing_text_is_written(v_texts->'buttonLabel') THEN
          v_missing := array_append(v_missing, v_prefix || 'buttonLabel');
        END IF;
        IF v_section ? 'imageId' AND NOT public.landing_text_is_written(v_texts->'imageAlt') THEN
          v_missing := array_append(v_missing, v_prefix || 'imageAlt');
        END IF;
      WHEN 'text' THEN
        IF NOT public.landing_text_is_written(v_texts->'heading') THEN
          v_missing := array_append(v_missing, v_prefix || 'heading');
        END IF;
        IF NOT public.landing_text_is_written(v_texts->'body') THEN
          v_missing := array_append(v_missing, v_prefix || 'body');
        END IF;
        IF v_section ? 'imageId' AND NOT public.landing_text_is_written(v_texts->'imageAlt') THEN
          v_missing := array_append(v_missing, v_prefix || 'imageAlt');
        END IF;
      WHEN 'image' THEN
        FOR v_item IN
          SELECT e FROM jsonb_array_elements(COALESCE(v_section->'images', '[]'::jsonb)) WITH ORDINALITY AS t(e, n) ORDER BY n
        LOOP
          v_iid := v_item->>'id';
          IF NOT public.landing_text_is_written(v_texts->'alts'->v_iid) THEN
            v_missing := array_append(v_missing, v_prefix || 'alts.' || v_iid);
          END IF;
        END LOOP;
      WHEN 'points', 'steps', 'faq' THEN
        IF NOT public.landing_text_is_written(v_texts->'heading') THEN
          v_missing := array_append(v_missing, v_prefix || 'heading');
        END IF;
        FOR v_item IN
          SELECT e FROM jsonb_array_elements(COALESCE(v_section->'items', '[]'::jsonb)) WITH ORDINALITY AS t(e, n) ORDER BY n
        LOOP
          v_iid := v_item->>'id';
          IF v_type = 'faq' THEN
            IF NOT public.landing_text_is_written(v_texts->'items'->v_iid->'question') THEN
              v_missing := array_append(v_missing, v_prefix || 'items.' || v_iid || '.question');
            END IF;
            IF NOT public.landing_text_is_written(v_texts->'items'->v_iid->'answer') THEN
              v_missing := array_append(v_missing, v_prefix || 'items.' || v_iid || '.answer');
            END IF;
          ELSE
            IF NOT public.landing_text_is_written(v_texts->'items'->v_iid->'title') THEN
              v_missing := array_append(v_missing, v_prefix || 'items.' || v_iid || '.title');
            END IF;
            IF NOT public.landing_text_is_written(v_texts->'items'->v_iid->'body') THEN
              v_missing := array_append(v_missing, v_prefix || 'items.' || v_iid || '.body');
            END IF;
          END IF;
        END LOOP;
      WHEN 'cta' THEN
        IF NOT public.landing_text_is_written(v_texts->'heading') THEN
          v_missing := array_append(v_missing, v_prefix || 'heading');
        END IF;
        IF NOT public.landing_text_is_written(v_texts->'buttonLabel') THEN
          v_missing := array_append(v_missing, v_prefix || 'buttonLabel');
        END IF;
      WHEN 'testimonials' THEN
        -- Its eyebrow, heading and intro are all optional: a testimonials
        -- section never makes a version incomplete.
        NULL;
      WHEN 'guide' THEN
        IF NOT public.landing_text_is_written(v_texts->'heading') THEN
          v_missing := array_append(v_missing, v_prefix || 'heading');
        END IF;
        IF v_section ? 'imageId' AND NOT public.landing_text_is_written(v_texts->'imageAlt') THEN
          v_missing := array_append(v_missing, v_prefix || 'imageAlt');
        END IF;
      ELSE
        NULL;
    END CASE;
  END LOOP;

  RETURN v_missing;
END;
$$;

COMMENT ON FUNCTION public.landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb) IS 'The SQL half of the landing pages'' required-text rule: what one language version still needs before publishing takes it, given the page''s structure, as a list of paths — title, summary, slug, then per section in order sections.<id>.<field>, sections.<id>.items.<item id>.<field> or sections.<id>.alts.<picture item id>. Empty means complete. Required: hero headline, its buttonLabel when it has a button and its imageAlt when it has a picture; text heading, body and imageAlt with a picture; image an alt per picture; points and steps heading and each item''s title and body; testimonials nothing; guide heading and imageAlt with a picture; faq heading and each item''s question and answer; cta heading and buttonLabel. Written means landing_text_is_written. The TypeScript rule in src/lib/landing-pages/sections/ is the other half, and a DB test holds the two equal.';

-- ---------------------------------------------------------------------------
-- 3. A placed guide exists
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.check_landing_guide_picks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_before  text[] := ARRAY[]::text[];
  v_section bigint;
  v_id      text;
BEGIN
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.sections) = 'array' THEN
    SELECT COALESCE(array_agg(s.e->>'guideId'), ARRAY[]::text[]) INTO v_before
      FROM jsonb_array_elements(OLD.sections) AS s(e)
     WHERE s.e->>'type' = 'guide'
       AND jsonb_typeof(s.e->'guideId') = 'string';
  END IF;

  IF jsonb_typeof(NEW.sections) IS DISTINCT FROM 'array' THEN
    RETURN NEW;
  END IF;

  SELECT pick.n, pick.id INTO v_section, v_id
    FROM (
      SELECT s.n, s.e->>'guideId' AS id
        FROM jsonb_array_elements(NEW.sections) WITH ORDINALITY AS s(e, n)
       WHERE s.e->>'type' = 'guide'
         AND jsonb_typeof(s.e->'guideId') = 'string'
    ) AS pick
   WHERE NOT (pick.id = ANY (v_before))
     AND NOT EXISTS (
       SELECT 1 FROM public.guides g
        WHERE g.id = CASE WHEN pick.id ~ c_uuid THEN pick.id::uuid END
     )
   ORDER BY pick.n
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'Section % places the guide %, and no guide has that id', v_section, v_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_landing_guide_picks() IS 'BEFORE INSERT OR UPDATE OF sections on landing_pages (the working copy alone): refuses a save whose guide sections place an id no guide has, with foreign_key_violation naming the section by its number from one and the id. Only ids the save adds are checked — on an update, a placement the stored structure already held is left alone — so a write that moves only the structure''s other contents (a catalogue picture''s replace or removal) is never refused by a placement it did not make. No foreign key can reach into the structure, which is why this is a trigger. The published copy has no such check: it only ever holds a structure this one passed, and guides are never deleted by the app.';

REVOKE ALL ON FUNCTION public.check_landing_guide_picks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_landing_guide_picks() TO service_role;

CREATE TRIGGER trg_landing_pages_check_guide_picks
  BEFORE INSERT OR UPDATE OF sections ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.check_landing_guide_picks();

-- ---------------------------------------------------------------------------
-- 4. The public read
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.list_landing_page_guides(p_page_id uuid)
RETURNS TABLE(guide_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT g.id
    FROM public.guides g
   WHERE g.id IN (
     SELECT CASE
              WHEN s.e->>'guideId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN (s.e->>'guideId')::uuid
            END
       FROM public.landing_page_publications l,
            jsonb_array_elements(
              CASE WHEN jsonb_typeof(l.sections) = 'array' THEN l.sections ELSE '[]'::jsonb END
            ) AS s(e)
      WHERE l.page_id = p_page_id
        AND s.e->>'type' = 'guide'
        AND jsonb_typeof(s.e->'guideId') = 'string'
   );
$$;

COMMENT ON FUNCTION public.list_landing_page_guides(p_page_id uuid) IS 'A live landing page''s guides: the id of every guide the guide sections of the page''s PUBLISHED copy place and the store holds, each once. A guide always has at least one file, so an answered id is one the page can offer. Crosses the boundary that the guide store is admin-only and anon holds no grant on it, and hands back only that a guide a live page places exists — never its files, their languages or sizes, its label or who uploaded it, and never a guide placed only in an unpublished working copy. An unpublished or unknown page answers no rows.';

REVOKE ALL ON FUNCTION public.list_landing_page_guides(p_page_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_landing_page_guides(p_page_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.list_landing_page_guides(p_page_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_landing_page_guides(p_page_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The download route's read
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.get_guide_download_files(p_guide_id uuid)
RETURNS TABLE(locale text, storage_path text, file_name text, byte_size integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT f.locale, f.storage_path, f.file_name, f.byte_size
    FROM public.guide_files f
   WHERE f.guide_id = p_guide_id
     AND (
       (SELECT public.is_admin())
       OR EXISTS (
         SELECT 1
           FROM public.landing_page_publications l,
                jsonb_array_elements(
                  CASE WHEN jsonb_typeof(l.sections) = 'array' THEN l.sections ELSE '[]'::jsonb END
                ) AS s(e)
          WHERE s.e->>'type' = 'guide'
            AND s.e->>'guideId' = p_guide_id::text
       )
     );
$$;

COMMENT ON FUNCTION public.get_guide_download_files(p_guide_id uuid) IS 'The files of one guide the caller may download, for the download route, which calls it on the reader''s own session and then reads the chosen object from the private guides bucket with the service role: every language''s file as {locale, storage_path, file_name, byte_size}, in no particular order — the reader''s pick is the app''s, through its one picker. Any signed-in account may download a guide the published copy of some live landing page places; an admin may download any guide, so a preview of a working copy downloads too. Answers no rows otherwise, and for a guide that does not exist. Granted to authenticated alone: anon has no download, which is the gate a signed-out visitor meets. Crosses the boundary that the guide store is admin-only, reading no uid beyond whether the caller is an admin.';

REVOKE ALL ON FUNCTION public.get_guide_download_files(p_guide_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guide_download_files(p_guide_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_guide_download_files(p_guide_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The store says where it is read
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.guides IS 'Marketing''s store of guides — PDFs a landing page hands out, one file per site locale in guide_files: the admin-only label and the record of who created each and who last saved it. Admin-only for the Data API: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are create_guide, save_guide_label, save_guide_file and remove_guide_file, and nothing deletes a guide: once created it stays. The public reads only which guides a live landing page places, through list_landing_page_guides; a signed-in reader''s download is authorized by get_guide_download_files.';
