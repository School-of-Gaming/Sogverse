--
-- Name: save_landing_page_structure(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_problem text;
BEGIN
  PERFORM public.assert_admin();

  v_problem := public.landing_sections_problem(p_sections);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.landing_pages SET sections = p_sections
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_landing_page_structure(p_id uuid, p_sections jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb) IS 'Admin-gated save of a landing page''s working-copy STRUCTURE alone — the ordered sections and their shared fields; returns the page id. No version''s words are written, except that the text of a section the new structure drops is dropped from every language (cascade_landing_structure). A malformed structure raises check_violation naming the problem; an id no page has raises no_data_found. Never touches the published copy. SECURITY DEFINER because the working copy carries no write grant.';


--
-- Name: FUNCTION save_landing_page_structure(p_id uuid, p_sections jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_landing_page_structure(p_id uuid, p_sections jsonb) TO service_role;


