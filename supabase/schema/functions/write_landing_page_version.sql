--
-- Name: write_landing_page_version(uuid, text, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: FUNCTION write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) IS 'Internal: validates and upserts one language version of a landing page''s working copy, for save_landing_page and save_landing_page_version, which have already locked the page row. A blank or over-long title, an over-long summary, or text for a section the page does not have raises check_violation; section texts, or one section''s text, that are not an object raise 22023. The slug is p_slug when sent, else the stored one, else the live one, else p_default_slug (the application''s derivation from the title), else unwritten; a malformed or uuid-shaped one raises check_violation, and one another page holds in that locale, working or live, raises unique_violation. Carries no guard: not granted to any Data API role.';


--
-- Name: FUNCTION write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) TO service_role;


