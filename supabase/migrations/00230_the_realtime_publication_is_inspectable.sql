-- The realtime publication is inspectable.
--
-- **Publication membership appears nowhere in `schema.sql` and is asserted by
-- no existing check.** `pg_dump` does not emit `ALTER PUBLICATION` for the
-- platform's own `supabase_realtime`, and neither does the CI snapshot, so a
-- table's membership is visible only in the migration that added it — and a
-- table MISSING from the publication degrades silently and totally: every
-- client's own optimistic echo still works, nothing anybody else sends ever
-- arrives, and no test fails. Replica identity has the same shape of problem
-- one step further in: a DELETE only replicates usefully when the OLD row
-- carries the column a subscriber filters on, so a table whose un-reaction is a
-- DELETE needs REPLICA IDENTITY FULL and nothing says so out loud.
--
-- 00228 put the three chat tables in the publication and set FULL on the
-- reactions table. This migration is the catalog helper that lets a DB test
-- assert both facts, in the shape the five `_list_*` helpers already use: a
-- `SECURITY DEFINER` reader over a system view, granted to `service_role`
-- alone, so the test client can ask the catalog a question PostgREST otherwise
-- cannot reach. It creates nothing else and changes no behaviour.
--
-- Not exposed to `authenticated` or `anon`, so it needs no authorization-spine
-- classification — the same posture every other `_list_*` helper carries.

CREATE FUNCTION public._list_replicated_tables()
  RETURNS TABLE (table_name text, replica_identity text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
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

COMMENT ON FUNCTION public._list_replicated_tables() IS
  'Every public table in the `supabase_realtime` publication, with its replica '
  'identity. Test-only catalog reader, `service_role` alone, and it exists '
  'because publication membership and replica identity are invisible to every '
  'other check we have: neither appears in schema.sql, and a table left out of '
  'the publication fails silently — every client still sees its own optimistic '
  'echo and nothing anybody else sends ever arrives. The identity half matters '
  'for the same reason one step in: a DELETE replicates its OLD row only, so a '
  'filtered subscription needs FULL wherever a delete is a real event.';

REVOKE EXECUTE ON FUNCTION public._list_replicated_tables()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._list_replicated_tables() TO service_role;
