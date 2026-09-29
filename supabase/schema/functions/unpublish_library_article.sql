--
-- Name: unpublish_library_article(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unpublish_library_article(p_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.library_articles WHERE id = p_id) THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.library_article_publications WHERE article_id = p_id;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION unpublish_library_article(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.unpublish_library_article(p_id uuid) IS 'Admin-gated unpublish: deletes the article''s published copy, taking it off every public page, and leaves the working copy exactly as it was. It exists so a mistake can be taken down; there is no delete of the article itself. Unpublishing an article that is not live is a no-op, since the state asked for already holds; an id no article has raises no_data_found. Publishing again afterwards starts a new first_published_at.';


--
-- Name: FUNCTION unpublish_library_article(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unpublish_library_article(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unpublish_library_article(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unpublish_library_article(p_id uuid) TO service_role;


