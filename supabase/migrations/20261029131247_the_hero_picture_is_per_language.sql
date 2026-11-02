-- The hero's picture is per language.
--
-- A hero picture can carry words baked into the art, and it is also each
-- language's link preview when that language names no share picture of its
-- own, so it has to differ per language as the share picture already does. It
-- moves off the page's shared structure and into each language version's
-- words: the hero section's text in a version, beside the hero's imageAlt,
-- carries imageId —
--
--   landing_page_translations.section_texts -> <hero section id> -> imageId
--
-- and the same in the published copy's versions. There is no shared value and
-- no fallback: a language that names no hero picture shows none. The hero in
-- the structure takes no picture any more, and the structure check refuses
-- one. Text, image and guide sections keep their pictures in the structure.
--
-- THE CATALOGUE'S GUARANTEES
--
-- A version's hero picture rides the mechanism the share picture uses:
--
-- * apply_landing_pictures derives a copy's pictures from its versions' hero
--   pictures too, refusing one that is not a uuid, is gone (23503), is not a
--   landing picture, or is not wide (23514), and counting it in use while any
--   language of that copy names it.
-- * refresh_landing_pictures re-derives a copy whenever a version's words
--   change the pictures they name, as it does when its share picture changes.
-- * repoint_landing_images and unlink_removed_landing_image move or unset it
--   in the versions of both copies. A removal leaves the hero's alt text in
--   place, as it leaves a share picture's.
-- * landing_version_missing requires a version's hero alt text exactly when
--   that version names a hero picture.
--
-- Publishing, saving and cloning copy and re-key a version's words whole, so
-- the picture rides along with no change of their own.
--
-- ACCESS
--
-- No new function, table or grant: every function here is replaced in place
-- with its signature unchanged, which keeps its grants.

-- ---------------------------------------------------------------------------
-- 1. The structure takes no hero picture
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
    IF v_type IN ('text', 'guide') AND v_section ? 'imageId'
       AND (jsonb_typeof(v_section->'imageId') IS DISTINCT FROM 'string'
            OR v_section->>'imageId' !~ c_uuid) THEN
      RETURN format('The picture of section %s must be a catalogue entry''s lowercase uuid', v_n);
    END IF;

    v_key := NULL;

    CASE v_type
      WHEN 'hero' THEN
        v_heroes := v_heroes + 1;
        -- Each language version names its own hero picture, in its words.
        IF v_section ? 'imageId' THEN
          RETURN 'The hero section takes no picture in the structure: each language version names its own';
        END IF;
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

    -- The ground a section sits on: every type but the hero names one, and
    -- the hero takes none.
    IF v_type = 'hero' THEN
      IF v_section ? 'background' THEN
        RETURN 'The hero section takes no background';
      END IF;
    ELSIF jsonb_typeof(v_section->'background') IS DISTINCT FROM 'string'
          OR v_section->>'background' NOT IN ('default', 'card') THEN
      RETURN format('Section %s needs its background, default or card', v_n);
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

COMMENT ON FUNCTION public.landing_sections_problem(p_sections jsonb) IS 'What is wrong with a landing page''s section structure, in a sentence for the admin, or NULL when nothing is. A section is named by its number from one, the hero being 1, never by its id. The structure is a JSON array of sections, each {id, type, ...shared fields, sticky?}, ids lowercase uuids distinct within the page; the first is the page''s one hero. Per type: hero {button?}, which takes no background and no picture (each language version names its own hero picture in its words, and an imageId on the hero is refused); text {imageId?, imageSide: start|end}; image {images: 1-4 of {id, imageId}}; points {items: 2-6 of {id, icon}}; steps {items: 2-6 of {id}}; testimonials {arrangement: feature|pair|row|showcase, testimonialIds: exactly 1, 2, 3 or 6 distinct testimonial uuids, by arrangement}; products {productIds: 1 or more distinct product uuids, no upper bound}; guide {guideId: a guide uuid, imageId?}; faq {items: 1-20 of {id}}; subscribe {} (no shared field but the background and the sticky side); cta {button}. Every type but the hero also takes background: default|card, which it must carry. sticky, left or right, marks a sticky section and its side, at most one on each side, and only a guide, subscribe or cta section may carry it — the section modules that say sticky: true, held equal by a DB test. Item ids are lowercase uuids distinct within their section. A button is checked by landing_button_is_valid. The curated icon list and the text fields are the application''s to check; whether a picture exists, is a landing picture and is a shape its section takes is apply_landing_pictures''; whether a placed testimonial, a picked product or a placed guide exists is check_landing_section_picks''. The TypeScript structure schema in src/lib/landing-pages/sections/ states the testimonials counts, the backgrounds and the sticky rules too, and DB tests hold the two equal, the sticky refusals word for word.';

