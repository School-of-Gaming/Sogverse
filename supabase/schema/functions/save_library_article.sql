--
-- Name: save_library_article(uuid, text, text, text, public.library_article_category, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_library_article(p_id uuid, p_title text, p_summary text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_category public.library_article_category DEFAULT NULL::public.library_article_category, p_cover_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_title text;
BEGIN
  PERFORM public.assert_admin();

  v_title := btrim(COALESCE(p_title, ''));

  -- The same check its create sibling makes, written out rather than shared:
  -- a private validator would be a function no role may call.
  IF v_title = '' THEN
    RAISE EXCEPTION 'An article needs a title'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every editable column is assigned on every call, so an omitted optional
  -- argument clears its field — which is how one is cleared.
  UPDATE public.library_articles SET
    category       = p_category,
    title          = v_title,
    summary        = btrim(COALESCE(p_summary, '')),
    body           = btrim(COALESCE(p_body, '')),
    cover_image_id = p_cover_image_id
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_library_article(p_id uuid, p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_library_article(p_id uuid, p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid) IS 'Admin-gated save of a Library article''s WORKING COPY; returns its id. It never touches the published copy, so the live article is unchanged until publish_library_article is called. Assigns every editable column on every call — an omitted optional argument clears that field, which is the only way to clear one — so a column added later has to reach this statement in the same change. Normalisation and validation are create_library_article''s. An id no article has raises no_data_found rather than silently saving nothing.';


--
-- Name: FUNCTION save_library_article(p_id uuid, p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_library_article(p_id uuid, p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_library_article(p_id uuid, p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.save_library_article(p_id uuid, p_title text, p_summary text, p_body text, p_category public.library_article_category, p_cover_image_id uuid) TO service_role;


