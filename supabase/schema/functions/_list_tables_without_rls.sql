--
-- Name: _list_tables_without_rls(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_tables_without_rls() RETURNS TABLE(table_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT tablename::text AS table_name
  FROM pg_catalog.pg_tables
  WHERE schemaname = 'public'
    AND NOT rowsecurity;
$$;


--
-- Name: FUNCTION _list_tables_without_rls(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_tables_without_rls() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_tables_without_rls() TO service_role;


