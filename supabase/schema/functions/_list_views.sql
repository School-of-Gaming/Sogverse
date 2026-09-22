--
-- Name: _list_views(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_views() RETURNS TABLE(view_name text, kind text, security_invoker boolean, authenticated_select boolean, anon_select boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    c.relname::text,
    CASE c.relkind
      WHEN 'v' THEN 'view'
      WHEN 'm' THEN 'materialized view'
    END,
    COALESCE(c.reloptions @> ARRAY['security_invoker=true'], false),
    EXISTS (
      SELECT 1
        FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = c.oid
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND pg_catalog.has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')
    ),
    EXISTS (
      SELECT 1
        FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = c.oid
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND pg_catalog.has_column_privilege('anon', c.oid, a.attnum, 'SELECT')
    )
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('v', 'm')
  ORDER BY 1;
$$;


--
-- Name: FUNCTION _list_views(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public._list_views() IS 'Every view-shaped relation in the public schema — plain and materialized — with the three things that decide whether it is safe: which class it is, whether it runs as its caller (security_invoker), and which of the two Data API roles can read any part of it. Exposure is measured per column, so a relation reachable only through a column-level GRANT still reports as exposed. Materialized views are reported so the tests can ban them: one can take neither security_invoker nor RLS, and its rows were computed under a BYPASSRLS role. Read only by the DB test suite — the sweep in access-control.test.ts and the completeness checks in authorization-spine.test.ts — which is why it is service_role only.';


--
-- Name: FUNCTION _list_views(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_views() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_views() TO service_role;