-- ---------------------------------------------------------------------------
-- 2. A version's hero alt text is required with its own hero picture
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
        -- The hero's picture is this version's own, in its words.
        IF v_texts ? 'imageId' AND NOT public.landing_text_is_written(v_texts->'imageAlt') THEN
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
      WHEN 'testimonials' THEN
        -- Its eyebrow, heading and intro are all optional: a testimonials
        -- section never makes a version incomplete.
        NULL;
      WHEN 'products' THEN
        -- Its eyebrow, heading and intro are all optional: a products section
        -- never makes a version incomplete.
        NULL;
      WHEN 'guide' THEN
        IF NOT public.landing_text_is_written(v_texts->'heading') THEN
          v_missing := array_append(v_missing, v_prefix || 'heading');
        END IF;
        IF v_section ? 'imageId' AND NOT public.landing_text_is_written(v_texts->'imageAlt') THEN
          v_missing := array_append(v_missing, v_prefix || 'imageAlt');
        END IF;
      WHEN 'cta', 'subscribe' THEN
        IF NOT public.landing_text_is_written(v_texts->'heading') THEN
          v_missing := array_append(v_missing, v_prefix || 'heading');
        END IF;
        IF NOT public.landing_text_is_written(v_texts->'buttonLabel') THEN
          v_missing := array_append(v_missing, v_prefix || 'buttonLabel');
        END IF;
      ELSE
        NULL;
    END CASE;
  END LOOP;

  RETURN v_missing;
END;
$$;

COMMENT ON FUNCTION public.landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb) IS 'The SQL half of the landing pages'' required-text rule: what one language version still needs before publishing takes it, given the page''s structure, as a list of paths — title, summary, slug, then per section in order sections.<id>.<field>, sections.<id>.items.<item id>.<field> or sections.<id>.alts.<picture item id>. Empty means complete. Required: hero headline, its buttonLabel when it has a button and its imageAlt when this version''s hero words name a picture (an imageId key); text heading, body and imageAlt with a picture; image an alt per picture; points and steps heading and each item''s title and body; testimonials nothing; products nothing; guide heading and imageAlt with a picture; faq heading and each item''s question and answer; cta and subscribe heading and buttonLabel. Written means landing_text_is_written. The TypeScript rule in src/lib/landing-pages/sections/ is the other half, and a DB test holds the two equal.';

-- ---------------------------------------------------------------------------
-- 3. A copy's pictures include its versions' hero pictures
-- ---------------------------------------------------------------------------

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
  v_words    text;
  v_beside   text;
  v_pictures jsonb := '{}'::jsonb;
  v_hero     text;
  v_named    jsonb;
  v_name     jsonb;
