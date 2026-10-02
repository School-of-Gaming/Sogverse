--
-- Name: set_library_article_category(uuid, public.library_article_category); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_library_article_category(p_id uuid, p_category public.library_article_category DEFAULT NULL::public.library_article_category) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  UPDATE public.library_articles SET category = p_category
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION set_library_article_category(p_id uuid, p_category public.library_article_category); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_library_article_category(p_id uuid, p_category public.library_article_category) IS 'Admin-gated write of a Library article''s working-copy category alone; returns the article id. NULL clears it, which publishing then refuses. Touches nothing else, and never the published copy. An id no article has raises no_data_found. SECURITY DEFINER because the working copy carries no write grant. p_category defaults NULL because codegen cannot express an explicit null for a non-defaulted argument.';


--
-- Name: FUNCTION set_library_article_category(p_id uuid, p_category public.library_article_category); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_library_article_category(p_id uuid, p_category public.library_article_category) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_library_article_category(p_id uuid, p_category public.library_article_category) TO authenticated;
GRANT ALL ON FUNCTION public.set_library_article_category(p_id uuid, p_category public.library_article_category) TO service_role;


