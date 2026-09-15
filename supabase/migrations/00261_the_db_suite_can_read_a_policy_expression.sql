-- The DB suite can read a policy expression.
--
-- WHY
--
-- 00260 made "every gate on gedu_group_assignments carries a cover branch or is
-- annotated" a mechanical check, and that check has two halves: function bodies
-- and POLICY expressions. The function half already had an instrument — the
-- `_list_function_authorization_surface()` catalog helper returns every
-- non-trigger function in `public` with its `prosrc`. The policy half had none.
-- `pg_policies` is a catalog view the DB tests cannot reach: they speak to
-- PostgREST, which answers RPC calls and table reads, and there is no generic
-- SQL path from a test to `pg_catalog`.
--
-- So the check's policy half lived only inside 00260's own end-of-migration
-- assertion block, which runs exactly once, on the database that migration is
-- applied to. That is the wrong home for it: the point of a completeness check is
-- that it fails on CI's from-scratch build the day somebody adds a seventh gate,
-- and a DO block in an applied migration cannot do that. This helper is what
-- moves the policy half into the permanent test beside the function half.
--
-- WHY A SEPARATE MIGRATION
--
-- 00260 is already applied to staging, and an applied migration is never edited
-- (supabase/CLAUDE.md, "Never amend a pushed migration"): the CLI matches on
-- version, so an edit there would never execute on staging and only CI's
-- fresh-from-migrations database would ever see it.
--
-- WHY IT IS GENERAL RATHER THAN SHAPED TO ONE CHECK
--
-- It returns every policy's expression text in `public` rather than answering
-- 00260's question, for the reason every other `_list_*` helper is shaped that
-- way: the access-control sweeps and the authorization spine already ask several
-- different questions of one catalog each, and a helper that encodes one
-- caller's predicate has to be replaced the first time a second caller wants a
-- neighbouring fact. `service_role` only, like every other `_list_*` helper —
-- policy text is a description of the security model and no client role has any
-- business reading it.

CREATE FUNCTION public._list_policy_expressions()
RETURNS TABLE(
  table_name  text,
  policy_name text,
  -- USING and WITH CHECK concatenated, because every caller so far asks whether
  -- a policy REFERENCES something rather than in which half it does. A caller
  -- that ever needs them apart adds two columns; splitting them now would make
  -- every present caller concatenate them back.
  expression  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p.tablename::text,
         p.policyname::text,
         COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, '')
    FROM pg_catalog.pg_policies p
   WHERE p.schemaname = 'public';
$$;

COMMENT ON FUNCTION public._list_policy_expressions() IS 'Every RLS policy in the public schema with its expression text — USING and WITH CHECK concatenated, since every caller asks whether a policy REFERENCES something rather than in which half. The policy-side twin of _list_function_authorization_surface(), and it exists because pg_policies is a catalog view the DB tests have no path to: they speak to PostgREST, which answers RPC calls, so a catalog question needs a function to ask it through. Read only by the DB test suite — the assignment-gate completeness check in tests/db/session-cover.test.ts is the first caller — which is why it is service_role only: policy text describes the security model and no client role has business reading it.';

REVOKE EXECUTE ON FUNCTION public._list_policy_expressions() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._list_policy_expressions() TO service_role;

DO $$
DECLARE
  v_count integer;
BEGIN
  -- It has to see the policy 00260 rewrote, or the completeness check it exists
  -- to serve would pass while looking at nothing.
  SELECT count(*) INTO v_count
    FROM public._list_policy_expressions() p
   WHERE p.table_name = 'product_groups'
     AND p.policy_name = 'gedus_read_assigned_groups'
     AND p.expression LIKE '%gedu_covers_group%'
     AND p.expression LIKE '%gedu_group_assignments%';

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      '_list_policy_expressions cannot see the widened gedus_read_assigned_groups policy (found % rows)',
      v_count;
  END IF;

  IF has_function_privilege('authenticated', 'public._list_policy_expressions()', 'EXECUTE')
     OR has_function_privilege('anon', 'public._list_policy_expressions()', 'EXECUTE') THEN
    RAISE EXCEPTION '_list_policy_expressions is reachable from the Data API';
  END IF;
END $$;