BEGIN
  IF jsonb_typeof(NEW.sections) = 'array' THEN
    FOR v_section, v_n IN
      SELECT s.e, s.n FROM jsonb_array_elements(NEW.sections) WITH ORDINALITY AS s(e, n) ORDER BY s.n
    LOOP
      -- The shapes this section's type takes. Held equal to the section
      -- registry's declaration by a DB test. The hero takes its picture in
      -- each version's words, read below.
      v_takes := CASE v_section->>'type'
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

        -- Reached by an id an AI app sent that no entry has, and by an entry
        -- another admin removed after this one was chosen; saving without the
        -- picture would be the worst answer. The refusal says only that no
        -- entry has the id, which is true of both.
        IF v_path IS NULL THEN
          RAISE EXCEPTION 'No picture in the catalogue has the id %', v_ref
            USING ERRCODE = 'foreign_key_violation';
        END IF;

        -- An entry of another purpose lives in another bucket, cut for
        -- another frame. The uploader and the picker offer only landing
        -- pictures; this refuses loudly the state they cannot produce.
        IF v_purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
          CASE v_purpose
            WHEN 'product' THEN v_words := 'a product picture';
            WHEN 'library_cover' THEN v_words := 'a Library cover';
            WHEN 'spotlight_image' THEN v_words := 'a spotlight picture';
            ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
          END CASE;
          RAISE EXCEPTION 'The picture % is %, and a landing page shows only landing pictures',
            v_ref, v_words
            USING ERRCODE = 'check_violation';
        END IF;

        IF NOT v_purpose = ANY (v_takes) THEN
          CASE v_purpose
            WHEN 'landing_square_image' THEN v_words := 'square 1:1';
            WHEN 'landing_portrait_image' THEN v_words := 'portrait 4:5';
            ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
          END CASE;
          RAISE EXCEPTION 'A % section''s picture must be wide 16:9, and the picture % is %',
            v_section->>'type', v_ref, v_words
            USING ERRCODE = 'check_violation';
        END IF;

        -- The section is named by its number from one, as the structure check
        -- names it: an AI app may never have seen its id.
        IF v_first IS NULL THEN
          v_first := v_purpose;
        ELSIF v_purpose <> v_first THEN
          CASE v_purpose
            WHEN 'landing_image' THEN v_words := 'wide 16:9';
            WHEN 'landing_square_image' THEN v_words := 'square 1:1';
            WHEN 'landing_portrait_image' THEN v_words := 'portrait 4:5';
            ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
          END CASE;
          CASE v_first
            WHEN 'landing_image' THEN v_beside := 'wide 16:9';
            WHEN 'landing_square_image' THEN v_beside := 'square 1:1';
            WHEN 'landing_portrait_image' THEN v_beside := 'portrait 4:5';
            ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_first;
          END CASE;
          RAISE EXCEPTION 'The pictures of an image section must all be one shape so they line up, and in section % the picture % is % beside a % one',
            v_n, v_ref, v_words, v_beside
            USING ERRCODE = 'check_violation';
        END IF;

        v_pictures := v_pictures
          || jsonb_build_object(v_ref, jsonb_build_object('path', v_path, 'purpose', v_purpose));
      END LOOP;
    END LOOP;
  END IF;

  -- The pictures the copy's versions name, each in its own words: the working
  -- versions for the working copy, the live ones for the published copy. A
  -- version names a share picture and a hero picture, the hero's in the hero
  -- section's words; the hero is the structure's first section. Both are
  -- wide, because each is a link preview, drawn at 16:9. Read per table,
  -- since only the published copy's row has a page_id.
  v_hero := CASE WHEN jsonb_typeof(NEW.sections) = 'array'
                  AND NEW.sections->0->>'type' = 'hero'
                 THEN NEW.sections->0->>'id' END;

  IF TG_TABLE_NAME = 'landing_pages' THEN
    SELECT COALESCE(jsonb_agg(named.n ORDER BY named.n->>'locale', named.n->>'kind'), '[]'::jsonb) INTO v_named
      FROM (
        SELECT jsonb_build_object('locale', t.locale, 'kind', 'hero', 'ref', t.section_texts->v_hero->'imageId') AS n
          FROM public.landing_page_translations t
         WHERE t.page_id = NEW.id AND t.section_texts->v_hero ? 'imageId'
        UNION ALL
        SELECT jsonb_build_object('locale', t.locale, 'kind', 'share', 'ref', to_jsonb(t.share_image_id::text))
          FROM public.landing_page_translations t
         WHERE t.page_id = NEW.id AND t.share_image_id IS NOT NULL
      ) AS named;
  ELSE
    SELECT COALESCE(jsonb_agg(named.n ORDER BY named.n->>'locale', named.n->>'kind'), '[]'::jsonb) INTO v_named
      FROM (
        SELECT jsonb_build_object('locale', t.locale, 'kind', 'hero', 'ref', t.section_texts->v_hero->'imageId') AS n
          FROM public.landing_page_publication_translations t
         WHERE t.page_id = NEW.page_id AND t.section_texts->v_hero ? 'imageId'
        UNION ALL
        SELECT jsonb_build_object('locale', t.locale, 'kind', 'share', 'ref', to_jsonb(t.share_image_id::text))
          FROM public.landing_page_publication_translations t
         WHERE t.page_id = NEW.page_id AND t.share_image_id IS NOT NULL
      ) AS named;
  END IF;

  FOR v_name IN SELECT e FROM jsonb_array_elements(v_named) AS t(e)
  LOOP
    -- A share picture is a uuid column; a hero picture is in the words, which
    -- hold any JSON, so its form is checked here.
    IF jsonb_typeof(v_name->'ref') IS DISTINCT FROM 'string' OR v_name->>'ref' !~ c_uuid THEN
      RAISE EXCEPTION 'The hero picture of the % version must be a catalogue entry''s lowercase uuid',
        v_name->>'locale'
        USING ERRCODE = 'check_violation';
    END IF;
    v_ref := v_name->>'ref';

    v_path := NULL;
    -- Locked for the same reason as a section's picture.
    SELECT path, purpose INTO v_path, v_purpose
      FROM public.catalogue_images
     WHERE id = v_ref::uuid
       FOR KEY SHARE;

    IF v_path IS NULL THEN
      RAISE EXCEPTION 'No picture in the catalogue has the id %', v_ref
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
      CASE v_purpose
        WHEN 'product' THEN v_words := 'a product picture';
        WHEN 'library_cover' THEN v_words := 'a Library cover';
        WHEN 'spotlight_image' THEN v_words := 'a spotlight picture';
        ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
      END CASE;
      RAISE EXCEPTION 'The picture % is %, and a landing page shows only landing pictures',
        v_ref, v_words
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_purpose <> 'landing_image' THEN
      CASE v_purpose
        WHEN 'landing_square_image' THEN v_words := 'square 1:1';
        WHEN 'landing_portrait_image' THEN v_words := 'portrait 4:5';
        ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
      END CASE;
      IF v_name->>'kind' = 'hero' THEN
        RAISE EXCEPTION 'A hero section''s picture must be wide 16:9, because it is the page''s link preview, and the picture % is %',
          v_ref, v_words
          USING ERRCODE = 'check_violation';
      END IF;
      RAISE EXCEPTION 'A share picture must be wide 16:9, because it is the page''s link preview, and the picture % is %',
        v_ref, v_words
        USING ERRCODE = 'check_violation';
    END IF;

    v_pictures := v_pictures
      || jsonb_build_object(v_ref, jsonb_build_object('path', v_path, 'purpose', v_purpose));
  END LOOP;

  NEW.pictures := v_pictures;
  RETURN NEW;
