--
-- Name: publish_library_article(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_library_article(p_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_article public.library_articles;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.assert_admin();

  -- Locked, so a save racing this publish lands wholly before or wholly after
  -- the copy rather than half in it.
  SELECT * INTO v_article
    FROM public.library_articles
   WHERE id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A cover is not among these: an article may go live without one.
  IF btrim(v_article.summary) = '' THEN v_missing := array_append(v_missing, 'a summary'); END IF;
  IF btrim(v_article.body) = ''    THEN v_missing := array_append(v_missing, 'a body'); END IF;
  IF v_article.category IS NULL    THEN v_missing := array_append(v_missing, 'a category'); END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'The article cannot be published without %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- The link is copied and the path is not: the cover-path trigger derives
  -- the published copy's own.
  INSERT INTO public.library_article_publications (
    article_id, category, title, summary, body, cover_image_id,
    published_at, first_published_at
  )
  VALUES (
    v_article.id, v_article.category, v_article.title, v_article.summary,
    v_article.body, v_article.cover_image_id, now(), now()
  )
  ON CONFLICT (article_id) DO UPDATE SET
    category       = EXCLUDED.category,
    title          = EXCLUDED.title,
    summary        = EXCLUDED.summary,
    body           = EXCLUDED.body,
    cover_image_id = EXCLUDED.cover_image_id,
    published_at   = EXCLUDED.published_at;
  -- first_published_at is deliberately absent from the SET list: a republish
  -- of a live article keeps the date it first went live.

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION publish_library_article(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.publish_library_article(p_id uuid) IS 'Admin-gated publish: copies the article''s working copy over its published copy in one statement, making it live or replacing the live version. Refuses with check_violation, naming every missing field in one sentence, a working copy without a summary, a body or a category — the published copy''s CHECKs are the backstop. A cover is optional: an article without one goes live with none. A republish moves published_at and keeps first_published_at. The working copy is locked for the copy, so a concurrent save lands wholly before or after it. An id no article has raises no_data_found. SECURITY DEFINER because neither table carries a write grant.';


--
-- Name: FUNCTION publish_library_article(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.publish_library_article(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_library_article(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.publish_library_article(p_id uuid) TO service_role;


