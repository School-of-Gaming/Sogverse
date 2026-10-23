-- A landing page may mark one section sticky on each side.
--
-- WHAT THIS CHANGES
--
-- Any section of a page's structure may carry sticky, left or right: that
-- section is one of the page's sticky ones, drawn on wide screens in a sticky
-- column on that side beside the other sections, and below that at the page's
-- end. A page has at most one on each side, so two at most.
-- landing_sections_problem refuses sticky on any type but subscribe (the email
-- sign-up), a side other than left or right, and a second sticky section on a
-- side that already has one. The
-- TypeScript half is the section registry's structure rule, where each type's
-- module says whether it may be sticky; a DB test runs every type through both.
--
-- The flag lives in the sections themselves, so everything that already
-- copies, compares or cascades the structure — publishing, the unpublished
-- changes digest, a structure save that drops a section — carries it with no
-- change, and removing a sticky section is what unmarks it.
--
-- The function keeps its signature, owner and grants; the grants are restated
-- after the replace all the same. Its body is the current one — testimonials,
-- products, guide and email sign-up sections, picture shapes and backgrounds
-- included — with the sticky rule added.

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
  v_sides    text[] := ARRAY[]::text[];
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

    -- A sticky section, of a type that may be, at most one on each side: every
    -- type takes the field, and the types allowed it are the section modules'
    -- that say sticky: true. A DB test holds this list to theirs.
    IF v_section ? 'sticky' THEN
      IF v_type IS DISTINCT FROM 'subscribe' THEN
        RETURN format('Section %s cannot be sticky: only an email sign-up section can', v_id);
      END IF;
      IF jsonb_typeof(v_section->'sticky') IS DISTINCT FROM 'string'
         OR v_section->>'sticky' NOT IN ('left', 'right') THEN
        RETURN format('The sticky side of section %s is left or right', v_id);
      END IF;
      IF v_section->>'sticky' = ANY (v_sides) THEN
        RETURN 'A page has at most one sticky section on each side';
      END IF;
      v_sides := array_append(v_sides, v_section->>'sticky');
    END IF;

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
      WHEN 'products' THEN
        -- At least one pick and no upper bound: the carousel scrolls.
        IF jsonb_typeof(v_section->'productIds') IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_section->'productIds') = 0 THEN
          RETURN format('Section %s needs at least one product', v_id);
        END IF;
        v_item_ids := ARRAY[]::text[];
        FOR v_item IN SELECT e FROM jsonb_array_elements(v_section->'productIds') AS t(e) LOOP
          IF jsonb_typeof(v_item) IS DISTINCT FROM 'string' OR v_item #>> '{}' !~ c_uuid THEN
            RETURN format('Every product of section %s must be a product''s lowercase uuid', v_id);
          END IF;
          IF v_item #>> '{}' = ANY (v_item_ids) THEN
            RETURN format('Section %s names the product %s twice', v_id, v_item #>> '{}');
          END IF;
          v_item_ids := array_append(v_item_ids, v_item #>> '{}');
        END LOOP;
      WHEN 'guide' THEN
        IF jsonb_typeof(v_section->'guideId') IS DISTINCT FROM 'string'
           OR v_section->>'guideId' !~ c_uuid THEN
          RETURN format('Section %s needs its guide, as a guide''s lowercase uuid', v_id);
        END IF;
      WHEN 'subscribe' THEN
        -- No shared field but its background: the list it signs up to is the
        -- deployment's configuration, not the page's.
        NULL;
      ELSE
        RETURN format('Section %s has no type a landing page knows (%s)', v_id, COALESCE(v_type, 'none'));
    END CASE;

    -- The ground a section sits on: every type but the hero may name one, and
    -- a section without one sits on the page's own ground.
    IF v_section ? 'background' THEN
      IF v_type = 'hero' THEN
        RETURN 'The hero section takes no background';
      END IF;
      IF jsonb_typeof(v_section->'background') IS DISTINCT FROM 'string'
         OR v_section->>'background' NOT IN ('default', 'card') THEN
        RETURN format('The background of section %s is default or card', v_id);
      END IF;
    END IF;

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

COMMENT ON FUNCTION public.landing_sections_problem(p_sections jsonb) IS 'What is wrong with a landing page''s section structure, in a sentence for the admin, or NULL when nothing is. The structure is a JSON array of sections, each {id, type, ...shared fields, sticky?}, ids lowercase uuids distinct within the page; the first is the page''s one hero. Per type: hero {imageId?, button?}, which takes no background; text {imageId?, imageSide: start|end}; image {images: 1-4 of {id, imageId}}; points {items: 2-6 of {id, icon}}; steps {items: 2-6 of {id}}; testimonials {arrangement: feature|pair|row|showcase, testimonialIds: exactly 1, 2, 3 or 6 distinct testimonial uuids, by arrangement}; products {productIds: 1 or more distinct product uuids, no upper bound}; guide {guideId: a guide uuid, imageId?}; faq {items: 1-20 of {id}}; subscribe {} (no shared field but the background); cta {button}. Every type but the hero also takes background?: default|card, absent read as default. sticky, left or right, marks a sticky section and its side, at most one on each side, and only a subscribe section may carry it — the section modules that say sticky: true, held equal by a DB test. Item ids are lowercase uuids distinct within their section. A button is checked by landing_button_is_valid. The curated icon list and the text fields are the application''s to check; whether a picture exists, is a landing picture and is a shape its section takes is apply_landing_pictures''; whether a placed testimonial, a picked product or a placed guide exists is check_landing_section_picks''. The TypeScript structure schema in src/lib/landing-pages/sections/ states the testimonials counts and the backgrounds too, and DB tests hold the two equal.';

REVOKE ALL ON FUNCTION public.landing_sections_problem(p_sections jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_sections_problem(p_sections jsonb) TO service_role;
