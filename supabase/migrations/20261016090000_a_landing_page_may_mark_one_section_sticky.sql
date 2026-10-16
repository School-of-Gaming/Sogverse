-- A landing page may mark one section sticky.
--
-- WHAT THIS CHANGES
--
-- Any section of a page's structure may carry sticky, left or right: that
-- section is the page's sticky one, drawn on wide screens in a sticky column
-- on that side beside the other sections, and below that at the page's end.
-- landing_sections_problem refuses sticky on any type but subscribe (the email
-- sign-up), a side other than left or right, and a second sticky section. The
-- TypeScript half is the section registry's structure rule, where each type's
-- module says whether it may be sticky; a DB test runs every type through both.
--
-- The flag lives in the sections themselves, so everything that already
-- copies, compares or cascades the structure — publishing, the unpublished
-- changes digest, a structure save that drops a section — carries it with no
-- change, and removing the sticky section is what makes a page have none.
--
-- The function keeps its signature, owner and grants; the grants are restated
-- after the replace all the same.

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
  v_sticky   integer := 0;
  v_key      text;
  v_min      integer;
  v_max      integer;
  v_field    text;
  v_item     jsonb;
  v_item_ids text[];
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

    -- The page's one sticky section, of a type that may be: every type takes
    -- the field, and the types allowed it are the section modules' that say
    -- sticky: true. A DB test holds this list to theirs.
    IF v_section ? 'sticky' THEN
      IF v_type IS DISTINCT FROM 'subscribe' THEN
        RETURN format('Section %s cannot be sticky: only an email sign-up section can', v_id);
      END IF;
      IF jsonb_typeof(v_section->'sticky') IS DISTINCT FROM 'string'
         OR v_section->>'sticky' NOT IN ('left', 'right') THEN
        RETURN format('The sticky side of section %s is left or right', v_id);
      END IF;
      v_sticky := v_sticky + 1;
      IF v_sticky > 1 THEN
        RETURN 'A page has at most one sticky section';
      END IF;
    END IF;

    -- A single picture, where a type takes one, is optional and a uuid.
    IF v_type IN ('hero', 'text') AND v_section ? 'imageId'
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
      WHEN 'subscribe' THEN
        -- No shared field: the list it signs up to and the confirmation mail
        -- are the deployment's configuration, not the page's.
        NULL;
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

COMMENT ON FUNCTION public.landing_sections_problem(p_sections jsonb) IS 'What is wrong with a landing page''s section structure, in a sentence for the admin, or NULL when nothing is. The structure is a JSON array of sections, each {id, type, ...shared fields, sticky?}, ids lowercase uuids distinct within the page; the first is the page''s one hero. Per type: hero {imageId?, button?}; text {imageId?, imageSide: start|end}; image {images: 1-4 of {id, imageId}}; points {items: 2-6 of {id, icon}}; steps {items: 2-6 of {id}}; faq {items: 1-20 of {id}}; cta {button}; subscribe {} (no shared field). sticky, left or right, marks the page''s one sticky section and its side, and only a subscribe section may carry it — the section modules that say sticky: true, held equal by a DB test. Item ids are lowercase uuids distinct within their section. A button is checked by landing_button_is_valid. The curated icon list and the text fields are the application''s to check; whether a picture exists and has the landing_image purpose is apply_landing_image_paths''.';

REVOKE ALL ON FUNCTION public.landing_sections_problem(p_sections jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_sections_problem(p_sections jsonb) TO service_role;
