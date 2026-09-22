--
-- Name: _list_security_definer_without_search_path(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_security_definer_without_search_path() RETURNS TABLE(function_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.proname::text AS function_name
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS c
      WHERE c LIKE 'search_path=%'
    );
$$;


--
-- Name: FUNCTION _list_security_definer_without_search_path(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_security_definer_without_search_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_security_definer_without_search_path() TO service_role;


