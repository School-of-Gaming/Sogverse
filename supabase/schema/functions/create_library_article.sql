--
-- Name: create_library_article(jsonb, public.library_article_category, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_library_article(p_versions jsonb, p_category public.library_article_category DEFAULT NULL::public.library_article_category, p_cover_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();

  INSERT INTO public.library_articles (author_id)
  VALUES (auth.uid())
  RETURNING id INTO v_id;

  -- The save's own validation and writes, so a create and a save can never
  -- disagree about what an article may hold. A refusal there aborts this
  -- whole call, the row above included.
  PERFORM public.save_library_article(v_id, p_versions, p_category, p_cover_image_id);

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION create_library_article(p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_library_article(p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid) IS 'Admin-gated create of a Library article''s working copy; returns its id, which is the article''s URL. Stamps the caller as author, then writes the versions, category and cover through save_library_article, whose rules and refusals are this function''s: at least one version, each with a title. Nothing is published. SECURITY DEFINER because the working tables carry no write grant. The optional parameters default NULL because codegen cannot express an explicit null for a non-defaulted argument.';


--
-- Name: FUNCTION create_library_article(p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_library_article(p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_library_article(p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_library_article(p_versions jsonb, p_category public.library_article_category, p_cover_image_id uuid) TO service_role;


