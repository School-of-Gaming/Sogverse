--
-- Name: refresh_landing_pictures(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_landing_pictures() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_page uuid;
BEGIN
  -- The pictures a version's words name: its hero picture, read without the
  -- structure, since only the hero's words carry an imageId.
  IF TG_OP = 'INSERT' THEN
    IF NEW.share_image_id IS NULL
       AND jsonb_path_query_array(NEW.section_texts, '$.*.imageId') = '[]'::jsonb THEN
      RETURN NULL;
    END IF;
    v_page := NEW.page_id;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.share_image_id IS NULL
       AND jsonb_path_query_array(OLD.section_texts, '$.*.imageId') = '[]'::jsonb THEN
      RETURN NULL;
    END IF;
    v_page := OLD.page_id;
  ELSE
    IF NEW.share_image_id IS NOT DISTINCT FROM OLD.share_image_id
       AND jsonb_path_query_array(NEW.section_texts, '$.*.imageId')
           = jsonb_path_query_array(OLD.section_texts, '$.*.imageId') THEN
      RETURN NULL;
    END IF;
    v_page := NEW.page_id;
  END IF;

  -- A version removed with its copy (an unpublish's cascade) finds no row.
  IF TG_TABLE_NAME = 'landing_page_translations' THEN
    UPDATE public.landing_pages SET pictures = pictures WHERE id = v_page;
  ELSE
    UPDATE public.landing_page_publications SET pictures = pictures WHERE page_id = v_page;
  END IF;

  RETURN NULL;
END;
$_$;


--
-- Name: FUNCTION refresh_landing_pictures(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.refresh_landing_pictures() IS 'AFTER INSERT, UPDATE OF share_image_id or section_texts, or DELETE on landing_page_translations and landing_page_publication_translations: when a version''s share picture or hero picture (the imageId in its words) is added, changed or removed (with its version or alone), touches the copy''s row so apply_landing_pictures re-derives the copy''s pictures. That is what makes a picture named by one language alone count as in use, refuses one that is gone, not a landing picture or not wide at the version''s write, and lets it stop counting when no version names it. A write of the words that leaves their pictures as they were touches nothing.';


--
-- Name: FUNCTION refresh_landing_pictures(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_landing_pictures() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_landing_pictures() TO service_role;