END;
$_$;

COMMENT ON FUNCTION public.apply_landing_pictures() IS 'BEFORE INSERT OR UPDATE on landing_pages and landing_page_publications: pictures is derived from every catalogue entry the copy names (a text or guide section''s imageId, an image section''s images[].imageId, and of each of the copy''s versions its share_image_id and its hero picture — the imageId in its words for the structure''s first section, the hero), as {entry id: {path, purpose}} — the purpose is the picture''s shape and names its bucket. No branch keeps a statement-supplied value and the triggers carry no column list, so this is the column''s only writer; refresh_landing_pictures re-runs it when a version''s share picture or hero picture changes. Each entry is locked FOR KEY SHARE, so a racing removal waits and then unlinks what this write stored. Refuses a version''s hero picture that is not a lowercase uuid string, naming the version''s locale (23514); an entry that is gone (23503); one that is not a landing picture (landing_image, landing_square_image or landing_portrait_image); a hero picture or a share picture that is not wide (landing_image), since each is a link preview; a guide section''s picture that is not wide; and a section whose pictures are not all one purpose, naming the section by its number from one (each 23514). Each refusal of an entry names it by its catalogue id, the id the writer sent.';

CREATE OR REPLACE FUNCTION public.refresh_landing_pictures() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_page uuid;
BEGIN
  -- The pictures a version's words name: its hero picture, read without the
  -- structure, since only the hero's words carry an imageId.
  IF TG_OP = 'INSERT' THEN
    IF NEW.share_image_id IS NULL
       AND jsonb_path_query_array(NEW.section_texts, '$.*.imageId') = '[]'::jsonb THEN
      RETURN NULL;
    END IF;
    v_page := NEW.page_id;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.share_image_id IS NULL
       AND jsonb_path_query_array(OLD.section_texts, '$.*.imageId') = '[]'::jsonb THEN
      RETURN NULL;
    END IF;
    v_page := OLD.page_id;
  ELSE
    IF NEW.share_image_id IS NOT DISTINCT FROM OLD.share_image_id
       AND jsonb_path_query_array(NEW.section_texts, '$.*.imageId')
           = jsonb_path_query_array(OLD.section_texts, '$.*.imageId') THEN
      RETURN NULL;
    END IF;
    v_page := NEW.page_id;
  END IF;

  -- A version removed with its copy (an unpublish's cascade) finds no row.
  IF TG_TABLE_NAME = 'landing_page_translations' THEN
    UPDATE public.landing_pages SET pictures = pictures WHERE id = v_page;
  ELSE
    UPDATE public.landing_page_publications SET pictures = pictures WHERE page_id = v_page;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.refresh_landing_pictures() IS 'AFTER INSERT, UPDATE OF share_image_id or section_texts, or DELETE on landing_page_translations and landing_page_publication_translations: when a version''s share picture or hero picture (the imageId in its words) is added, changed or removed (with its version or alone), touches the copy''s row so apply_landing_pictures re-derives the copy''s pictures. That is what makes a picture named by one language alone count as in use, refuses one that is gone, not a landing picture or not wide at the version''s write, and lets it stop counting when no version names it. A write of the words that leaves their pictures as they were touches nothing.';

DROP TRIGGER trg_landing_page_translations_refresh_pictures ON public.landing_page_translations;
CREATE TRIGGER trg_landing_page_translations_refresh_pictures
  AFTER INSERT OR DELETE OR UPDATE OF share_image_id, section_texts ON public.landing_page_translations
  FOR EACH ROW EXECUTE FUNCTION public.refresh_landing_pictures();

DROP TRIGGER trg_landing_page_publication_translations_refresh_pictures ON public.landing_page_publication_translations;
CREATE TRIGGER trg_landing_page_publication_translations_refresh_pictures
  AFTER INSERT OR DELETE OR UPDATE OF share_image_id, section_texts ON public.landing_page_publication_translations
  FOR EACH ROW EXECUTE FUNCTION public.refresh_landing_pictures();

-- ---------------------------------------------------------------------------
-- 4. The catalogue's replace and removal reach every version's hero picture
-- ---------------------------------------------------------------------------

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

  -- pictures names every version's share and hero pictures as well as the
  -- sections' pictures, so a copy whose only use of p_from is in a version is
  -- found and counted too; sections is set either way, which moves the
  -- working copy's last-saved time and saver as for any picture.
  WITH drafts AS (
    UPDATE public.landing_pages
       SET sections = public.landing_sections_repointed(sections, p_from, p_to)
     WHERE pictures ? p_from::text
    RETURNING id
  ),
  live AS (
    UPDATE public.landing_page_publications
       SET sections = public.landing_sections_repointed(sections, p_from, p_to)
     WHERE pictures ? p_from::text
    RETURNING page_id
  )
  SELECT count(*) INTO v_moved
    FROM (SELECT id FROM drafts UNION SELECT page_id FROM live) AS moved;

  -- The versions' pictures, once the copies have been found by them: each
  -- language's hero picture, in the words of the structure's first section,
  -- and its share picture. Each version moved re-derives its copy's
  -- pictures, which refuses a p_to that is gone, not a landing picture or
  -- not wide.
  UPDATE public.landing_page_translations AS t
     SET section_texts = jsonb_set(t.section_texts, ARRAY[p.sections->0->>'id', 'imageId'], to_jsonb(p_to::text))
    FROM public.landing_pages AS p
   WHERE p.id = t.page_id
     AND t.section_texts #>> ARRAY[p.sections->0->>'id', 'imageId'] = p_from::text;

  UPDATE public.landing_page_publication_translations AS t
     SET section_texts = jsonb_set(t.section_texts, ARRAY[p.sections->0->>'id', 'imageId'], to_jsonb(p_to::text))
    FROM public.landing_page_publications AS p
   WHERE p.page_id = t.page_id
     AND t.section_texts #>> ARRAY[p.sections->0->>'id', 'imageId'] = p_from::text;

  UPDATE public.landing_page_translations
     SET share_image_id = p_to
   WHERE share_image_id = p_from;

  UPDATE public.landing_page_publication_translations
     SET share_image_id = p_to
   WHERE share_image_id = p_from;

  RETURN v_moved;
END;
$$;

COMMENT ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) IS 'Admin-gated landing half of the image catalogue''s replace: points every landing page picture that is entry p_from — in the sections, or as any language''s hero picture (in its words) or share picture, working and published copies alike — at entry p_to, and returns how many pages moved (a page whose two copies both moved counts once). A live page''s picture changes without a republish. The catalogue''s replace hands it an entry of p_from''s own purpose, so a picture keeps its shape; the picture triggers re-derive each copy''s pictures and refuse a p_to that is gone, not a landing picture, or of a shape its section, a hero or a share picture does not take. Either argument NULL raises null_value_not_allowed. SECURITY DEFINER because no landing page table carries a write grant.';

