--
-- Name: write_landing_page_version(uuid, text, text, text, text, text, jsonb, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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
  -- The page's pictures are re-derived by refresh_landing_pictures when the
  -- share picture changed, which refuses one that is gone (23503), not a
  -- landing picture or not wide (23514).
END;
$_$;


--
-- Name: FUNCTION write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) IS 'Internal: validates and upserts one language version of a landing page''s working copy, for save_landing_page and save_landing_page_version, which have already locked the page row. A blank or over-long title, an over-long summary or share title, or text for a section the page does not have raises check_violation; section texts, or one section''s text, that are not an object raise 22023. The slug is p_slug when sent, else the stored one, else p_default_slug (the application''s derivation from the title), else unwritten; it may differ from the page''s own live slug, which changes at the next publish. A malformed or uuid-shaped one raises check_violation, and one another page holds in that locale, working or live, raises unique_violation naming that page by its title. The share title, share picture and share picture alt text are written as sent, NULL as the empty string or no picture: like the words, a write carries the whole of what the version holds. The version''s hero picture is the imageId in the hero section''s words. A share or hero picture that is gone raises foreign_key_violation, and one that is not a wide landing picture (landing_image), or a hero picture that is not a lowercase uuid string, check_violation. Carries no guard: not granted to any Data API role.';


--
-- Name: FUNCTION write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.write_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb, p_share_title text, p_share_image_id uuid, p_share_image_alt text) TO service_role;


