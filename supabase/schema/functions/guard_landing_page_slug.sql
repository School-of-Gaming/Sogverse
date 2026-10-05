--
-- Name: guard_landing_page_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_landing_page_slug() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_live text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.first_published_at IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'The % address of this page is fixed now that it has been published: it stays "%"', NEW.locale, OLD.slug
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.first_published_at := OLD.first_published_at;
    RETURN NEW;
  END IF;

  -- A version written again after a whole save removed it, while the
  -- language is still live: the live address holds, and the version is fixed
  -- from the start.
  SELECT slug INTO v_live
    FROM public.landing_page_publication_translations
   WHERE page_id = NEW.page_id AND locale = NEW.locale;

  IF v_live IS NOT NULL THEN
    IF NEW.slug IS DISTINCT FROM v_live THEN
      RAISE EXCEPTION 'The % address of this page is fixed now that it has been published: it stays "%"', NEW.locale, v_live
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.first_published_at := now();
  ELSE
    NEW.first_published_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION guard_landing_page_slug(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.guard_landing_page_slug() IS 'BEFORE INSERT, and BEFORE UPDATE of slug, on landing_page_translations: a version''s slug is fixed once its language has been published. An update changing the slug of a version with first_published_at set raises check_violation, and an update naming the slug keeps first_published_at as it was; publish_landing_page''s stamp names only first_published_at. An insert for a language that is live must carry the live slug, and starts fixed; any other insert starts unfixed.';


--
-- Name: FUNCTION guard_landing_page_slug(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_landing_page_slug() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_landing_page_slug() TO service_role;


