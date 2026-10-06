--
-- Name: save_landing_page(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_problem text;
  v_version jsonb;
BEGIN
  PERFORM public.assert_admin();

  IF p_versions IS NULL OR jsonb_typeof(p_versions) <> 'array' THEN
    RAISE EXCEPTION 'p_versions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  v_problem := public.landing_sections_problem(p_sections);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_array_length(p_versions) = 0 THEN
    RAISE EXCEPTION 'A landing page needs a title'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(DISTINCT e->>'locale') <> count(*)
        FROM jsonb_array_elements(p_versions) AS t(e)) THEN
    RAISE EXCEPTION 'Each language may have one version'
      USING ERRCODE = '22023';
  END IF;

  -- Written first, so an id no page has is refused before any version is, the
  -- row's updated_at and saver move, and the row lock publish takes orders
  -- this save wholly before or after a publish. The structure trigger drops
  -- the text of any section this structure no longer holds.
  UPDATE public.landing_pages SET sections = p_sections
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The version set is replaced whole: a locale the save no longer names is
  -- gone, and every named one is written as sent.
  DELETE FROM public.landing_page_translations t
   WHERE t.page_id = p_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_versions) e
        WHERE e->>'locale' = t.locale);

  FOR v_version IN SELECT e FROM jsonb_array_elements(p_versions) AS t(e) LOOP
    PERFORM public.write_landing_page_version(
      p_id,
      v_version->>'locale',
      v_version->>'title',
      v_version->>'summary',
      v_version->>'slug',
      v_version->>'default_slug',
      v_version->'section_texts');
  END LOOP;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) IS 'Admin-gated save of a landing page''s WHOLE working copy; returns its id. Never touches the published copy. p_sections is the structure (landing_sections_problem names what is wrong with one, as check_violation). p_versions is the whole version set, a JSON array of {locale, title, summary, slug, default_slug, section_texts}, replacing what was stored: a locale it omits is removed. At least one version, each written by write_landing_page_version''s rules; a locale named twice, or p_versions not an array, raises 22023. An id no page has raises no_data_found. SECURITY DEFINER because no landing page table carries a write grant.';


--
-- Name: FUNCTION save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) TO service_role;


