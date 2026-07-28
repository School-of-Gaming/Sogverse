-- Converges the customer_profiles / gamer_profiles policy catalogs onto their
-- migration-history names, and removes the duplicate admin policies that 00125
-- created (docs/db-authorization-architecture.md §5 post-deploy cleanup).
--
-- THE SITUATION THIS REPAIRS
--
-- 00002 and 00003 created six policies on these two tables, all snake_case:
--
--   admin_full_access_customer_profiles   customers_read_own_customer_profile
--   admin_full_access_gamer_profiles      gamers_read_own_gamer_profile
--                                         gamers_update_own_gamer_profile
--                                         parents_read_linked_gamer_profiles
--
-- At some point *staging* had all six renamed by hand to quoted human-readable
-- names ("Customers can read own customer_profile", …). That edit never became a
-- migration, and production never received it — production still matches history.
--
-- 00125's conditional admin repair keyed its IF EXISTS on the *quoted* admin name.
-- So the two databases took different branches:
--
--   staging     quoted name present -> ALTER  -> six policies, all quoted
--   production  quoted name absent  -> CREATE -> eight policies: the six from
--                                               history, plus a second admin
--                                               policy per table
--
-- A database built fresh from migration history lands in production's shape, so
-- that is also what CI has been running against.
--
-- The duplicate is not an access change — both admin policies are PERMISSIVE over
-- the same predicate, and permissive policies OR together. What it costs is the
-- Phase 4 property that every admin policy in the database has one shape, plus a
-- per-row is_admin() call on the un-wrapped copy.
--
-- WHY THIS CONVERGES INSTEAD OF ASSERTING ONE STARTING STATE
--
-- The two databases genuinely differ, so a migration that assumes either one is
-- wrong somewhere. The loop below is keyed on the *pair* (legacy name, canonical
-- name) and handles all three reachable states:
--
--   both present     -> the legacy one is the duplicate; drop it
--   only legacy      -> it is the original under a hand-edited name; rename it
--   only canonical   -> already converged; do nothing
--
-- After it runs, the canonical name exists on every database regardless of which
-- branch each row took, which is what lets the ALTERs at the bottom be
-- unconditional. Re-running is a no-op — the third state absorbs it.
--
-- This is the lesson 00125 paid for: key a repair on the thing being repaired, or
-- assert the end state outright. Keying it on a name encodes an assumption about
-- which database you happen to be looking at.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('customer_profiles', 'Admins can do everything on customer_profiles', 'admin_full_access_customer_profiles'),
      ('customer_profiles', 'Customers can read own customer_profile',       'customers_read_own_customer_profile'),
      ('gamer_profiles',    'Admins can do everything on gamer_profiles',    'admin_full_access_gamer_profiles'),
      ('gamer_profiles',    'Gamers can read own gamer_profile',             'gamers_read_own_gamer_profile'),
      ('gamer_profiles',    'Gamers can update own gamer_profile',           'gamers_update_own_gamer_profile'),
      ('gamer_profiles',    'Parents can read linked gamer profiles',        'parents_read_linked_gamer_profiles')
    ) AS t(tbl, legacy_name, canonical_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = r.tbl AND policyname = r.legacy_name
    ) THEN
      IF EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = r.tbl AND policyname = r.canonical_name
      ) THEN
        EXECUTE format('DROP POLICY %I ON public.%I', r.legacy_name, r.tbl);
      ELSE
        EXECUTE format(
          'ALTER POLICY %I ON public.%I RENAME TO %I',
          r.legacy_name, r.tbl, r.canonical_name
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Both admin policies now exist under the canonical name on every database, so
-- these need no guard. They restate the Phase 4 shape: the predicate is called
-- once per statement via InitPlan, not once per row. On staging this is a no-op
-- (00125 already applied it under the other name); on production and on a fresh
-- database it is the actual repair, because the surviving policy is the original
-- from 00002/00003 with a bare call.
ALTER POLICY admin_full_access_customer_profiles ON public.customer_profiles
  USING ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_gamer_profiles ON public.gamer_profiles
  USING ((SELECT public.is_admin()));

-- Fails the migration if either table did not converge to exactly its four/two
-- policies. Cheaper to catch here than in a dump diff three months from now.
DO $$
DECLARE
  n_customer int;
  n_gamer    int;
BEGIN
  SELECT count(*) INTO n_customer
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_profiles';
  SELECT count(*) INTO n_gamer
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gamer_profiles';

  IF n_customer <> 2 THEN
    RAISE EXCEPTION 'customer_profiles has % policies after convergence, expected 2', n_customer;
  END IF;
  IF n_gamer <> 4 THEN
    RAISE EXCEPTION 'gamer_profiles has % policies after convergence, expected 4', n_gamer;
  END IF;
END;
$$;
