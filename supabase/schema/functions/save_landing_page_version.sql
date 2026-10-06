--
-- Name: save_landing_page_version(uuid, text, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_default_slug text DEFAULT NULL::text, p_section_texts jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'The % version needs a title', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Written first, so an id no page has is refused before the version is, the
  -- row's updated_at and saver move, and publish's row lock orders this write
  -- wholly before or after a publish. Nothing else on the row changes.
  UPDATE public.landing_pages SET updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_landing_page_version(
    p_id, p_locale, p_title, p_summary, p_slug, p_default_slug, p_section_texts);

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) IS 'Admin-gated save of ONE language version of a landing page''s working copy — its title, summary, slug and every section''s text in that locale; returns the page id. Writes the (page, locale) row by write_landing_page_version''s rules, creating it when the language is new, and touches no other version and not the structure, so a structure write and a one-language write never undo each other. Never touches the published copy. An id no page has raises no_data_found. SECURITY DEFINER because no working table carries a write grant. The optional parameters default NULL because codegen cannot express an explicit null for a non-defaulted argument.';


--
-- Name: FUNCTION save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_landing_page_version(p_id uuid, p_locale text, p_title text, p_summary text, p_slug text, p_default_slug text, p_section_texts jsonb) TO service_role;


