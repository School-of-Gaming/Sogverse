--
-- Name: save_library_article(uuid, jsonb, public.library_article_category, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_library_article(p_id uuid, p_versions jsonb, p_category public.library_article_category DEFAULT NULL::public.library_article_category, p_cover_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_untitled text;
BEGIN
  PERFORM public.assert_admin();

  IF p_versions IS NULL OR jsonb_typeof(p_versions) <> 'array' THEN
    RAISE EXCEPTION 'p_versions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- The admin list names an article by a title, so an article has at least
  -- one version and every version has its title.
  IF jsonb_array_length(p_versions) = 0 THEN
    RAISE EXCEPTION 'An article needs a title'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.locale INTO v_untitled
    FROM jsonb_to_recordset(p_versions) AS r(locale text, title text)
   WHERE btrim(COALESCE(r.title, '')) = ''
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'The % version needs a title', COALESCE(v_untitled, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(DISTINCT r.locale) <> count(*)
        FROM jsonb_to_recordset(p_versions) AS r(locale text)) THEN
    RAISE EXCEPTION 'Each language may have one version'
      USING ERRCODE = '22023';
  END IF;

  -- Every shared column is assigned on every call, so an omitted optional
  -- argument clears its field — which is how one is cleared. Written first, so
  -- an id no article has is refused before any version is, and so the row's
  -- updated_at moves on every save.
  UPDATE public.library_articles SET
    category       = p_category,
    cover_image_id = p_cover_image_id
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The version set is replaced whole: a locale the save no longer names is
  -- gone, and every named one is written as sent.
  DELETE FROM public.library_article_translations t
   WHERE t.article_id = p_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_versions) e
        WHERE e->>'locale' = t.locale);

  INSERT INTO public.library_article_translations AS t
         (article_id, locale, title, summary, body)
  SELECT p_id,
         r.locale,
         btrim(r.title),
         btrim(COALESCE(r.summary, '')),
         btrim(COALESCE(r.body, ''))
    FROM jsonb_to_recordset(p_versions)
      AS r(locale text, title text, summary text, body text)
  ON CONFLICT (article_id, locale) DO UPDATE
     SET title   = EXCLUDED.title,
         summary = EXCLUDED.summary,
         body    = EXCLUDED.body;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_library_article(p_id uuid, p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_library_article(p_id uuid, p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid) IS 'Admin-gated save of a Library article''s WORKING COPY; returns its id. It never touches the published copy, so the live article is unchanged until publish_library_article is called. p_versions is the whole version set, a JSON array of {locale, title, summary, body}, replacing what was stored: a locale it omits is removed. At least one version, each with a title, else check_violation naming the locale; a locale named twice, or p_versions not an array, raises 22023. Text is trimmed. The category and cover are assigned on every call — an omitted one clears that field, which is the only way to clear one. The cover is a catalogue entry id, and the cover-path trigger refuses one that is gone or not a library cover. An id no article has raises no_data_found rather than silently saving nothing. SECURITY DEFINER because neither working table carries a write grant.';


--
-- Name: FUNCTION save_library_article(p_id uuid, p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_library_article(p_id uuid, p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_library_article(p_id uuid, p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.save_library_article(p_id uuid, p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid) TO service_role;


