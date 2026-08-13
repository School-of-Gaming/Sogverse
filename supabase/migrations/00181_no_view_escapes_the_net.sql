-- 00181: no view escapes the net — not by relkind, and not by a column grant.
--
-- 00180 gave views the two checks tables have had all along: a sweep for the
-- structural switch (`security_invoker`, the analogue of `rowsecurity`) and a
-- completeness check tying every exposed view to a named scope test. Both read
-- `_list_views()`, and a review of that helper found two ways a relation can be
-- readable through the Data API and still be returned by none of its rows.
--
-- HOLE 1 — A MATERIALIZED VIEW IS NOT relkind 'v'.
--
--   It is 'm', so the helper's filter never sees one and neither check has an
--   opinion about it. That is worse than the case the net was built for, not a
--   milder version of it. A plain view *can* be fixed by setting the flag; a
--   matview cannot, on three counts at once:
--
--     * `security_invoker` is not a valid option on one — there is no query to
--       re-run as the caller, because the rows were computed once already.
--     * It cannot carry RLS. `ALTER … ENABLE ROW LEVEL SECURITY` does not apply
--       to a matview, so there are no policies for a caller to be judged by.
--     * Its contents were materialized under the role that refreshed it, and
--       that role holds BYPASSRLS. The stored rows are therefore every row of
--       everything it selected from, already flattened, with no predicate left
--       anywhere to narrow them.
--
--   So `GRANT SELECT … TO authenticated` on a matview hands every signed-in
--   caller the whole underlying table through PostgREST, and no amount of care
--   in the application changes that. There is no safe form of the object here,
--   which is why this migration bans the class outright rather than adding a
--   flag check for it. Zero exist today: this is prevention, and the cheapest
--   moment to write it down is before the first one is proposed for a dashboard
--   rollup.
--
-- HOLE 2 — EXPOSURE WAS MEASURED TABLE-LEVEL ONLY.
--
--   `has_table_privilege(role, oid, 'SELECT')` answers about the relation as a
--   whole and is false when the role holds only `GRANT SELECT(col) ON v TO
--   authenticated`. Such a view is perfectly readable through the Data API —
--   PostgREST will answer a select of that column — while reporting
--   `authenticated_select = false`, so the spine's "every exposed view is
--   classified" check would skip it and its scope test would never be demanded.
--   Zero instances exist today, but the distinction is live rather than
--   theoretical: the column-grant audit in the spine exists precisely because
--   this codebase already grants at column level (the self-editable `profiles`
--   fields), so the day a view is granted that way is a day that can arrive.
--
-- WHAT THIS CHANGES
--
--   `_list_views()` is dropped and recreated one column wider, over
--   relkind IN ('v','m'), measuring exposure with `has_column_privilege`.
--
--   `kind` exists so the consuming failure message can be HONEST. A matview
--   told to "set security_invoker = true" is being told to do something the
--   grammar does not allow; the only true thing to say about one is that it must
--   not exist. One helper serving both object classes therefore has to hand its
--   caller the class, or the caller cannot phrase either message correctly.
--
--   `has_column_privilege(role, oid, attnum, 'SELECT')` is true when the role
--   holds the privilege on the whole relation OR on that one column, so a single
--   EXISTS over the live columns subsumes the old table-level test rather than
--   sitting beside it. There is no widening of what counts as exposed for the
--   view that exists today — a table-level grant satisfies the column predicate
--   for every column — only a narrowing of the ways one can hide.
--
-- WHY DROP AND CREATE, AND WHY THE GRANTS ARE RE-ISSUED
--
--   The return type changes, and `CREATE OR REPLACE FUNCTION` cannot change one.
--   A drop takes the function's ACL with it and the new object starts from the
--   default — which is PUBLIC-executable, not empty. That is not a theoretical
--   default: 00172 drop/recreated the paid-seat writers on staging and left
--   service-role-only functions callable by `anon` until the REVOKE was
--   re-issued. So section 2 below is a repeat of 00180's grants on purpose, and
--   deleting it as redundant would re-open that exact hole on a catalog reader.

-- ---------------------------------------------------------------------------
-- 1. The helper, one column wider.
--
-- The COALESCE on the flag is carried over from 00180 and is still the
-- load-bearing part of that expression: `NULL @> …` is NULL, and NULL reloptions
-- is exactly the dangerous case — a view created with no options at all. A
-- three-valued column would arrive at a filter written for two and pass through
-- it; a total boolean fails loudly instead.
--
-- The `kind` CASE has no ELSE, and that is deliberate. The WHERE clause is what
-- makes it total, so the two are one decision written in two places; widening
-- the filter without widening the CASE yields a NULL that the consumers' schema
-- rejects on sight, rather than a row quietly labelled as the wrong class.
-- ---------------------------------------------------------------------------

DROP FUNCTION public._list_views();

