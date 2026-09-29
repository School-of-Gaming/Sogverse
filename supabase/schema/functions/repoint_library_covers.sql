--
-- Name: repoint_library_covers(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.repoint_library_covers(p_from uuid, p_to uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_moved integer;
BEGIN
  PERFORM public.assert_admin();

  -- Moving covers to no entry is a removal, which the catalogue does by
  -- deleting the entry; this function only ever moves them to another.
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'A repoint needs the entry being replaced and its replacement'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  WITH drafts AS (
    UPDATE public.library_articles
       SET cover_image_id = p_to
     WHERE cover_image_id = p_from
    RETURNING id
  ),
  live AS (
    UPDATE public.library_article_publications
       SET cover_image_id = p_to
     WHERE cover_image_id = p_from
    RETURNING article_id
  )
  SELECT count(*) INTO v_moved
    FROM (SELECT id FROM drafts UNION SELECT article_id FROM live) AS moved;

  RETURN v_moved;
END;
$$;


--
-- Name: FUNCTION repoint_library_covers(p_from uuid, p_to uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.repoint_library_covers(p_from uuid, p_to uuid) IS 'Admin-gated half of the image catalogue''s replace: points every Library cover that uses entry p_from — working copies and published copies alike — at entry p_to, in one statement, and returns how many articles moved (an article whose working and live covers both moved counts once). A live article''s cover changes without a republish. The cover-path trigger re-derives each path and refuses a p_to that is gone or not a library cover. Either argument NULL raises null_value_not_allowed. SECURITY DEFINER because neither Library table carries a write grant.';


--
-- Name: FUNCTION repoint_library_covers(p_from uuid, p_to uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.repoint_library_covers(p_from uuid, p_to uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.repoint_library_covers(p_from uuid, p_to uuid) TO authenticated;
GRANT ALL ON FUNCTION public.repoint_library_covers(p_from uuid, p_to uuid) TO service_role;


