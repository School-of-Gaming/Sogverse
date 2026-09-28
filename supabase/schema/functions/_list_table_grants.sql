--
-- Name: _list_table_grants(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_table_grants(p_grantee text) RETURNS TABLE(table_name text, privilege_type text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT table_name::text, privilege_type::text
  FROM information_schema.table_privileges
  WHERE grantee = p_grantee
    AND table_schema = 'public'
  ORDER BY table_name, privilege_type;
$$;


--
-- Name: FUNCTION _list_table_grants(p_grantee text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_table_grants(p_grantee text) FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_table_grants(p_grantee text) TO service_role;


