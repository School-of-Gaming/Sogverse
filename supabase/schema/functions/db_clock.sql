--
-- Name: db_clock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.db_clock() RETURNS timestamp with time zone
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT clock_timestamp() $$;


--
-- Name: FUNCTION db_clock(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.db_clock() IS 'The database''s wall clock, read at the call (clock_timestamp(), not the transaction''s now()). The DB test suite reads it so its tests never depend on the test runner''s clock agreeing with the database''s. Service role only; it reveals nothing a response''s Date header does not.';


--
-- Name: FUNCTION db_clock(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.db_clock() FROM PUBLIC;
GRANT ALL ON FUNCTION public.db_clock() TO service_role;


