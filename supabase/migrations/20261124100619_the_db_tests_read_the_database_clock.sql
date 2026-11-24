-- The DB tests read the database's clock.
--
-- The tests run on the host and the database in a WSL2 kernel whose clock
-- drifts seconds from the host's, and minutes after the host sleeps. A test
-- that builds a time near a boundary the database judges against its own
-- `now()` from the test process's clock then fails intermittently. The tests
-- read the database's clock through this function instead.
--
-- Not SECURITY DEFINER: reading the clock needs no privilege. Service role
-- only, and nothing in the application calls it.

CREATE FUNCTION public.db_clock() RETURNS timestamptz
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT clock_timestamp() $$;

COMMENT ON FUNCTION public.db_clock() IS 'The database''s wall clock, read at the call (clock_timestamp(), not the transaction''s now()). The DB test suite reads it so its tests never depend on the test runner''s clock agreeing with the database''s. Service role only; it reveals nothing a response''s Date header does not.';

REVOKE ALL ON FUNCTION public.db_clock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.db_clock() TO service_role;