CREATE OR REPLACE FUNCTION public.unlink_removed_landing_image() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
    RETURN OLD;
  END IF;

  -- Taken out of both copies' sections first, then out of their versions'
  -- hero and share pictures, whose unset re-derives each copy without the
  -- entry; the structure trigger drops the text of an image section this
  -- leaves with no picture. The copies are found by their pictures before
  -- the versions' are unset, so a working copy whose only use was in a
  -- version moves its last-saved time too.
  UPDATE public.landing_pages
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE pictures ? OLD.id::text;

  UPDATE public.landing_page_publications
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE pictures ? OLD.id::text;

  -- A hero picture that was this entry is unset in that language's words, as
  -- a share picture is below; the hero's alt text stays, as the share
  -- picture's does, and is no longer required.
  UPDATE public.landing_page_translations AS t
     SET section_texts = t.section_texts #- ARRAY[p.sections->0->>'id', 'imageId']
    FROM public.landing_pages AS p
   WHERE p.id = t.page_id
     AND t.section_texts #>> ARRAY[p.sections->0->>'id', 'imageId'] = OLD.id::text;

  UPDATE public.landing_page_publication_translations AS t
     SET section_texts = t.section_texts #- ARRAY[p.sections->0->>'id', 'imageId']
    FROM public.landing_page_publications AS p
   WHERE p.page_id = t.page_id
     AND t.section_texts #>> ARRAY[p.sections->0->>'id', 'imageId'] = OLD.id::text;

  -- A share picture that was this entry is unset, and that language's preview
  -- falls back to its hero's picture, when it still names one.
  UPDATE public.landing_page_translations
     SET share_image_id = NULL
   WHERE share_image_id = OLD.id;

  UPDATE public.landing_page_publication_translations
     SET share_image_id = NULL
   WHERE share_image_id = OLD.id;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.unlink_removed_landing_image() IS 'BEFORE DELETE on catalogue_images: the landing pages'' half of a removal, standing in for the foreign key a picture inside JSON cannot have. Takes a removed landing picture entry, of any of the three landing purposes, out of every landing page, working and published copies alike, as a cover''s SET NULL does: a text or guide section loses its picture, an image section loses that picture, an image section left with none is dropped with its text, a language''s hero picture is unset in its words (its alt text kept), and a language''s share picture is unset, so that language''s link preview falls back to its hero''s picture. A live page changes without a republish; the working copy''s updated_at and saver move, as a cover removal''s do. SECURITY DEFINER because the remover is an admin''s own session and no landing page table carries a write grant.';

