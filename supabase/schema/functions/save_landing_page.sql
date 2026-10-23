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

  -- Written first, so each version's words are checked against this
  -- structure.
  UPDATE public.landing_pages SET sections = p_sections
  WHERE id = p_id;

  FOR v_version IN SELECT e FROM jsonb_array_elements(p_versions) AS t(e) LOOP
    PERFORM public.write_landing_page_version(
      p_id,
      v_version->>'locale',
      v_version->>'title',
      v_version->>'summary',
      v_version->>'slug',
      v_version->>'default_slug',
      v_version->'section_texts',
      v_version->>'share_title',
      (v_version->>'share_image_id')::uuid,
      v_version->>'share_image_alt');
  END LOOP;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) IS 'Internal: the save of a landing page''s WHOLE working copy, for create_landing_page and clone_landing_page, which call it on the row they have just inserted; returns its id. Not executable by authenticated or anon; its admin guard runs inside their calls. Never touches the published copy. p_sections is the structure (landing_sections_problem names what is wrong with one, as check_violation). p_versions is the new page''s version set, a JSON array of {locale, title, summary, slug, default_slug, section_texts, share_title, share_image_id, share_image_alt}. At least one version, each written by write_landing_page_version''s rules; a locale named twice, or p_versions not an array, raises 22023. SECURITY DEFINER because no landing page table carries a write grant.';


--
-- Name: FUNCTION save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_landing_page(p_id uuid, p_sections jsonb, p_versions jsonb) TO service_role;


