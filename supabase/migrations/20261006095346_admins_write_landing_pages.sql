-- Admins write landing pages.
--
-- A landing page is a marketing page an admin authors — for a school, a city,
-- a business, an event — that exists to be found. It copies the Library's
-- model wherever nothing here says otherwise: a working copy an admin edits
-- and a published copy the public reads, a published row existing being what
-- "live" means, a version per language in both copies, one Publish putting
-- every complete version live at once, whole and partial writers, and the
-- record of who last saved and through which AI app.
--
-- WHAT DIFFERS FROM THE LIBRARY
--
-- 1. The body is an ordered list of sections, and the STRUCTURE is the
--    page's, shared by every language: `sections` is a JSON array of
--    {id, type, ...shared fields} (pictures, button targets, icons, the ids and
--    order of a section's items). The WORDS are per language: each version
--    holds `section_texts`, a JSON object from section id to that section's
--    text fields. A structure write that removes a section drops its text from
--    every language, by trigger, whoever wrote the structure.
-- 2. A version is complete when its title, summary and slug are written and
--    every section has every text field its type requires in that language.
--    That rule depends on the structure as well as the version, so it cannot
--    be a generated column: `is_complete` is derived by triggers on both
--    tables, and landing_version_missing is the one SQL definition of it. The
--    application holds the same rule in TypeScript, and a DB test holds the
--    two equal.
-- 3. Slugs are stored, per language, rather than derived from the title on
--    every read: a format (lowercase a-z, 0-9 and single hyphens, at most 80
--    characters, never shaped like a uuid, so a slug and an id address can
--    never collide), unique per (locale, slug) across every page live or not,
--    and fixed once that language has been published.
-- 4. Pictures are catalogue entries of purpose 'landing_image', referenced by
--    id from the sections JSON rather than by a foreign key column. Each copy
--    carries `image_paths`, an object from entry id to its path, derived by a
--    trigger that refuses an entry that is gone or of another purpose — so
--    readers paint a path without reading the admin-only catalogue, exactly
--    as a Library cover's cover_path.
--
-- THE CATALOGUE'S REPLACE AND REMOVAL
--
-- The catalogue's rules hold for these pictures as for covers: a replace
-- moves every link to the new entry in both copies, live included, with no
-- republish (repoint_landing_images, the replace's landing half); a removal
-- unlinks the entry everywhere, live included. No foreign key can reach into
-- JSON, so a BEFORE DELETE trigger on catalogue_images does the unlinking a
-- foreign key's SET NULL does for a cover: a hero or text section loses its
-- picture, an image section loses that picture, and an image section left
-- with none is dropped, its text with it, since an image section without a
-- picture has nothing left to be.

-- ---------------------------------------------------------------------------
-- 1. The rules, as functions of their inputs
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.landing_text_is_written(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_typeof(p_value) = 'string' AND (p_value #>> '{}') ~ '\S', false);
$$;

COMMENT ON FUNCTION public.landing_text_is_written(p_value jsonb) IS 'Whether a landing page text field is written: a JSON string holding something other than whitespace. Absent, null, a non-string or a blank string is unwritten. The TypeScript half of the required-text rule tests the same thing.';

REVOKE ALL ON FUNCTION public.landing_text_is_written(p_value jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landing_text_is_written(p_value jsonb) TO service_role;

CREATE FUNCTION public.landing_button_is_valid(p_button jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(
    jsonb_typeof(p_button) = 'object'
    -- The kind and its one field, and nothing else.
    AND (SELECT count(*) FROM jsonb_object_keys(p_button)) = 2
    AND (
      (p_button->>'kind' = 'internal'
        AND jsonb_typeof(p_button->'path') = 'string'
        AND p_button->>'path' LIKE '/%'
        AND p_button->>'path' NOT LIKE '//%')
      OR
      (p_button->>'kind' = 'external'
        AND jsonb_typeof(p_button->'url') = 'string'
        AND p_button->>'url' ~ '^https?://')
      OR
      (p_button->>'kind' = 'email'
        AND jsonb_typeof(p_button->'to') = 'string'
        AND p_button->>'to' ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+$')
    ),
    false);
$$;

COMMENT ON FUNCTION public.landing_button_is_valid(p_button jsonb) IS 'Whether a landing section''s button target has its shape, with no other field: {kind: ''internal'', path} with a path that starts with one slash (a locale-less route of this site), {kind: ''external'', url} with an http(s) URL, or {kind: ''email'', to} with one email address. An email''s subject line is a word of each language version (emailSubject), not part of the target. The registry''s buttonTarget in src/lib/landing-pages/sections/ is the other half, and a DB test holds the two equal.';

REVOKE ALL ON FUNCTION public.landing_button_is_valid(p_button jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landing_button_is_valid(p_button jsonb) TO service_role;

CREATE FUNCTION public.landing_sections_problem(p_sections jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
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
$$;

COMMENT ON FUNCTION public.landing_sections_problem(p_sections jsonb) IS 'What is wrong with a landing page''s section structure, in a sentence for the admin, or NULL when nothing is. The structure is a JSON array of sections, each {id, type, ...shared fields}, ids lowercase uuids distinct within the page; the first is the page''s one hero. Per type: hero {imageId?, button?}; text {imageId?, imageSide: start|end}; image {images: 1-4 of {id, imageId}}; points {items: 2-6 of {id, icon}}; steps {items: 2-6 of {id}}; faq {items: 1-20 of {id}}; cta {button}. Item ids are lowercase uuids distinct within their section. A button is checked by landing_button_is_valid. The curated icon list and the text fields are the application''s to check; whether a picture exists and has the landing_image purpose is apply_landing_image_paths''.';

REVOKE ALL ON FUNCTION public.landing_sections_problem(p_sections jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landing_sections_problem(p_sections jsonb) TO service_role;

CREATE FUNCTION public.landing_version_missing(
  p_sections      jsonb,
  p_title         text,
  p_summary       text,
  p_slug          text,
  p_section_texts jsonb
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
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
      ELSE
        NULL;
    END CASE;
  END LOOP;

  RETURN v_missing;
END;
$$;

COMMENT ON FUNCTION public.landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb) IS 'The SQL half of the landing pages'' required-text rule: what one language version still needs before publishing takes it, given the page''s structure, as a list of paths — title, summary, slug, then per section in order sections.<id>.<field>, sections.<id>.items.<item id>.<field> or sections.<id>.alts.<picture item id>. Empty means complete. Required: hero headline, its buttonLabel when it has a button and its imageAlt when it has a picture; text heading, body and imageAlt with a picture; image an alt per picture; points and steps heading and each item''s title and body; faq heading and each item''s question and answer; cta heading and buttonLabel. Written means landing_text_is_written. The TypeScript rule in src/lib/landing-pages/sections/ is the other half, and a DB test holds the two equal.';

REVOKE ALL ON FUNCTION public.landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb) TO service_role;

CREATE FUNCTION public.landing_texts_for_sections(p_sections jsonb, p_section_texts jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_object_agg(t.key, t.value), '{}'::jsonb)
    FROM jsonb_each(COALESCE(p_section_texts, '{}'::jsonb)) AS t(key, value)
   WHERE EXISTS (
     SELECT 1 FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(p_sections) = 'array' THEN p_sections ELSE '[]'::jsonb END) AS s(e)
      WHERE s.e->>'id' = t.key);
$$;

COMMENT ON FUNCTION public.landing_texts_for_sections(p_sections jsonb, p_section_texts jsonb) IS 'A version''s section texts kept to the sections the structure still has: the text of a section the structure no longer holds is dropped.';

REVOKE ALL ON FUNCTION public.landing_texts_for_sections(p_sections jsonb, p_section_texts jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landing_texts_for_sections(p_sections jsonb, p_section_texts jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The working copy
-- ---------------------------------------------------------------------------

CREATE TABLE public.landing_pages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sections       jsonb NOT NULL,
  sections_md5   text GENERATED ALWAYS AS (md5(sections::text)) STORED,
  image_paths    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_saved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_saved_via uuid
);

COMMENT ON TABLE public.landing_pages IS 'The WORKING COPY of each landing page — what an admin is editing, which may be saved incomplete: the section structure here, shared by every language, and the words per language in landing_page_translations. The public never reads this table: what is live is the page''s row in landing_page_publications, copied from this one by publish_landing_page. The id is the page''s id address. Admin-only end to end: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are create_landing_page, save_landing_page, save_landing_page_structure and save_landing_page_version, and the catalogue''s repoint_landing_images and removal trigger. No delete: a page that has to come down is unpublished.';

COMMENT ON COLUMN public.landing_pages.author_id IS 'The admin who created the page, stamped from auth.uid() by create_landing_page and never changed. SET NULL when that account goes.';
COMMENT ON COLUMN public.landing_pages.sections IS 'The ordered section structure, a JSON array of {id, type, ...shared fields}: pictures, button targets, icons, and the ids and order of a section''s items. Its shape is landing_sections_problem''s; the writers refuse anything it names. The text of each section is per language, in landing_page_translations.section_texts, keyed by the section''s id.';
COMMENT ON COLUMN public.landing_pages.sections_md5 IS 'md5 of sections, generated, so the admin list can tell whether the structure differs from the live one without comparing either.';
COMMENT ON COLUMN public.landing_pages.image_paths IS 'Each catalogue entry the sections show, as {entry id: object name in the landing-images bucket}, derived from sections by apply_landing_image_paths and never written by anything else.';
COMMENT ON COLUMN public.landing_pages.updated_at IS 'When the working copy was last saved, its versions included, maintained by the landing_pages_updated_at trigger on an update of sections or updated_at: every writer names one of them, and so do the catalogue''s replace and removal. Publishing does not touch it.';
COMMENT ON COLUMN public.landing_pages.last_saved_by IS 'The admin whose write last changed the working copy, stamped from auth.uid() by stamp_landing_page_saver and never supplied by a statement. NULL when that write had no signed-in caller, or the account has since gone (SET NULL).';
COMMENT ON COLUMN public.landing_pages.last_saved_via IS 'The OAuth client — an AI app connected through the MCP endpoint — that last_saved_by''s write came through: auth.oauth_clients.id, read from the token''s client_id claim by stamp_landing_page_saver. NULL for a write made in Sogverse itself, and whenever last_saved_by is NULL. No foreign key: the client belongs to Supabase Auth, and the record outlives it.';

CREATE TABLE public.landing_page_translations (
  page_id            uuid NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  locale             text NOT NULL,
  title              text NOT NULL,
  summary            text NOT NULL DEFAULT '',
  slug               text NOT NULL DEFAULT '',
  section_texts      jsonb NOT NULL DEFAULT '{}'::jsonb,
  texts_md5          text GENERATED ALWAYS AS (md5(section_texts::text)) STORED,
  is_complete        boolean NOT NULL DEFAULT false,
  first_published_at timestamptz,
  PRIMARY KEY (page_id, locale),
  CONSTRAINT chk_landing_page_translations_locale_format CHECK (locale ~ '^[a-z]{2,3}$'),
  CONSTRAINT chk_landing_page_translations_title_present CHECK (btrim(title) <> ''),
  CONSTRAINT chk_landing_page_translations_title_length CHECK (char_length(title) <= 120),
  CONSTRAINT chk_landing_page_translations_summary_length CHECK (char_length(summary) <= 160),
  CONSTRAINT chk_landing_page_translations_slug_format CHECK (
    slug = ''
    OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND char_length(slug) <= 80
        AND slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')),
  CONSTRAINT chk_landing_page_translations_texts_object CHECK (jsonb_typeof(section_texts) = 'object')
);

CREATE UNIQUE INDEX uq_landing_page_translations_locale_slug
  ON public.landing_page_translations (locale, slug)
  WHERE slug <> '';

COMMENT ON TABLE public.landing_page_translations IS 'One language version of a landing page''s WORKING COPY — its title, summary, slug and the text of every section in that locale, which may be saved incomplete. At least one per page: save_landing_page refuses an empty set, and nothing else removes a version. The public never reads this table: publishing copies the complete versions to landing_page_publication_translations. Admin-only end to end: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are save_landing_page, which replaces the whole set, and save_landing_page_version, which writes one.';
COMMENT ON COLUMN public.landing_page_translations.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';
COMMENT ON COLUMN public.landing_page_translations.title IS 'The title in this language: the page''s <title> and the name the admin list shows. The one field a version must carry.';
COMMENT ON COLUMN public.landing_page_translations.summary IS 'The summary in this language — the page''s meta description and its line in llms.txt — plain text, at most 160 characters, and the empty string while unwritten.';
COMMENT ON COLUMN public.landing_page_translations.slug IS 'The page''s address in this language, stored: lowercase a-z, 0-9 and single hyphens, at most 80 characters, never shaped like a uuid so it cannot be read as an id address, and the empty string while unwritten. Unique per locale among the working versions (uq_landing_page_translations_locale_slug), and the writers refuse one another page has live too. Fixed once this language has been published (guard_landing_page_slug).';
COMMENT ON COLUMN public.landing_page_translations.section_texts IS 'The text of each section in this language, as {section id: {field: text, ...}}. A key names a section of the page''s structure; the text of a section the structure drops is dropped with it. Which fields each section type has, and which are required, is the application''s section registry; landing_version_missing is the SQL half of the required rule.';
COMMENT ON COLUMN public.landing_page_translations.texts_md5 IS 'md5 of section_texts, generated — compared with the live version''s own to tell whether this version has unpublished changes without reading either.';
COMMENT ON COLUMN public.landing_page_translations.is_complete IS 'Whether publishing would take this version: title, summary and slug written and every section''s required text written, by landing_version_missing against the page''s current structure. Derived by apply_landing_version_completeness on every write of the row, and recomputed for every version when the structure changes; never written by anything else.';
COMMENT ON COLUMN public.landing_page_translations.first_published_at IS 'When this language first went live, stamped by publish_landing_page and kept from then on. From that moment the version''s slug is fixed: guard_landing_page_slug refuses a change.';

-- ---------------------------------------------------------------------------
-- 3. The published copy
-- ---------------------------------------------------------------------------

CREATE TABLE public.landing_page_publications (
  page_id            uuid PRIMARY KEY REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  sections           jsonb NOT NULL,
  sections_md5       text GENERATED ALWAYS AS (md5(sections::text)) STORED,
  image_paths        jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at       timestamptz NOT NULL,
  first_published_at timestamptz NOT NULL,
  CONSTRAINT chk_landing_page_publications_first_not_after_latest CHECK (first_published_at <= published_at)
);

CREATE INDEX idx_landing_page_publications_first_published
  ON public.landing_page_publications (first_published_at DESC, page_id);

COMMENT ON TABLE public.landing_page_publications IS 'The PUBLISHED COPY of each live landing page: its section structure here, and its words per language in landing_page_publication_translations. A row''s existence is the page being live: publish_landing_page copies the working copy over it and unpublish_landing_page deletes it, its versions with it. Readable by anon and authenticated alike, every row; no write grant for either — publish and unpublish are the writers, and the catalogue''s repoint_landing_images and removal trigger the only others.';
COMMENT ON COLUMN public.landing_page_publications.sections IS 'The live section structure, copied from the working copy by publishing. The catalogue''s replace and removal change its pictures without a republish.';
COMMENT ON COLUMN public.landing_page_publications.sections_md5 IS 'md5 of sections, generated — compared with the working copy''s own.';
COMMENT ON COLUMN public.landing_page_publications.image_paths IS 'Each catalogue entry the live sections show, as {entry id: object name in the landing-images bucket}, derived by apply_landing_image_paths — what the public pages paint, readable without reading the admin-only catalogue.';
COMMENT ON COLUMN public.landing_page_publications.published_at IS 'When the version now live was published. Every publish moves it; the sitemap''s lastmod.';
COMMENT ON COLUMN public.landing_page_publications.first_published_at IS 'When the page went live, kept by every republish while it stays live. An unpublish deletes the row and takes the date with it.';

CREATE TABLE public.landing_page_publication_translations (
  page_id       uuid NOT NULL REFERENCES public.landing_page_publications(page_id) ON DELETE CASCADE,
  locale        text NOT NULL,
  title         text NOT NULL,
  summary       text NOT NULL,
  slug          text NOT NULL,
  section_texts jsonb NOT NULL,
  texts_md5     text GENERATED ALWAYS AS (md5(section_texts::text)) STORED,
  PRIMARY KEY (page_id, locale),
  CONSTRAINT uq_landing_page_publication_translations_locale_slug UNIQUE (locale, slug),
  CONSTRAINT chk_landing_page_publication_translations_locale_format CHECK (locale ~ '^[a-z]{2,3}$'),
  CONSTRAINT chk_landing_page_publication_translations_title_present CHECK (btrim(title) <> ''),
  CONSTRAINT chk_landing_page_publication_translations_summary_present CHECK (btrim(summary) <> ''),
  CONSTRAINT chk_landing_page_publication_translations_slug_format CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND char_length(slug) <= 80
    AND slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  CONSTRAINT chk_landing_page_publication_translations_texts_object CHECK (jsonb_typeof(section_texts) = 'object')
);

COMMENT ON TABLE public.landing_page_publication_translations IS 'One language version of a live landing page — what readers of that language see, at its slug address. publish_landing_page replaces a page''s whole set with the working copy''s complete versions, so a live page has at least one; unpublishing deletes the publication and these with it (CASCADE). Title, summary and slug are present by CHECK and the slug unique per locale. Readable by anon and authenticated alike, every row; no write grant for either. Readers pick a version in the app: their locale, then English, then the first written.';
COMMENT ON COLUMN public.landing_page_publication_translations.texts_md5 IS 'md5 of section_texts, generated — compared with the working version''s own.';

-- ---------------------------------------------------------------------------
-- 4. Access: admins read the working copy, everyone reads the published one
-- ---------------------------------------------------------------------------

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_publication_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_landing_pages ON public.landing_pages
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY admins_read_landing_page_translations ON public.landing_page_translations
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY everyone_reads_landing_page_publications ON public.landing_page_publications
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY everyone_reads_landing_page_publication_translations ON public.landing_page_publication_translations
  FOR SELECT TO authenticated, anon USING (true);

GRANT SELECT ON TABLE public.landing_pages TO authenticated;
GRANT ALL ON TABLE public.landing_pages TO service_role;
GRANT SELECT ON TABLE public.landing_page_translations TO authenticated;
GRANT ALL ON TABLE public.landing_page_translations TO service_role;
GRANT SELECT ON TABLE public.landing_page_publications TO anon, authenticated;
GRANT ALL ON TABLE public.landing_page_publications TO service_role;
GRANT SELECT ON TABLE public.landing_page_publication_translations TO anon, authenticated;
GRANT ALL ON TABLE public.landing_page_publication_translations TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Derived columns and guards
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.apply_landing_image_paths()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_ref     text;
  v_path    text;
  v_purpose public.catalogue_image_purpose;
  v_paths   jsonb := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(NEW.sections) = 'array' THEN
    FOR v_ref IN
      SELECT DISTINCT r.ref FROM (
        SELECT s.e->>'imageId' AS ref
          FROM jsonb_array_elements(NEW.sections) AS s(e)
         WHERE jsonb_typeof(s.e->'imageId') = 'string'
        UNION ALL
        SELECT i.e->>'imageId'
          FROM jsonb_array_elements(NEW.sections) AS s(e),
               jsonb_array_elements(
                 CASE WHEN jsonb_typeof(s.e->'images') = 'array' THEN s.e->'images' ELSE '[]'::jsonb END
               ) AS i(e)
         WHERE jsonb_typeof(i.e->'imageId') = 'string'
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
  END IF;

  NEW.image_paths := v_paths;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_landing_image_paths() IS 'BEFORE INSERT OR UPDATE on landing_pages and landing_page_publications: image_paths is derived from every catalogue entry the sections name (a section''s imageId, an image section''s images[].imageId), as {entry id: path}. No branch keeps a statement-supplied value and the triggers carry no column list, so this is the column''s only writer. Refuses an entry that is gone (23503) or whose purpose is not landing_image (23514).';

REVOKE ALL ON FUNCTION public.apply_landing_image_paths() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_landing_image_paths() TO service_role;

CREATE TRIGGER trg_landing_pages_apply_image_paths
  BEFORE INSERT OR UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.apply_landing_image_paths();
CREATE TRIGGER trg_landing_page_publications_apply_image_paths
  BEFORE INSERT OR UPDATE ON public.landing_page_publications
  FOR EACH ROW EXECUTE FUNCTION public.apply_landing_image_paths();

CREATE TRIGGER landing_pages_updated_at
  BEFORE UPDATE OF sections, updated_at ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.stamp_landing_page_saver()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.last_saved_by  := auth.uid();
  NEW.last_saved_via := NULL;

  -- A client is recorded only beside a saver: with no signed-in caller there
  -- is no token whose claim could name one.
  IF NEW.last_saved_by IS NOT NULL THEN
    NEW.last_saved_via := (auth.jwt() ->> 'client_id')::uuid;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_landing_page_saver() IS 'BEFORE INSERT, and BEFORE UPDATE of the working copy''s own content (sections, updated_at), on landing_pages: stamps last_saved_by from auth.uid() and last_saved_via from the token''s client_id claim, overwriting whatever the statement said, so it is both columns'' only writer. Every landing page writer touches one of those columns, and so do the catalogue''s replace and removal. The column list keeps a profile deletion''s SET NULL from being re-stamped as a save.';

REVOKE ALL ON FUNCTION public.stamp_landing_page_saver() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stamp_landing_page_saver() TO service_role;

CREATE TRIGGER trg_landing_pages_stamp_saver
  BEFORE INSERT OR UPDATE OF sections, updated_at ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.stamp_landing_page_saver();

CREATE FUNCTION public.apply_landing_version_completeness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.is_complete := cardinality(public.landing_version_missing(
    (SELECT p.sections FROM public.landing_pages p WHERE p.id = NEW.page_id),
    NEW.title, NEW.summary, NEW.slug, NEW.section_texts)) = 0;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_landing_version_completeness() IS 'BEFORE INSERT OR UPDATE on landing_page_translations: derives is_complete from landing_version_missing against the page''s current structure, whatever the statement said. A structure change recomputes every version through cascade_landing_structure.';

REVOKE ALL ON FUNCTION public.apply_landing_version_completeness() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_landing_version_completeness() TO service_role;

CREATE TRIGGER trg_landing_page_translations_completeness
  BEFORE INSERT OR UPDATE ON public.landing_page_translations
  FOR EACH ROW EXECUTE FUNCTION public.apply_landing_version_completeness();

CREATE FUNCTION public.cascade_landing_structure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'landing_pages' THEN
    -- Every version is rewritten, so the completeness trigger recomputes each
    -- against the new structure even where no text was dropped.
    UPDATE public.landing_page_translations
       SET section_texts = public.landing_texts_for_sections(NEW.sections, section_texts)
     WHERE page_id = NEW.id;
  ELSE
    UPDATE public.landing_page_publication_translations
       SET section_texts = public.landing_texts_for_sections(NEW.sections, section_texts)
     WHERE page_id = NEW.page_id
       AND section_texts IS DISTINCT FROM public.landing_texts_for_sections(NEW.sections, section_texts);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.cascade_landing_structure() IS 'AFTER UPDATE OF sections on landing_pages and landing_page_publications: drops from every version of that copy the text of any section the structure no longer holds — so a structure write that removes a section removes its words in every language, whoever made it — and, on the working copy, recomputes every version''s is_complete against the new structure.';

REVOKE ALL ON FUNCTION public.cascade_landing_structure() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cascade_landing_structure() TO service_role;

CREATE TRIGGER trg_landing_pages_cascade_structure
  AFTER UPDATE OF sections ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.cascade_landing_structure();
CREATE TRIGGER trg_landing_page_publications_cascade_structure
  AFTER UPDATE OF sections ON public.landing_page_publications
  FOR EACH ROW EXECUTE FUNCTION public.cascade_landing_structure();

CREATE FUNCTION public.guard_landing_page_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_live text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.first_published_at IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'The % address of this page is fixed now that it has been published: it stays "%"', NEW.locale, OLD.slug
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.first_published_at := OLD.first_published_at;
    RETURN NEW;
  END IF;

  -- A version written again after a whole save removed it, while the
  -- language is still live: the live address holds, and the version is fixed
  -- from the start.
  SELECT slug INTO v_live
    FROM public.landing_page_publication_translations
   WHERE page_id = NEW.page_id AND locale = NEW.locale;

  IF v_live IS NOT NULL THEN
    IF NEW.slug IS DISTINCT FROM v_live THEN
      RAISE EXCEPTION 'The % address of this page is fixed now that it has been published: it stays "%"', NEW.locale, v_live
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.first_published_at := now();
  ELSE
    NEW.first_published_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_landing_page_slug() IS 'BEFORE INSERT, and BEFORE UPDATE of slug, on landing_page_translations: a version''s slug is fixed once its language has been published. An update changing the slug of a version with first_published_at set raises check_violation, and an update naming the slug keeps first_published_at as it was; publish_landing_page''s stamp names only first_published_at. An insert for a language that is live must carry the live slug, and starts fixed; any other insert starts unfixed.';

REVOKE ALL ON FUNCTION public.guard_landing_page_slug() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_landing_page_slug() TO service_role;

CREATE TRIGGER trg_landing_page_translations_guard_slug
  BEFORE INSERT OR UPDATE OF slug ON public.landing_page_translations
  FOR EACH ROW EXECUTE FUNCTION public.guard_landing_page_slug();

-- ---------------------------------------------------------------------------
-- 6. The writers
-- ---------------------------------------------------------------------------

-- One version's validation and upsert, shared by the whole save and the
-- one-language save so the two can never disagree about what a version may
-- hold. Not exposed: it carries no guard, and runs only inside the
-- admin-gated writers.
CREATE FUNCTION public.write_landing_page_version(
  p_id            uuid,
  p_locale        text,
  p_title         text,
  p_summary       text,
  p_slug          text,
  p_default_slug  text,
  p_section_texts jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_sections jsonb;
  v_stored   text;
  v_slug     text;
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

  -- The slug: the one sent; else the one stored; else the live one, for a
  -- language written again after a whole save removed it while it was live;
  -- else the default derived from the title by the application, which owns
  -- slug derivation.
  SELECT NULLIF(slug, '') INTO v_stored
    FROM public.landing_page_translations
   WHERE page_id = p_id AND locale = p_locale;

  IF v_stored IS NULL THEN
    SELECT slug INTO v_stored
      FROM public.landing_page_publication_translations
     WHERE page_id = p_id AND locale = p_locale;
  END IF;

  v_slug := COALESCE(NULLIF(btrim(p_slug), ''), v_stored, NULLIF(btrim(p_default_slug), ''), '');

  IF v_slug <> '' THEN
    IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(v_slug) > 80 THEN
      RAISE EXCEPTION 'The % address "%" may hold only lowercase letters a-z, digits and single hyphens, at most 80 characters', p_locale, v_slug
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'The % address "%" is shaped like an id; choose words instead', p_locale, v_slug
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.landing_page_translations
                WHERE locale = p_locale AND slug = v_slug AND page_id <> p_id)
       OR EXISTS (SELECT 1 FROM public.landing_page_publication_translations
                   WHERE locale = p_locale AND slug = v_slug AND page_id <> p_id) THEN
      RAISE EXCEPTION 'The % address "%" is already another landing page''s; choose another', p_locale, v_slug
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  INSERT INTO public.landing_page_translations AS t
         (page_id, locale, title, summary, slug, section_texts)
  VALUES (p_id,
          p_locale,
          btrim(p_title),
          btrim(COALESCE(p_summary, '')),
          v_slug,
          COALESCE(p_section_texts, '{}'::jsonb))
  ON CONFLICT (page_id, locale) DO UPDATE
     SET title         = EXCLUDED.title,
         summary       = EXCLUDED.summary,
         slug          = EXCLUDED.slug,
         section_texts = EXCLUDED.section_texts;
END;
$$;

COMMENT ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) IS 'Internal: validates and upserts one language version of a landing page''s working copy, for save_landing_page and save_landing_page_version, which have already locked the page row. A blank or over-long title, an over-long summary, or text for a section the page does not have raises check_violation; section texts, or one section''s text, that are not an object raise 22023. The slug is p_slug when sent, else the stored one, else the live one, else p_default_slug (the application''s derivation from the title), else unwritten; a malformed or uuid-shaped one raises check_violation, and one another page holds in that locale, working or live, raises unique_violation. Carries no guard: not granted to any Data API role.';

REVOKE ALL ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) TO service_role;

CREATE FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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
      v_version->'section_texts');
  END LOOP;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) IS 'Admin-gated save of a landing page''s WHOLE working copy; returns its id. Never touches the published copy. p_sections is the structure (landing_sections_problem names what is wrong with one, as check_violation). p_versions is the whole version set, a JSON array of {locale, title, summary, slug, default_slug, section_texts}, replacing what was stored: a locale it omits is removed. At least one version, each written by write_landing_page_version''s rules; a locale named twice, or p_versions not an array, raises 22023. An id no page has raises no_data_found. SECURITY DEFINER because no landing page table carries a write grant.';

REVOKE ALL ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) TO service_role;

CREATE FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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

  PERFORM public.save_landing_page(v_id, p_sections, p_versions);

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb) IS 'Admin-gated create of a landing page''s working copy; returns its id. Stamps the caller as author, then writes the structure and versions through save_landing_page, whose rules and refusals are this function''s. Nothing is published. SECURITY DEFINER because the working tables carry no write grant.';

REVOKE ALL ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb) TO service_role;

CREATE FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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

  UPDATE public.landing_pages SET sections = p_sections
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb) IS 'Admin-gated save of a landing page''s working-copy STRUCTURE alone — the ordered sections and their shared fields; returns the page id. No version''s words are written, except that the text of a section the new structure drops is dropped from every language (cascade_landing_structure). A malformed structure raises check_violation naming the problem; an id no page has raises no_data_found. Never touches the published copy. SECURITY DEFINER because the working copy carries no write grant.';

REVOKE ALL ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb) TO service_role;

CREATE FUNCTION public.save_landing_page_version(
  p_id            uuid,
  p_locale        text,
  p_title         text,
  p_summary       text DEFAULT NULL,
  p_slug          text DEFAULT NULL,
  p_default_slug  text DEFAULT NULL,
  p_section_texts jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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
    p_id, p_locale, p_title, p_summary, p_slug, p_default_slug, p_section_texts);

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) IS 'Admin-gated save of ONE language version of a landing page''s working copy — its title, summary, slug and every section''s text in that locale; returns the page id. Writes the (page, locale) row by write_landing_page_version''s rules, creating it when the language is new, and touches no other version and not the structure, so a structure write and a one-language write never undo each other. Never touches the published copy. An id no page has raises no_data_found. SECURITY DEFINER because no working table carries a write grant. The optional parameters default NULL because codegen cannot express an explicit null for a non-defaulted argument.';

REVOKE ALL ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) TO service_role;

