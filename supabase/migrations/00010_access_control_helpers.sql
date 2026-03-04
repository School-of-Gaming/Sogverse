-- Access control helper functions for automated security testing.
-- Both are SECURITY DEFINER so they can query pg_proc/pg_tables,
-- and REVOKED from all roles — only callable via service-role (admin client).

-- Returns all non-trigger public-schema functions with their effective permissions.
CREATE OR REPLACE FUNCTION _list_rpc_access()
RETURNS TABLE (
  function_name text,
  authenticated_access boolean,
  anon_access boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    p.proname::text AS function_name,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_access,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_access
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prorettype != 'pg_catalog.trigger'::pg_catalog.regtype;
$$;

-- Returns public-schema tables that do NOT have RLS enabled.
CREATE OR REPLACE FUNCTION _list_tables_without_rls()
RETURNS TABLE (
  table_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT tablename::text AS table_name
  FROM pg_catalog.pg_tables
  WHERE schemaname = 'public'
    AND NOT rowsecurity;
$$;

-- Returns all registered pg_cron jobs (name, schedule, command).
CREATE OR REPLACE FUNCTION _list_cron_jobs()
RETURNS TABLE (
  jobname text,
  schedule text,
  command text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT j.jobname::text, j.schedule::text, j.command::text
  FROM cron.job j;
$$;

-- Revoke from all roles — only service-role can call these.
REVOKE EXECUTE ON FUNCTION _list_rpc_access() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION _list_tables_without_rls() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION _list_cron_jobs() FROM authenticated, anon, public;
