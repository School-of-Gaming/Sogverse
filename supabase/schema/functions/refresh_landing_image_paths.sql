--
-- Name: refresh_landing_image_paths(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_landing_image_paths() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_page uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.share_image_id IS NULL THEN RETURN NULL; END IF;
    v_page := NEW.page_id;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.share_image_id IS NULL THEN RETURN NULL; END IF;
    v_page := OLD.page_id;
  ELSE
    IF NEW.share_image_id IS NOT DISTINCT FROM OLD.share_image_id THEN RETURN NULL; END IF;
    v_page := NEW.page_id;
  END IF;

  -- A version removed with its copy (an unpublish's cascade) finds no row.
  IF TG_TABLE_NAME = 'landing_page_translations' THEN
    UPDATE public.landing_pages SET image_paths = image_paths WHERE id = v_page;
  ELSE
    UPDATE public.landing_page_publications SET image_paths = image_paths WHERE page_id = v_page;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION refresh_landing_image_paths(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.refresh_landing_image_paths() IS 'AFTER INSERT, UPDATE OF share_image_id or DELETE on landing_page_translations and landing_page_publication_translations: when a version''s share picture is added, changed or removed (with its version or alone), touches the copy''s row so apply_landing_image_paths re-derives the copy''s image_paths. That is what makes a share picture named by one language alone count as in use, refuses one that is gone or of another purpose at the version''s write, and lets it stop counting when no version names it.';


--
-- Name: FUNCTION refresh_landing_image_paths(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_landing_image_paths() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_landing_image_paths() TO service_role;


