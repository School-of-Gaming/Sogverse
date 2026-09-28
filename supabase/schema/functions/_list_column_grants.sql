--
-- Name: _list_column_grants(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_column_grants(p_grantee text) RETURNS TABLE(table_name text, column_name text, privilege_type text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT c.table_name::text, c.column_name::text, c.privilege_type::text
  FROM information_schema.column_privileges c
  WHERE c.grantee = p_grantee
    AND c.table_schema = 'public'
  ORDER BY 1, 2, 3;
$$;


--
-- Name: FUNCTION _list_column_grants(p_grantee text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_column_grants(p_grantee text) FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_column_grants(p_grantee text) TO service_role;


