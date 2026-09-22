--
-- Name: _list_function_authorization_surface(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_function_authorization_surface() RETURNS TABLE(function_name text, function_language text, is_security_definer boolean, is_strict boolean, authenticated_access boolean, anon_access boolean, argument_names text[], body text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    p.proname::text,
    l.lanname::text,
    p.prosecdef,
    p.proisstrict,
    pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
    -- proargnames carries OUT/TABLE column names after the input args, so slice
    -- to pronargs. NULL when the function takes no arguments at all.
    COALESCE(p.proargnames[1:p.pronargs], '{}'::text[]),
    p.prosrc::text
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language  l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    -- Trigger functions are not a callable surface: PostgREST cannot invoke them
    -- and PostgreSQL only runs them from a trigger context. Same exclusion the
    -- RPC-access view this replaces used.
    AND p.prorettype <> 'pg_catalog.trigger'::pg_catalog.regtype;
$$;


--
-- Name: FUNCTION _list_function_authorization_surface(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_function_authorization_surface() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_function_authorization_surface() TO service_role;


