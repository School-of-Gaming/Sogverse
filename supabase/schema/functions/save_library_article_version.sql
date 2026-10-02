--
-- Name: save_library_article_version(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_library_article_version(p_id uuid, p_locale text, p_title text, p_summary text, p_body text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- The admin list names an article by a title, so every version has one.
  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'The % version needs a title', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Written first, so an id no article has is refused before the version is,
  -- the row's updated_at moves (its trigger stamps it, and the saver with it),
  -- and the row lock publish_library_article takes orders this write wholly
  -- before or after a publish. Nothing else on the row changes.
  UPDATE public.library_articles SET updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.library_article_translations AS t
         (article_id, locale, title, summary, body)
  VALUES (p_id,
          p_locale,
          btrim(p_title),
          btrim(COALESCE(p_summary, '')),
          btrim(COALESCE(p_body, '')))
  ON CONFLICT (article_id, locale) DO UPDATE
     SET title   = EXCLUDED.title,
         summary = EXCLUDED.summary,
         body    = EXCLUDED.body;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_library_article_version(p_id uuid, p_locale text, p_title text, p_summary text, p_body text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_library_article_version(p_id uuid, p_locale text, p_title text, p_summary text, p_body text) IS 'Admin-gated save of ONE language version of a Library article''s WORKING COPY; returns the article id. Writes the (article, locale) row as sent, creating it when the language is new, and touches no other version, nor the category or cover — so two writes of different languages can never undo each other. Never touches the published copy. A blank title raises check_violation naming the locale; a NULL summary or body is saved empty. Text is trimmed. The locale is checked by the table''s own format CHECK. An id no article has raises no_data_found. SECURITY DEFINER because neither working table carries a write grant.';


--
-- Name: FUNCTION save_library_article_version(p_id uuid, p_locale text, p_title text, p_summary text, p_body text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_library_article_version(p_id uuid, p_locale text, p_title text, p_summary text, p_body text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_library_article_version(p_id uuid, p_locale text, p_title text, p_summary text, p_body text) TO authenticated;
GRANT ALL ON FUNCTION public.save_library_article_version(p_id uuid, p_locale text, p_title text, p_summary text, p_body text) TO service_role;