-- ---------------------------------------------------------------------------
-- 5. Comments on the version writer and the columns
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) IS 'Internal: validates and upserts one language version of a landing page''s working copy, for save_landing_page and save_landing_page_version, which have already locked the page row. A blank or over-long title, an over-long summary or share title, or text for a section the page does not have raises check_violation; section texts, or one section''s text, that are not an object raise 22023. The slug is p_slug when sent, else the stored one, else p_default_slug (the application''s derivation from the title), else unwritten; it may differ from the page''s own live slug, which changes at the next publish. A malformed or uuid-shaped one raises check_violation, and one another page holds in that locale, working or live, raises unique_violation naming that page by its title. The share title, share picture and share picture alt text are written as sent, NULL as the empty string or no picture: like the words, a write carries the whole of what the version holds. The version''s hero picture is the imageId in the hero section''s words. A share or hero picture that is gone raises foreign_key_violation, and one that is not a wide landing picture (landing_image), or a hero picture that is not a lowercase uuid string, check_violation. Carries no guard: not granted to any Data API role.';

COMMENT ON COLUMN public.landing_page_translations.section_texts IS 'The text of each section in this language, as {section id: {field: text, ...}}. A key names a section of the page''s structure; the text of a section the structure drops is dropped with it. The hero section''s words also carry this language''s hero picture, as imageId: a wide landing picture''s catalogue id, absent for none — the pictures apply_landing_pictures derives, the catalogue''s replace moves and its removal unsets. Which fields each section type has, and which are required, is the application''s section registry; landing_version_missing is the SQL half of the required rule.';

