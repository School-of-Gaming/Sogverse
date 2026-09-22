--
-- Name: _list_policy_expressions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_policy_expressions() RETURNS TABLE(table_name text, policy_name text, expression text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.tablename::text,
         p.policyname::text,
         COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, '')
    FROM pg_catalog.pg_policies p
   WHERE p.schemaname = 'public';
$$;


--
-- Name: FUNCTION _list_policy_expressions(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public._list_policy_expressions() IS 'Every RLS policy in the public schema with its expression text — USING and WITH CHECK concatenated, since every caller asks whether a policy REFERENCES something rather than in which half. The policy-side twin of _list_function_authorization_surface(), and it exists because pg_policies is a catalog view the DB tests have no path to: they speak to PostgREST, which answers RPC calls, so a catalog question needs a function to ask it through. Read only by the DB test suite — the assignment-gate completeness check in tests/db/session-substitution.test.ts is the first caller — which is why it is service_role only: policy text describes the security model and no client role has business reading it.';


--
-- Name: FUNCTION _list_policy_expressions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_policy_expressions() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_policy_expressions() TO service_role;


