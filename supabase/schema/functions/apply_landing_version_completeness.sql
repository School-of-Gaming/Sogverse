--
-- Name: apply_landing_version_completeness(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_landing_version_completeness() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.is_complete := cardinality(public.landing_version_missing(
    (SELECT p.sections FROM public.landing_pages p WHERE p.id = NEW.page_id),
    NEW.title, NEW.summary, NEW.slug, NEW.section_texts)) = 0;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION apply_landing_version_completeness(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_landing_version_completeness() IS 'BEFORE INSERT OR UPDATE on landing_page_translations: derives is_complete from landing_version_missing against the page''s current structure, whatever the statement said. A structure change recomputes every version through cascade_landing_structure.';


--
-- Name: FUNCTION apply_landing_version_completeness(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_landing_version_completeness() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_landing_version_completeness() TO service_role;