COMMENT ON COLUMN public.landing_page_translations.share_image_id IS 'The share picture in this language: a wide 16:9 landing picture (a landing_image catalogue entry) the link preview shows in place of this language''s hero picture, or NULL to use that. No foreign key, as for the pictures in sections: the copy''s pictures names it (apply_landing_pictures, kept current by refresh_landing_pictures), which refuses an entry that is gone, not a landing picture or not wide, and the catalogue''s replace moves it and its removal unsets it.';

COMMENT ON COLUMN public.landing_page_publication_translations.share_image_id IS 'The live share picture in this language, copied by publishing, or NULL to use this language''s hero picture. The catalogue''s replace and removal change it without a republish, as they do the pictures in sections and in the words.';

COMMENT ON TABLE public.landing_page_translations IS 'One language version of a landing page''s WORKING COPY — its title, summary, slug and the text of every section in that locale, its hero picture among them, which may be saved incomplete. At least one per page: save_landing_page refuses an empty set, and remove_landing_page_version refuses to remove the last. The public never reads this table: publishing copies the complete versions to landing_page_publication_translations. Admin-only end to end: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are save_landing_page, which writes a new page''s set, save_landing_page_version, which writes one, remove_landing_page_version, which removes one, the structure cascade (cascade_landing_structure), which drops the text of a section the structure no longer holds, and the catalogue''s replace (repoint_landing_images) and removal (unlink_removed_landing_image), which move or unset a version''s hero picture and share picture.';

COMMENT ON COLUMN public.landing_pages.pictures IS 'Each catalogue entry the sections and every version''s hero picture and share picture show, as {entry id: {"path": object name in its purpose''s bucket, "purpose": landing_image (wide 16:9), landing_square_image (square 1:1) or landing_portrait_image (portrait 4:5)}}, derived by apply_landing_pictures and never written by anything else.';

COMMENT ON COLUMN public.landing_page_publications.pictures IS 'Each catalogue entry the live sections and every live version''s hero picture and share picture show, as {entry id: {"path", "purpose"}}, derived by apply_landing_pictures — what the public pages paint, and the shape each picture''s box is reserved at, readable without reading the admin-only catalogue.';

COMMENT ON TABLE public.catalogue_images IS 'The catalogue of pictures admins pick from for content: product pictures, Library article covers, landing page pictures (in three shapes) and spotlight pictures, each entry marked with its purpose. One row per distinct image per purpose, identified by the sha256 of its bytes; the object key is <sha256>.<ext> in the public bucket of the entry''s purpose (product-images, library-covers, landing-images, landing-square-images, landing-portrait-images or spotlight-images). A row is immutable except for its label — the bytes behind a path never change, which is what makes the image optimizer''s one-year cache floor safe. Admin-only: no anon grant and no anon policy, because nothing family-facing reads this table. Products reference it by products.image_id, Library article copies by cover_image_id, landing page copies by the image ids in their sections and in their versions'' hero words and share_image_id, and spotlights by spotlights.image_id; the served products.image_path, cover_path, a landing page copy''s pictures and spotlights.image_path are derived from those links by triggers and are what every reader reads.';

