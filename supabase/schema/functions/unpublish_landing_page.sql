--
-- Name: unpublish_landing_page(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unpublish_landing_page(p_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.landing_pages WHERE id = p_id) THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.landing_page_publications WHERE page_id = p_id;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION unpublish_landing_page(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.unpublish_landing_page(p_id uuid) IS 'Admin-gated unpublish: deletes the page''s published copy, every language version with it, and leaves the working copy exactly as it was, slugs included. Unpublishing a page that is not live is a no-op; an id no page has raises no_data_found. Publishing again afterwards starts a new first_published_at.';


--
-- Name: FUNCTION unpublish_landing_page(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unpublish_landing_page(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unpublish_landing_page(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unpublish_landing_page(p_id uuid) TO service_role;