CREATE FUNCTION public._list_views()
RETURNS TABLE(
  view_name text,
  kind text,
  security_invoker boolean,
  authenticated_select boolean,
  anon_select boolean
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = ''
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

COMMENT ON FUNCTION public._list_views() IS
  'Every view-shaped relation in the public schema — plain and materialized — '
  'with the three things that decide whether it is safe: which class it is, '
  'whether it runs as its caller (security_invoker), and which of the two Data '
  'API roles can read any part of it. Exposure is measured per column, so a '
  'relation reachable only through a column-level GRANT still reports as '
  'exposed. Materialized views are reported so the tests can ban them: one can '
  'take neither security_invoker nor RLS, and its rows were computed under a '
  'BYPASSRLS role. Read only by the DB test suite — the sweep in '
  'access-control.test.ts and the completeness checks in '
  'authorization-spine.test.ts — which is why it is service_role only.';

-- ---------------------------------------------------------------------------
-- 2. Grants — re-issued, not inherited.
--
-- See the header: the drop above took 00180's ACL with it and left the new
-- function PUBLIC-executable. service_role and nothing else. Neither
-- `authenticated` nor `anon` gets it: this reads the privilege catalog, which is
-- reconnaissance, and no application path has any use for it.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public._list_views() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._list_views() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. End-state assertions.
--
-- The failure modes here are the ones a drop/recreate adds to 00180's list:
--
--   (a) TWO functions under the name. A drop that silently did not take, or a
--       second overload, leaves PostgREST unable to choose — and `admin.rpc
--       ("_list_views")` fails at the call rather than at the schema, which is
--       far from the cause.
--   (b) The OLD shape still live. Both consumers read the columns by name, and
--       a missing `kind` would surface as an undefined field rather than an
--       error, so pin the column list rather than the arity.
--   (c) The grants, in both directions — the recreate is exactly the moment the
--       REVOKE gets forgotten.
--   (d) The filter seeing everything it should. This is the only check here that
--       can make the two consuming tests pass VACUOUSLY: a wrong relkind list
--       yields an empty set, every filter over it is empty, and both go green
--       while verifying nothing. Comparing the helper's count against the
--       catalog's own count for the same predicate is a positive statement about
--       the filter, which `count(*) >= 1` was not.
--   (e) The two properties the consumers assert, stated here so this file's own
--       end state is checked and not merely its consumers' next CI run: no
--       matview exists, and no view lacks the flag.
--
-- (e)'s matview half is read from pg_class directly rather than through the
-- helper. With zero matviews in existence the helper cannot distinguish "none
-- exist" from "the filter does not see them", so asking it would be asking the
-- suspect to vouch for itself; (d) is what covers the filter.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_overloads bigint;
  v_argnames  text[];
  v_helper    bigint;
  v_catalog   bigint;
  v_offend    text;
BEGIN
  -- --- (a) Exactly one function under the name. -----------------------------
  SELECT count(*)
    INTO v_overloads
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = '_list_views';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION '_list_views has % definitions in public — PostgREST cannot choose between overloads and the DB tests would fail at the call site', v_overloads;
  END IF;

  -- --- (b) The widened shape, by column name. ------------------------------
  SELECT p.proargnames
    INTO v_argnames
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = '_list_views';
  IF v_argnames IS DISTINCT FROM ARRAY['view_name', 'kind', 'security_invoker', 'authenticated_select', 'anon_select'] THEN
    RAISE EXCEPTION '_list_views returns % — the consumers read all five columns by name, and a missing one reads as undefined rather than as an error', v_argnames;
  END IF;

  -- --- (c) Exactly one role may call it. -----------------------------------
  --
  -- has_function_privilege reports the EFFECTIVE privilege, so a surviving
  -- PUBLIC grant shows up as `anon` holding EXECUTE. Checking the two Data API
  -- roles therefore checks the REVOKE as well, without naming PUBLIC — which is
  -- not a role and cannot be passed to these functions at all.
  IF NOT has_function_privilege('service_role', 'public._list_views()', 'EXECUTE') THEN
    RAISE EXCEPTION '_list_views is not executable by service_role — the DB tests call it through that client';
  END IF;

  SELECT string_agg(r, ', ' ORDER BY r)
    INTO v_offend
    FROM unnest(ARRAY['authenticated', 'anon']) AS r
   WHERE has_function_privilege(r, 'public._list_views()', 'EXECUTE');
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION '_list_views is executable by %, which reads the privilege catalog to no application purpose (or PUBLIC still holds EXECUTE after the recreate)', v_offend;
  END IF;

  -- --- (d) The filter sees every view-shaped relation there is. -------------
  SELECT count(*) INTO v_helper FROM public._list_views();
  SELECT count(*)
    INTO v_catalog
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('v', 'm');
  IF v_helper IS DISTINCT FROM v_catalog THEN
    RAISE EXCEPTION '_list_views returned % of the % view-shaped relations in public — its filter is wrong, and every check built on it would pass while verifying nothing', v_helper, v_catalog;
  END IF;
  IF v_helper < 1 THEN
    RAISE EXCEPTION '_list_views returned no rows — user_search_index exists by 00179, so both the helper and the catalog query above disagree with history';
  END IF;

  -- --- (e) The properties themselves. --------------------------------------
  SELECT string_agg(c.relname::text, ', ' ORDER BY c.relname)
    INTO v_offend
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'm';
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'materialized view(s) % exist in public — one can take neither security_invoker nor RLS, and its rows were computed under a BYPASSRLS role, so any Data API grant on it hands every caller every row', v_offend;
  END IF;

  SELECT string_agg(v.view_name, ', ' ORDER BY v.view_name)
    INTO v_offend
    FROM public._list_views() v
   WHERE NOT v.security_invoker;
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'view(s) % run with their owner''s rights and would return rows the caller cannot read', v_offend;
  END IF;
END
$assert$;
