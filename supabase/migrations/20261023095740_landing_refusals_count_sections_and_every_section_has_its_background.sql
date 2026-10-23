-- A landing page's refusals name a section by its number, and every stored
-- section but the hero carries its background.
--
-- WHAT THIS CHANGES
--
-- 1. A refusal names a section by its number from one, never by its id.
--    Pages are written by AI apps through the MCP server, which often send a
--    new section without an id and have the server mint one, so a refusal
--    naming the section by uuid named something the app never saw.
--    landing_sections_problem now says "Section 3 ..." wherever it said the
--    section's id, as check_landing_section_picks already did; a section's
--    id appears only in "Two sections share the id ...", which is about an
--    id the app sent itself. The sticky refusals name the types allowed by their type keys
--    (guide, subscribe or cta, the keys a structure is written with), and a
--    second sticky section on a side names the side and the section already
--    there. The TypeScript structure rule in src/lib/landing-pages/sections/
--    answers the same sentences, and a DB test compares the two word for
--    word. apply_landing_pictures' refusal of an image section whose pictures
--    are of two shapes names the section by its number too.
--
-- 2. The background is written onto every section stored without one.
--    Sections stored before backgrounds existed have no background key, while
--    every structure save now writes "background": "default". The unpublished
--    changes check compares an md5 of each copy's stored sections, so
--    re-saving an unchanged page from before backgrounds read as an
--    unpublished change. Every non-hero section lacking the key gets
--    "default", in the working copy (landing_pages) and the published copy
--    (landing_page_publications) alike, which is what both copies already
--    read the absence as. A section stored without one still reads as
--    default.
--
--    Every trigger on the two tables is held off for the backfill, by name,
--    and back on after it, so the write changes that one key and nothing
--    else:
--    - landing_pages_updated_at and trg_landing_pages_stamp_saver would move
--      the working copy's "last saved" time and stamp no saver over the
--      admin and AI app who last saved it; nobody saved it.
--    - trg_landing_pages_cascade_structure and
--      trg_landing_page_publications_cascade_structure would rewrite every
--      version's words and recompute each working version's completeness;
--      the section ids are unchanged, so there are no words to drop, and a
--      completeness change belongs to a save, not to this.
--    - trg_landing_pages_apply_pictures and
--      trg_landing_page_publications_apply_pictures would re-derive each
--      copy's pictures, locking the catalogue entries; the background enters
--      no part of the derivation, so the stored pictures are already its
--      answer.
--    - The three trg_landing_pages_check_*_picks triggers check only the ids
--      a write adds, and this one adds none.
--    The generated sections_md5 of each copy follows its sections, which is
--    the point: two copies that differed only by the absent key now agree.
--
-- 3. Comments: landing_sections_problem's says the email sign-up takes the
--    sticky side as well as the background; the landing_pages table's lists
--    clone_landing_page among its writers; the landing_page_translations
--    table's lists the structure cascade and the catalogue's replace
--    (repoint_landing_images) and removal (unlink_removed_landing_image),
--    which write a version's share picture.
--
-- Both functions keep their signatures, owners and grants; the grants are
-- restated after each replace all the same. Each body is the current one with
-- only the refusals' wording changed.

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
  v_sticky   jsonb := '{}'::jsonb;
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

  -- A section is named by its number from one, never by its id: a section an
  -- AI app sent without an id has one only the server has seen.
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

    -- A sticky section, of a type that may be, at most one on each side: every
    -- type takes the field, and the types allowed it are the section modules'
    -- that say sticky: true, named by their keys in registry order. A DB test
    -- holds this list, and these sentences, to the TypeScript half's.
    -- v_sticky maps each side taken to the number of the section taking it.
    IF v_section ? 'sticky' THEN
      IF v_type IS NULL OR v_type NOT IN ('guide', 'subscribe', 'cta') THEN
        RETURN format('Section %s: only a section of type guide, subscribe or cta can be sticky', v_n);
      END IF;
      IF jsonb_typeof(v_section->'sticky') IS DISTINCT FROM 'string'
         OR v_section->>'sticky' NOT IN ('left', 'right') THEN
        RETURN format('The sticky side of section %s is left or right', v_n);
      END IF;
      IF v_sticky ? (v_section->>'sticky') THEN
        RETURN format('Section %s: a page has at most one sticky section on each side, and section %s is already sticky on the %s',
                      v_n, v_sticky->>(v_section->>'sticky'), v_section->>'sticky');
      END IF;
      v_sticky := v_sticky || jsonb_build_object(v_section->>'sticky', v_n);
    END IF;

    -- A single picture, where a type takes one, is optional and a uuid.
    IF v_type IN ('hero', 'text', 'guide') AND v_section ? 'imageId'
       AND (jsonb_typeof(v_section->'imageId') IS DISTINCT FROM 'string'
            OR v_section->>'imageId' !~ c_uuid) THEN
      RETURN format('The picture of section %s must be a catalogue entry''s lowercase uuid', v_n);
    END IF;

    v_key := NULL;

    CASE v_type
      WHEN 'hero' THEN
        v_heroes := v_heroes + 1;
        IF v_section ? 'button' AND NOT public.landing_button_is_valid(v_section->'button') THEN
          RETURN format('The button of section %s needs a site path, an http(s) URL or an email address', v_n);
        END IF;
      WHEN 'text' THEN
        IF v_section->>'imageSide' IS NULL OR v_section->>'imageSide' NOT IN ('start', 'end') THEN
          RETURN format('Section %s needs its picture side, start or end', v_n);
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
          RETURN format('The button of section %s needs a site path, an http(s) URL or an email address', v_n);
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
          RETURN format('Section %s needs its arrangement: feature, pair, row or showcase', v_n);
        END IF;
        IF jsonb_typeof(v_section->'testimonialIds') IS DISTINCT FROM 'array' THEN
          RETURN format('Section %s needs its testimonials, as a list of ids', v_n);
        END IF;
        v_item_ids := ARRAY[]::text[];
        FOR v_item IN SELECT e FROM jsonb_array_elements(v_section->'testimonialIds') AS t(e) LOOP
          IF jsonb_typeof(v_item) IS DISTINCT FROM 'string' OR v_item #>> '{}' !~ c_uuid THEN
            RETURN format('Every testimonial of section %s must be a testimonial''s lowercase uuid', v_n);
          END IF;
          IF v_item #>> '{}' = ANY (v_item_ids) THEN
            RETURN format('Section %s names the testimonial %s twice', v_n, v_item #>> '{}');
          END IF;
          v_item_ids := array_append(v_item_ids, v_item #>> '{}');
        END LOOP;
        v_count := jsonb_array_length(v_section->'testimonialIds');
        IF v_count <> v_slots THEN
          RETURN format('Section %s: a %s arrangement shows exactly %s %s; this section has %s',
                        v_n, v_section->>'arrangement', v_slots,
                        CASE WHEN v_slots = 1 THEN 'testimonial' ELSE 'testimonials' END,
                        v_count);
        END IF;
      WHEN 'products' THEN
        -- At least one pick and no upper bound: the carousel scrolls.
        IF jsonb_typeof(v_section->'productIds') IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_section->'productIds') = 0 THEN
          RETURN format('Section %s needs at least one product', v_n);
        END IF;
        v_item_ids := ARRAY[]::text[];
        FOR v_item IN SELECT e FROM jsonb_array_elements(v_section->'productIds') AS t(e) LOOP
          IF jsonb_typeof(v_item) IS DISTINCT FROM 'string' OR v_item #>> '{}' !~ c_uuid THEN
            RETURN format('Every product of section %s must be a product''s lowercase uuid', v_n);
          END IF;
          IF v_item #>> '{}' = ANY (v_item_ids) THEN
            RETURN format('Section %s names the product %s twice', v_n, v_item #>> '{}');
          END IF;
          v_item_ids := array_append(v_item_ids, v_item #>> '{}');
        END LOOP;
      WHEN 'guide' THEN
        IF jsonb_typeof(v_section->'guideId') IS DISTINCT FROM 'string'
           OR v_section->>'guideId' !~ c_uuid THEN
          RETURN format('Section %s needs its guide, as a guide''s lowercase uuid', v_n);
        END IF;
      WHEN 'subscribe' THEN
        -- No shared field but its background and its sticky side: the list it
        -- signs up to is the deployment's configuration, not the page's.
        NULL;
      ELSE
        RETURN format('Section %s has no type a landing page knows (%s)', v_n, COALESCE(v_type, 'none'));
    END CASE;

    -- The ground a section sits on: every type but the hero may name one, and
    -- a section without one sits on the page's own ground.
    IF v_section ? 'background' THEN
      IF v_type = 'hero' THEN
        RETURN 'The hero section takes no background';
      END IF;
      IF jsonb_typeof(v_section->'background') IS DISTINCT FROM 'string'
         OR v_section->>'background' NOT IN ('default', 'card') THEN
        RETURN format('The background of section %s is default or card', v_n);
      END IF;
    END IF;

    IF v_key IS NOT NULL THEN
      IF jsonb_typeof(v_section->v_key) IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_section->v_key) NOT BETWEEN v_min AND v_max THEN
        RETURN format('Section %s needs between %s and %s %s', v_n, v_min, v_max, v_key);
      END IF;

      v_item_ids := ARRAY[]::text[];
      FOR v_item IN SELECT e FROM jsonb_array_elements(v_section->v_key) AS t(e) LOOP
        IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
           OR jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string'
           OR v_item->>'id' !~ c_uuid THEN
          RETURN format('Every one of the %s of section %s needs a lowercase uuid as its id', v_key, v_n);
        END IF;
        IF v_item->>'id' = ANY (v_item_ids) THEN
          RETURN format('Two of the %s of section %s share the id %s', v_key, v_n, v_item->>'id');
        END IF;
        v_item_ids := array_append(v_item_ids, v_item->>'id');

        IF v_field = 'imageId'
           AND (jsonb_typeof(v_item->'imageId') IS DISTINCT FROM 'string'
                OR v_item->>'imageId' !~ c_uuid) THEN
          RETURN format('Every picture of section %s must be a catalogue entry''s lowercase uuid', v_n);
        END IF;
        IF v_field = 'icon' AND NOT public.landing_text_is_written(v_item->'icon') THEN
          RETURN format('Every item of section %s needs an icon', v_n);
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

COMMENT ON FUNCTION public.landing_sections_problem(p_sections jsonb) IS 'What is wrong with a landing page''s section structure, in a sentence for the admin, or NULL when nothing is. A section is named by its number from one, the hero being 1, never by its id. The structure is a JSON array of sections, each {id, type, ...shared fields, sticky?}, ids lowercase uuids distinct within the page; the first is the page''s one hero. Per type: hero {imageId?, button?}, which takes no background; text {imageId?, imageSide: start|end}; image {images: 1-4 of {id, imageId}}; points {items: 2-6 of {id, icon}}; steps {items: 2-6 of {id}}; testimonials {arrangement: feature|pair|row|showcase, testimonialIds: exactly 1, 2, 3 or 6 distinct testimonial uuids, by arrangement}; products {productIds: 1 or more distinct product uuids, no upper bound}; guide {guideId: a guide uuid, imageId?}; faq {items: 1-20 of {id}}; subscribe {} (no shared field but the background and the sticky side); cta {button}. Every type but the hero also takes background?: default|card, absent read as default. sticky, left or right, marks a sticky section and its side, at most one on each side, and only a guide, subscribe or cta section may carry it — the section modules that say sticky: true, held equal by a DB test. Item ids are lowercase uuids distinct within their section. A button is checked by landing_button_is_valid. The curated icon list and the text fields are the application''s to check; whether a picture exists, is a landing picture and is a shape its section takes is apply_landing_pictures''; whether a placed testimonial, a picked product or a placed guide exists is check_landing_section_picks''. The TypeScript structure schema in src/lib/landing-pages/sections/ states the testimonials counts, the backgrounds and the sticky rules too, and DB tests hold the two equal, the sticky refusals word for word.';

REVOKE ALL ON FUNCTION public.landing_sections_problem(p_sections jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_sections_problem(p_sections jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_landing_pictures() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_section  jsonb;
  v_n        bigint;
  v_ref      text;
  v_path     text;
  v_purpose  public.catalogue_image_purpose;
  v_first    public.catalogue_image_purpose;
  v_takes    public.catalogue_image_purpose[];
  v_pictures jsonb := '{}'::jsonb;
  v_share    uuid;
  v_shares   uuid[];
BEGIN
  IF jsonb_typeof(NEW.sections) = 'array' THEN
    FOR v_section, v_n IN
      SELECT s.e, s.n FROM jsonb_array_elements(NEW.sections) WITH ORDINALITY AS s(e, n) ORDER BY s.n
    LOOP
      -- The shapes this section's type takes. Held equal to the section
      -- registry's declaration by a DB test.
      v_takes := CASE v_section->>'type'
        WHEN 'hero' THEN ARRAY['landing_image']::public.catalogue_image_purpose[]
        WHEN 'guide' THEN ARRAY['landing_image']::public.catalogue_image_purpose[]
        ELSE ARRAY['landing_image', 'landing_square_image', 'landing_portrait_image']::public.catalogue_image_purpose[]
      END;
      v_first := NULL;

      FOR v_ref IN
        SELECT r.ref FROM (
          SELECT v_section->>'imageId' AS ref, 0::bigint AS n
           WHERE jsonb_typeof(v_section->'imageId') = 'string'
          UNION ALL
          SELECT i.e->>'imageId', i.n
            FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(v_section->'images') = 'array' THEN v_section->'images' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS i(e, n)
           WHERE jsonb_typeof(i.e->'imageId') = 'string'
        ) AS r
        ORDER BY r.n
      LOOP
        v_path := NULL;
        IF v_ref ~ c_uuid THEN
          -- Locked so a removal of this entry waits for this save to commit,
          -- and its unlink then sees the rows this save wrote: unlocked, a
          -- removal racing the save leaves a picture named that no longer
          -- exists, which no tool can then clear. A removal locks the entry
          -- before the page, the opposite order, so the two can deadlock in
          -- that same window: one is aborted (40P01) and retried, which is
          -- loud where the dangling picture was silent.
          SELECT path, purpose INTO v_path, v_purpose
            FROM public.catalogue_images
           WHERE id = v_ref::uuid
             FOR KEY SHARE;
        END IF;

        -- The reachable cause is an entry another admin removed after this
        -- one was chosen; saving without the picture would be the worst answer.
        IF v_path IS NULL THEN
          RAISE EXCEPTION 'That picture is no longer in the catalogue (catalogue_images row %)', v_ref
            USING ERRCODE = 'foreign_key_violation';
        END IF;

        -- An entry of another purpose lives in another bucket, cut for
        -- another frame. The uploader and the picker offer only landing
        -- pictures; this refuses loudly the state they cannot produce.
        IF v_purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
          RAISE EXCEPTION 'That picture is a % picture, and a landing page shows only landing pictures (catalogue_images row %)', v_purpose, v_ref
            USING ERRCODE = 'check_violation';
        END IF;

        IF NOT v_purpose = ANY (v_takes) THEN
          RAISE EXCEPTION 'A % section''s picture must be wide 16:9%, and that picture is % (catalogue_images row %)',
            v_section->>'type',
            CASE v_section->>'type' WHEN 'hero' THEN ', because it is the page''s link preview' ELSE '' END,
            CASE v_purpose WHEN 'landing_square_image' THEN 'square 1:1' ELSE 'portrait 4:5' END, v_ref
            USING ERRCODE = 'check_violation';
        END IF;

        -- The section is named by its number from one, as the structure check
        -- names it: an AI app may never have seen its id.
        IF v_first IS NULL THEN
          v_first := v_purpose;
        ELSIF v_purpose <> v_first THEN
          RAISE EXCEPTION 'The pictures of an image section must all be one shape so they line up, and section % has a % picture beside a % one (catalogue_images row %)',
            v_n,
            CASE v_first WHEN 'landing_image' THEN 'wide 16:9' WHEN 'landing_square_image' THEN 'square 1:1' ELSE 'portrait 4:5' END,
            CASE v_purpose WHEN 'landing_image' THEN 'wide 16:9' WHEN 'landing_square_image' THEN 'square 1:1' ELSE 'portrait 4:5' END,
            v_ref
            USING ERRCODE = 'check_violation';
        END IF;

        v_pictures := v_pictures
          || jsonb_build_object(v_ref, jsonb_build_object('path', v_path, 'purpose', v_purpose));
      END LOOP;
    END LOOP;
  END IF;

  -- The copy's versions' share pictures: the working versions for the working
  -- copy, the live ones for the published copy. Each is wide, as the hero's
  -- picture is, because the link preview it stands for is drawn at 16:9.
  -- Read per table, since only the published copy's row has a page_id.
  IF TG_TABLE_NAME = 'landing_pages' THEN
    SELECT array_agg(DISTINCT share_image_id) INTO v_shares
      FROM public.landing_page_translations
     WHERE page_id = NEW.id AND share_image_id IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT share_image_id) INTO v_shares
      FROM public.landing_page_publication_translations
     WHERE page_id = NEW.page_id AND share_image_id IS NOT NULL;
  END IF;

  FOREACH v_share IN ARRAY COALESCE(v_shares, '{}'::uuid[])
  LOOP
    v_path := NULL;
    -- Locked for the same reason as a section's picture.
    SELECT path, purpose INTO v_path, v_purpose
      FROM public.catalogue_images
     WHERE id = v_share
       FOR KEY SHARE;

    IF v_path IS NULL THEN
      RAISE EXCEPTION 'That picture is no longer in the catalogue (catalogue_images row %)', v_share
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
      RAISE EXCEPTION 'That picture is a % picture, and a landing page shows only landing pictures (catalogue_images row %)', v_purpose, v_share
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_purpose <> 'landing_image' THEN
      RAISE EXCEPTION 'A share picture must be wide 16:9, because it is the page''s link preview, and that picture is % (catalogue_images row %)',
        CASE v_purpose WHEN 'landing_square_image' THEN 'square 1:1' ELSE 'portrait 4:5' END, v_share
        USING ERRCODE = 'check_violation';
    END IF;

    v_pictures := v_pictures
      || jsonb_build_object(v_share::text, jsonb_build_object('path', v_path, 'purpose', v_purpose));
  END LOOP;

  NEW.pictures := v_pictures;
  RETURN NEW;
END;
$_$;

COMMENT ON FUNCTION public.apply_landing_pictures() IS 'BEFORE INSERT OR UPDATE on landing_pages and landing_page_publications: pictures is derived from every catalogue entry the copy names (a hero, text or guide section''s imageId, an image section''s images[].imageId, and the share_image_id of each of the copy''s versions), as {entry id: {path, purpose}} — the purpose is the picture''s shape and names its bucket. No branch keeps a statement-supplied value and the triggers carry no column list, so this is the column''s only writer; refresh_landing_pictures re-runs it when a version''s share picture changes. Each entry is locked FOR KEY SHARE, so a racing removal waits and then unlinks what this write stored. Refuses an entry that is gone (23503); one that is not a landing picture (landing_image, landing_square_image or landing_portrait_image); a hero picture or a share picture that is not wide (landing_image), since each is the page''s link preview; a guide section''s picture that is not wide; and a section whose pictures are not all one purpose, naming the section by its number from one (each 23514).';

REVOKE ALL ON FUNCTION public.apply_landing_pictures() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_landing_pictures() TO service_role;

-- The backfill. Every trigger on both copies is held off, so the one change
-- is the background key (the header says why each must not run).
ALTER TABLE public.landing_pages DISABLE TRIGGER landing_pages_updated_at;
ALTER TABLE public.landing_pages DISABLE TRIGGER trg_landing_pages_stamp_saver;
ALTER TABLE public.landing_pages DISABLE TRIGGER trg_landing_pages_cascade_structure;
ALTER TABLE public.landing_pages DISABLE TRIGGER trg_landing_pages_apply_pictures;
ALTER TABLE public.landing_pages DISABLE TRIGGER trg_landing_pages_check_guide_picks;
ALTER TABLE public.landing_pages DISABLE TRIGGER trg_landing_pages_check_product_picks;
ALTER TABLE public.landing_pages DISABLE TRIGGER trg_landing_pages_check_testimonial_picks;
ALTER TABLE public.landing_page_publications DISABLE TRIGGER trg_landing_page_publications_cascade_structure;
ALTER TABLE public.landing_page_publications DISABLE TRIGGER trg_landing_page_publications_apply_pictures;

UPDATE public.landing_pages p
   SET sections = (
     SELECT jsonb_agg(
              CASE WHEN s.e->>'type' <> 'hero' AND NOT s.e ? 'background'
                   THEN s.e || '{"background": "default"}'::jsonb
                   ELSE s.e END
              ORDER BY s.n)
       FROM jsonb_array_elements(p.sections) WITH ORDINALITY AS s(e, n))
 WHERE EXISTS (
   SELECT 1 FROM jsonb_array_elements(p.sections) AS s(e)
    WHERE s.e->>'type' <> 'hero' AND NOT s.e ? 'background');

UPDATE public.landing_page_publications p
   SET sections = (
     SELECT jsonb_agg(
              CASE WHEN s.e->>'type' <> 'hero' AND NOT s.e ? 'background'
                   THEN s.e || '{"background": "default"}'::jsonb
                   ELSE s.e END
              ORDER BY s.n)
       FROM jsonb_array_elements(p.sections) WITH ORDINALITY AS s(e, n))
 WHERE EXISTS (
   SELECT 1 FROM jsonb_array_elements(p.sections) AS s(e)
    WHERE s.e->>'type' <> 'hero' AND NOT s.e ? 'background');

ALTER TABLE public.landing_pages ENABLE TRIGGER landing_pages_updated_at;
ALTER TABLE public.landing_pages ENABLE TRIGGER trg_landing_pages_stamp_saver;
ALTER TABLE public.landing_pages ENABLE TRIGGER trg_landing_pages_cascade_structure;
ALTER TABLE public.landing_pages ENABLE TRIGGER trg_landing_pages_apply_pictures;
ALTER TABLE public.landing_pages ENABLE TRIGGER trg_landing_pages_check_guide_picks;
ALTER TABLE public.landing_pages ENABLE TRIGGER trg_landing_pages_check_product_picks;
ALTER TABLE public.landing_pages ENABLE TRIGGER trg_landing_pages_check_testimonial_picks;
ALTER TABLE public.landing_page_publications ENABLE TRIGGER trg_landing_page_publications_cascade_structure;
ALTER TABLE public.landing_page_publications ENABLE TRIGGER trg_landing_page_publications_apply_pictures;

DO $$
BEGIN
  IF EXISTS (
       SELECT 1
         FROM (SELECT sections FROM public.landing_pages
               UNION ALL
               SELECT sections FROM public.landing_page_publications) AS c,
              jsonb_array_elements(c.sections) AS s(e)
        WHERE s.e->>'type' <> 'hero' AND NOT s.e ? 'background') THEN
    RAISE EXCEPTION 'A landing page section other than the hero is still stored without its background';
  END IF;

  IF EXISTS (
       SELECT 1 FROM pg_trigger
        WHERE tgrelid IN ('public.landing_pages'::regclass, 'public.landing_page_publications'::regclass)
          AND NOT tgisinternal
          AND tgenabled <> 'O') THEN
    RAISE EXCEPTION 'A landing page trigger was left disabled by the background backfill';
  END IF;
END;
$$;

COMMENT ON TABLE public.landing_pages IS 'The WORKING COPY of each landing page — what an admin is editing, which may be saved incomplete: the section structure here, shared by every language, and the words per language in landing_page_translations. The public never reads this table: what is live is the page''s row in landing_page_publications, copied from this one by publish_landing_page. The id is the page''s id address. Admin-only end to end: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are create_landing_page, clone_landing_page, save_landing_page, save_landing_page_structure, save_landing_page_version and remove_landing_page_version, and the catalogue''s repoint_landing_images and removal trigger. No delete: a page that has to come down is unpublished.';

COMMENT ON TABLE public.landing_page_translations IS 'One language version of a landing page''s WORKING COPY — its title, summary, slug and the text of every section in that locale, which may be saved incomplete. At least one per page: save_landing_page refuses an empty set, and remove_landing_page_version refuses to remove the last. The public never reads this table: publishing copies the complete versions to landing_page_publication_translations. Admin-only end to end: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are save_landing_page, which replaces the whole set, save_landing_page_version, which writes one, remove_landing_page_version, which removes one, the structure cascade (cascade_landing_structure), which drops the text of a section the structure no longer holds, and the catalogue''s replace (repoint_landing_images) and removal (unlink_removed_landing_image), which move or unset a version''s share picture.';
