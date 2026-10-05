--
-- Name: create_landing_page(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();

  -- An empty structure stands in until the save below writes the real one; a
  -- refusal there aborts this whole call, the row included.
  INSERT INTO public.landing_pages (author_id, sections)
  VALUES (auth.uid(), '[]'::jsonb)
  RETURNING id INTO v_id;

  PERFORM public.save_landing_page(v_id, p_sections, p_versions);

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION create_landing_page(p_sections jsonb, p_versions jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb) IS 'Admin-gated create of a landing page''s working copy; returns its id. Stamps the caller as author, then writes the structure and versions through save_landing_page, whose rules and refusals are this function''s. Nothing is published. SECURITY DEFINER because the working tables carry no write grant.';


--
-- Name: FUNCTION create_landing_page(p_sections jsonb, p_versions jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_landing_page(p_sections jsonb, p_versions jsonb) TO service_role;


