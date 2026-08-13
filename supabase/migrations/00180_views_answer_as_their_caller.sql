-- 00180: views answer as their caller, and something checks that they do.
--
-- 00179 created `user_search_index`, the first VIEW the public schema has ever
-- held, and in doing so walked past both of the standing safety nets — not
-- because either is broken, but because both are written against object classes
-- a view is not:
--
--   * The RLS sweep reads pg_catalog.pg_tables, which does not list views. A view
--     created without `security_invoker` runs with its OWNER's rights — postgres,
--     which holds BYPASSRLS — and so hands every caller every row of everything
--     it selects from. That is a silent data leak with a working feature on top
--     of it: the application sees a search that answers, and nothing in CI says
--     a word.
--   * The authorization spine's completeness check (docs/db-authorization-
--     architecture.md §3.4, check 5) enumerates pg_proc. A view is not a
--     function, so it falls into neither classification and is named to no scope
--     test — which is the half that matters more, because the flag being set is
--     an intention and the scope test is the property.
--
-- WHAT THIS ADDS
--
--   One catalog helper, `_list_views()`, that serves both halves at once. The
--   flag alone would answer the first; the flag without the grants beside it
--   cannot answer the second, because "which views must be classified" is
--   exactly "which views `authenticated` (or `anon`) can select from". One row
--   per public view, carrying the switch and the two grants that decide who the
--   switch protects, is everything both consumers need out of one round trip —
--   the same shape and the same reasoning as
--   `_list_function_authorization_surface()` in 00121.
--
--   The consumers are test code, as the spine's always are:
--
--     tests/db/access-control.test.ts   — no public view lacks security_invoker,
--                                         the analogue of "every table has RLS".
--     tests/db/authorization-spine.test.ts — every view `authenticated` can read
--                                         is classified with a named scope test,
--                                         and every classified view still exists
--                                         and is still exposed.
--
-- ON THE STRICTNESS OF THE FLAG TEST
--
--   `reloptions` stores the option text as it was written, so a view declared
--   `WITH (security_invoker = on)` records `security_invoker=on` and this helper
--   reports it as false. That is deliberate: the error is in the loud direction
--   (a CI failure naming the view, fixed by writing `= true`), never the quiet
--   one, and one spelling of the switch keeps the catalog greppable.

-- ---------------------------------------------------------------------------
-- 1. The helper.
--
-- NULL reloptions — a view declared with no options at all, which is precisely
-- the dangerous case — must read as false rather than NULL: `NULL @> …` is NULL,
-- and a NULL here would arrive at the test as a third value its filters do not
-- expect. COALESCE makes the column a total boolean, the same reasoning §3.2
-- applies to the predicates policies compose from.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public._list_views()
RETURNS TABLE(
  view_name text,
  security_invoker boolean,
  authenticated_select boolean,
  anon_select boolean
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = ''
    AS $$
  SELECT
    c.relname::text,
    COALESCE(c.reloptions @> ARRAY['security_invoker=true'], false),
    pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT'),
    pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
  ORDER BY 1;
$$;

COMMENT ON FUNCTION public._list_views() IS
  'Every view in the public schema with the two things that decide whether it is '
  'safe: whether it runs as its caller (security_invoker) and which of the two '
  'Data API roles may read it. Read only by the DB test suite — the RLS-style '
  'sweep in access-control.test.ts and the completeness checks in '
  'authorization-spine.test.ts — which is why it is service_role only.';

-- ---------------------------------------------------------------------------
-- 2. Grants.
--
-- service_role and nothing else. There are no default privileges on a new
-- function since 00099, so the grant is what makes it callable at all — and a
-- created function comes back PUBLIC-executable, so the REVOKE is load-bearing
-- rather than boilerplate. Neither `authenticated` nor `anon` gets it: this
-- reads the privilege catalog, which is reconnaissance, and no application path
-- has any use for it.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public._list_views() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._list_views() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. End-state assertions.
--
-- Three things this could get wrong silently, and the third is the one worth
-- writing down:
--
--   (a) The grant missing, which surfaces in CI as `permission denied` on a
--       helper the tests call through the service-role client.
--   (b) The grant too wide — PUBLIC, authenticated or anon — which is how a
--       catalog reader becomes an anonymous one.
--   (c) The helper returning NO ROWS. That is the only failure here that makes
--       its consumers pass VACUOUSLY: a wrong relkind or a wrong namespace
--       yields an empty set, every filter over it is empty, and both checks go
--       green while verifying nothing. A helper that reported the flag wrongly
--       would fail loudly instead. So assert it sees the view that exists at
--       this point in history, and that the view answers as its caller.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_views   bigint;
  v_offend  text;
BEGIN
  -- --- (a) + (b) Exactly one role may call it. -----------------------------
  --
  -- has_function_privilege reports the EFFECTIVE privilege, so a surviving
  -- PUBLIC grant would show up as `anon` holding EXECUTE. Checking the two Data
  -- API roles therefore checks the REVOKE as well, without naming PUBLIC — which
  -- is not a role and cannot be passed to these functions at all.
  IF NOT has_function_privilege('service_role', 'public._list_views()', 'EXECUTE') THEN
    RAISE EXCEPTION '_list_views is not executable by service_role — the DB tests call it through that client';
  END IF;

  SELECT string_agg(r, ', ' ORDER BY r)
    INTO v_offend
    FROM unnest(ARRAY['authenticated', 'anon']) AS r
   WHERE has_function_privilege(r, 'public._list_views()', 'EXECUTE');
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION '_list_views is executable by %, which reads the privilege catalog to no application purpose (or PUBLIC still holds EXECUTE)', v_offend;
  END IF;

  -- --- (c) It actually sees the views. -------------------------------------
  SELECT count(*) INTO v_views FROM public._list_views();
  IF v_views < 1 THEN
    RAISE EXCEPTION '_list_views returned no rows — user_search_index exists by 00179, so the catalog filter is wrong and every check built on this would pass while verifying nothing';
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