-- ---------------------------------------------------------------------------
-- 6. Every page's hero picture moves into each of its versions
-- ---------------------------------------------------------------------------
--
-- Each version, working and live, takes the hero picture its copy's structure
-- names; then the structures let it go. The words are written first, so each
-- copy's pictures are re-derived with the picture still named and never lose
-- it. Completeness is unchanged: a version needed the hero's alt text exactly
-- when its structure had a picture, and now needs it exactly when its words
-- do, which are the same versions. Moving the picture is not an admin's save,
-- so the working copy's last-saved time and saver are left as they were.

UPDATE public.landing_page_translations AS t
   SET section_texts = jsonb_set(
         t.section_texts,
         ARRAY[p.sections->0->>'id'],
         COALESCE(t.section_texts->(p.sections->0->>'id'), '{}'::jsonb)
           || jsonb_build_object('imageId', p.sections->0->'imageId'))
  FROM public.landing_pages AS p
 WHERE p.id = t.page_id
   AND p.sections->0 ? 'imageId';

UPDATE public.landing_page_publication_translations AS t
   SET section_texts = jsonb_set(
         t.section_texts,
         ARRAY[p.sections->0->>'id'],
         COALESCE(t.section_texts->(p.sections->0->>'id'), '{}'::jsonb)
           || jsonb_build_object('imageId', p.sections->0->'imageId'))
  FROM public.landing_page_publications AS p
 WHERE p.page_id = t.page_id
   AND p.sections->0 ? 'imageId';

ALTER TABLE public.landing_pages DISABLE TRIGGER landing_pages_updated_at;
ALTER TABLE public.landing_pages DISABLE TRIGGER trg_landing_pages_stamp_saver;

UPDATE public.landing_pages
   SET sections = jsonb_set(sections, '{0}', (sections->0) - 'imageId')
 WHERE sections->0 ? 'imageId';

ALTER TABLE public.landing_pages ENABLE TRIGGER landing_pages_updated_at;
ALTER TABLE public.landing_pages ENABLE TRIGGER trg_landing_pages_stamp_saver;

UPDATE public.landing_page_publications
   SET sections = jsonb_set(sections, '{0}', (sections->0) - 'imageId')
 WHERE sections->0 ? 'imageId';

-- ---------------------------------------------------------------------------
-- 7. The end state
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.landing_pages WHERE sections->0 ? 'imageId')
     OR EXISTS (SELECT 1 FROM public.landing_page_publications WHERE sections->0 ? 'imageId') THEN
    RAISE EXCEPTION 'A structure still names a hero picture';
  END IF;

  -- Every version's hero picture is among its copy's pictures.
  IF EXISTS (
    SELECT 1
      FROM public.landing_page_translations AS t
      JOIN public.landing_pages AS p ON p.id = t.page_id
     WHERE t.section_texts->(p.sections->0->>'id') ? 'imageId'
       AND NOT p.pictures ? (t.section_texts #>> ARRAY[p.sections->0->>'id', 'imageId'])
  ) OR EXISTS (
    SELECT 1
      FROM public.landing_page_publication_translations AS t
      JOIN public.landing_page_publications AS p ON p.page_id = t.page_id
     WHERE t.section_texts->(p.sections->0->>'id') ? 'imageId'
       AND NOT p.pictures ? (t.section_texts #>> ARRAY[p.sections->0->>'id', 'imageId'])
  ) THEN
    RAISE EXCEPTION 'A version names a hero picture its copy''s pictures do not';
  END IF;

  -- And every structure's own picture still is.
  IF EXISTS (
    SELECT 1
      FROM public.landing_pages AS p,
           jsonb_array_elements(p.sections) AS s(e)
     WHERE jsonb_typeof(s.e->'imageId') = 'string'
       AND NOT p.pictures ? (s.e->>'imageId')
  ) THEN
    RAISE EXCEPTION 'A section names a picture its copy''s pictures do not';
  END IF;
END;
$$;