CREATE FUNCTION public.publish_landing_page(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- The structure is copied and the picture paths are not: the trigger
  -- derives the published copy's own.
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
         (page_id, locale, title, summary, slug, section_texts)
  SELECT page_id, locale, title, summary, slug, section_texts
    FROM public.landing_page_translations
   WHERE page_id = p_id
     AND is_complete;

  -- From now on these languages' addresses are fixed.
  UPDATE public.landing_page_translations
     SET first_published_at = now()
   WHERE page_id = p_id
     AND is_complete
     AND first_published_at IS NULL;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.publish_landing_page(p_id uuid) IS 'Admin-gated publish: copies the page''s working copy over its published copy, making it live or replacing the live version — the structure and every complete language version at once (is_complete: title, summary, slug and every section''s required text written); the live version set becomes exactly those. An incomplete version stays in the working copy. Refuses a page with no complete version with check_violation. Stamps first_published_at on each version going live for the first time, which fixes its slug. A republish moves published_at and keeps first_published_at. The working copy is locked for the copy. An id no page has raises no_data_found. SECURITY DEFINER because no landing page table carries a write grant.';

REVOKE ALL ON FUNCTION public.publish_landing_page(p_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_landing_page(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_landing_page(p_id uuid) TO service_role;

CREATE FUNCTION public.unpublish_landing_page(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.landing_pages WHERE id = p_id) THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.landing_page_publications WHERE page_id = p_id;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.unpublish_landing_page(p_id uuid) IS 'Admin-gated unpublish: deletes the page''s published copy, every language version with it, and leaves the working copy exactly as it was — slugs that have been published stay fixed. Unpublishing a page that is not live is a no-op; an id no page has raises no_data_found. Publishing again afterwards starts a new first_published_at.';

REVOKE ALL ON FUNCTION public.unpublish_landing_page(p_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unpublish_landing_page(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_landing_page(p_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. The catalogue's replace and removal
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.landing_sections_repointed(p_sections jsonb, p_from uuid, p_to uuid)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN s.e->>'imageId' = p_from::text
        THEN jsonb_set(s.e, '{imageId}', to_jsonb(p_to::text))
      WHEN jsonb_typeof(s.e->'images') = 'array'
        THEN jsonb_set(s.e, '{images}', (
          SELECT COALESCE(jsonb_agg(
            CASE WHEN i.e->>'imageId' = p_from::text
                 THEN jsonb_set(i.e, '{imageId}', to_jsonb(p_to::text))
                 ELSE i.e END
            ORDER BY i.n), '[]'::jsonb)
            FROM jsonb_array_elements(s.e->'images') WITH ORDINALITY AS i(e, n)))
      ELSE s.e
    END
    ORDER BY s.n), '[]'::jsonb)
    FROM jsonb_array_elements(p_sections) WITH ORDINALITY AS s(e, n);
$$;

COMMENT ON FUNCTION public.landing_sections_repointed(p_sections jsonb, p_from uuid, p_to uuid) IS 'A section structure with every picture that is entry p_from made entry p_to, everything else as it was.';

REVOKE ALL ON FUNCTION public.landing_sections_repointed(p_sections jsonb, p_from uuid, p_to uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landing_sections_repointed(p_sections jsonb, p_from uuid, p_to uuid) TO service_role;

CREATE FUNCTION public.landing_sections_without_image(p_sections jsonb, p_image uuid)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(kept.e ORDER BY kept.n), '[]'::jsonb)
    FROM (
      SELECT s.n,
             CASE
               WHEN s.e->>'imageId' = p_image::text THEN s.e - 'imageId'
               WHEN jsonb_typeof(s.e->'images') = 'array' THEN jsonb_set(s.e, '{images}', (
                 SELECT COALESCE(jsonb_agg(i.e ORDER BY i.n), '[]'::jsonb)
                   FROM jsonb_array_elements(s.e->'images') WITH ORDINALITY AS i(e, n)
                  WHERE i.e->>'imageId' IS DISTINCT FROM p_image::text))
               ELSE s.e
             END AS e
        FROM jsonb_array_elements(p_sections) WITH ORDINALITY AS s(e, n)
    ) AS kept
   WHERE CASE WHEN jsonb_typeof(kept.e->'images') = 'array'
              THEN jsonb_array_length(kept.e->'images') > 0
              ELSE true
         END;
$$;

COMMENT ON FUNCTION public.landing_sections_without_image(p_sections jsonb, p_image uuid) IS 'A section structure with catalogue entry p_image taken out: a section''s single picture is unset, an image section loses the pictures that are that entry, and an image section left with none is dropped.';

REVOKE ALL ON FUNCTION public.landing_sections_without_image(p_sections jsonb, p_image uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landing_sections_without_image(p_sections jsonb, p_image uuid) TO service_role;

CREATE FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
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

  RETURN v_moved;
END;
$$;

COMMENT ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) IS 'Admin-gated landing half of the image catalogue''s replace: points every landing page picture that is entry p_from — working and published copies alike — at entry p_to, and returns how many pages moved (a page whose two copies both moved counts once). A live page''s picture changes without a republish. The image-path trigger re-derives each copy''s paths and refuses a p_to that is gone or not a landing_image. Either argument NULL raises null_value_not_allowed. SECURITY DEFINER because no landing page table carries a write grant.';

REVOKE ALL ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) TO service_role;

CREATE FUNCTION public.unlink_removed_landing_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.purpose <> 'landing_image' THEN
    RETURN OLD;
  END IF;

  -- Taken out of both copies before the entry goes, so the image-path trigger
  -- re-deriving each copy never meets the entry it is removing; the structure
  -- trigger drops the text of an image section this leaves with no picture.
  UPDATE public.landing_pages
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE image_paths ? OLD.id::text;

  UPDATE public.landing_page_publications
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE image_paths ? OLD.id::text;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.unlink_removed_landing_image() IS 'BEFORE DELETE on catalogue_images: the landing pages'' half of a removal, standing in for the foreign key a picture inside sections JSON cannot have. Takes a removed landing_image entry out of every landing page, working and published copies alike, as a cover''s SET NULL does: a hero or text section loses its picture, an image section loses that picture, and an image section left with none is dropped with its text. A live page changes without a republish; the working copy''s updated_at and saver move, as a cover removal''s do. SECURITY DEFINER because the remover is an admin''s own session and no landing page table carries a write grant.';

REVOKE ALL ON FUNCTION public.unlink_removed_landing_image() FROM PUBLIC;
GRANT ALL ON FUNCTION public.unlink_removed_landing_image() TO service_role;

CREATE TRIGGER trg_catalogue_images_unlink_landing_pages
  BEFORE DELETE ON public.catalogue_images
  FOR EACH ROW EXECUTE FUNCTION public.unlink_removed_landing_image();
