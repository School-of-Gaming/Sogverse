--
-- Name: create_library_article(text, text, text, public.library_article_category, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_library_article(p_title text, p_summary text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_category public.library_article_category DEFAULT NULL::public.library_article_category, p_cover_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id    uuid;
  v_title text;
BEGIN
  PERFORM public.assert_admin();

  v_title := btrim(COALESCE(p_title, ''));

  IF v_title = '' THEN
    RAISE EXCEPTION 'An article needs a title'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.library_articles (
    author_id, category, title, summary, body, cover_image_id
  )
  VALUES (
    auth.uid(),
    p_category,
    v_title,
    btrim(COALESCE(p_summary, '')),
    btrim(COALESCE(p_body, '')),
    p_cover_image_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION create_library_article(p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_library_article(p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid) IS 'Admin-gated create of a Library article''s working copy; returns its id, which is the article''s URL. Stamps the caller as author. Only a title is required — everything else may wait for later saves, and nothing is published. Text is trimmed. The cover is a catalogue entry id, and the cover-path trigger refuses one that is gone or not a library cover. SECURITY DEFINER because library_articles carries no write grant: this and save_library_article are the only ways a row is written. The optional parameters default NULL because codegen cannot express an explicit null for a non-defaulted argument.';


--
-- Name: FUNCTION create_library_article(p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_library_article(p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_library_article(p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_library_article(p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid) TO service_role;


