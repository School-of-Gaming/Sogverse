--
-- Name: cascade_landing_structure(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cascade_landing_structure() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'landing_pages' THEN
    -- Every version is rewritten, so the completeness trigger recomputes each
    -- against the new structure even where no text was dropped.
    UPDATE public.landing_page_translations
       SET section_texts = public.landing_texts_for_sections(NEW.sections, section_texts)
     WHERE page_id = NEW.id;
  ELSE
    UPDATE public.landing_page_publication_translations
       SET section_texts = public.landing_texts_for_sections(NEW.sections, section_texts)
     WHERE page_id = NEW.page_id
       AND section_texts IS DISTINCT FROM public.landing_texts_for_sections(NEW.sections, section_texts);
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION cascade_landing_structure(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cascade_landing_structure() IS 'AFTER UPDATE OF sections on landing_pages and landing_page_publications: drops from every version of that copy the text of any section the structure no longer holds — so a structure write that removes a section removes its words in every language, whoever made it — and, on the working copy, recomputes every version''s is_complete against the new structure.';


--
-- Name: FUNCTION cascade_landing_structure(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cascade_landing_structure() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cascade_landing_structure() TO service_role;


