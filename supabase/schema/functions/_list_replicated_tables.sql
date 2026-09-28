--
-- Name: _list_replicated_tables(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_replicated_tables() RETURNS TABLE(table_name text, replica_identity text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    pt.tablename::text,
    -- A two-arm-plus CASE with NO else, deliberately, exactly as `_list_views`
    -- reports a relation kind: an unrecognised replica-identity code arrives as
    -- NULL and fails the caller's parse instead of being quietly read as one of
    -- the four we know about.
    CASE c.relreplident
      WHEN 'd' THEN 'default'
      WHEN 'n' THEN 'nothing'
      WHEN 'f' THEN 'full'
      WHEN 'i' THEN 'index'
    END
    FROM pg_catalog.pg_publication_tables pt
    JOIN pg_catalog.pg_namespace n ON n.nspname = pt.schemaname
    JOIN pg_catalog.pg_class c
      ON c.relname = pt.tablename
     AND c.relnamespace = n.oid
   WHERE pt.pubname = 'supabase_realtime'
     AND pt.schemaname = 'public'
   ORDER BY 1;
$$;


--
-- Name: FUNCTION _list_replicated_tables(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public._list_replicated_tables() IS 'Every public table in the `supabase_realtime` publication, with its replica identity. Test-only catalog reader, `service_role` alone, and it exists because publication membership and replica identity are invisible to every other check we have: neither appears in schema.sql, and a table left out of the publication fails silently — every client still sees its own optimistic echo and nothing anybody else sends ever arrives. The identity half matters for the same reason one step in: a DELETE replicates its OLD row only, so a filtered subscription needs FULL wherever a delete is a real event.';


--
-- Name: FUNCTION _list_replicated_tables(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_replicated_tables() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_replicated_tables() TO service_role;


