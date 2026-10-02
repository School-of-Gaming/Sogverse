--
-- Name: set_library_article_cover(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_library_article_cover(p_id uuid, p_cover_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- The cover-path trigger derives the path and refuses an entry that is
  -- gone or not a Library cover.
  UPDATE public.library_articles SET cover_image_id = p_cover_image_id
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION set_library_article_cover(p_id uuid, p_cover_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_library_article_cover(p_id uuid, p_cover_image_id uuid) IS 'Admin-gated write of a Library article''s working-copy cover alone; returns the article id. The cover is a catalogue entry id, and NULL clears it; the cover-path trigger derives the path and refuses an entry that is gone (23503) or not a library_cover (23514). Touches nothing else, and never the published copy. An id no article has raises no_data_found. SECURITY DEFINER because the working copy carries no write grant. p_cover_image_id defaults NULL because codegen cannot express an explicit null for a non-defaulted argument.';


--
-- Name: FUNCTION set_library_article_cover(p_id uuid, p_cover_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_library_article_cover(p_id uuid, p_cover_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_library_article_cover(p_id uuid, p_cover_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.set_library_article_cover(p_id uuid, p_cover_image_id uuid) TO service_role;


