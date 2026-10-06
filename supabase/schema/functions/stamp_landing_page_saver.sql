--
-- Name: stamp_landing_page_saver(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_landing_page_saver() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.last_saved_by  := auth.uid();
  NEW.last_saved_via := NULL;

  -- A client is recorded only beside a saver: with no signed-in caller there
  -- is no token whose claim could name one.
  IF NEW.last_saved_by IS NOT NULL THEN
    NEW.last_saved_via := (auth.jwt() ->> 'client_id')::uuid;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION stamp_landing_page_saver(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.stamp_landing_page_saver() IS 'BEFORE INSERT, and BEFORE UPDATE of the working copy''s own content (sections, updated_at), on landing_pages: stamps last_saved_by from auth.uid() and last_saved_via from the token''s client_id claim, overwriting whatever the statement said, so it is both columns'' only writer. Every landing page writer touches one of those columns, and so do the catalogue''s replace and removal. The column list keeps a profile deletion''s SET NULL from being re-stamped as a save.';


--
-- Name: FUNCTION stamp_landing_page_saver(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.stamp_landing_page_saver() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stamp_landing_page_saver() TO service_role;


