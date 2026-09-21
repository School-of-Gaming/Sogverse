-- create_participation rebinds to the rebuilt status type.
--
-- WHAT THIS IS FOR
--
-- 00279 rebuilt public.effective_product_status: renamed the old type aside,
-- created the three-value replacement, and dropped the old one. That changes
-- the type's OID. create_participation names the type in a DECLARE
-- (`v_eff_status`) and 00279 deliberately did not rewrite its body, on the
-- reasoning that a plpgsql local's type is resolved by name at compile time
-- and never recorded in pg_depend.
--
-- Both halves of that are true, and together they are still not enough.
-- PL/pgSQL decides whether its cached compiled form of a function is still
-- valid by comparing fn_xmin/fn_tid against the current pg_proc tuple, and by
-- nothing else. A scalar local's type is not revalidated the way a composite
-- rowtype is (a `public.products` variable re-derives itself; an enum variable
-- does not). 00279 never touches create_participation's pg_proc row, so a
-- backend that had already compiled the function goes on holding the OID of a
-- type that no longer exists. Its next enrolment fails at the assignment:
--
--   ERROR: cache lookup failed for type NNNNN
--   CONTEXT: PL/pgSQL assignment "v_eff_status := public.effective_status(...)"
--
-- The error is per-backend and lasts until that backend is recycled, so it
-- reads as an intermittent 500 rather than as a migration that went wrong.
-- What it costs is the enrolment write itself: a free signup answers 500, and
-- the checkout.session.completed webhook fails to record the seat of a family
-- Stripe has already charged. Reproduced in a scratch schema before this
-- migration was written, and the remedy below verified in the same session.
--
-- WHY AN ALTER THAT CHANGES NOTHING
--
-- The fix has to make every backend recompile, and the only lever plpgsql
-- watches is the pg_proc tuple. Re-issuing the setting the function already
-- carries rewrites that tuple -- same body, same security, same search_path,
-- new xmin/tid -- so every session re-resolves v_eff_status against the type
-- that exists now. It is idempotent, and it re-emits none of the 200-line
-- enrolment body, which is the merge hazard 00279 was right to avoid.
--
-- This ships as its own migration because 00279 is already applied to staging
-- and a pushed migration is never edited.

ALTER FUNCTION public.create_participation(uuid, uuid, uuid, text, text, text[])
  SET search_path TO '';


-- ---------------------------------------------------------------------------
-- End state
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
  v_src    TEXT;
  v_labels TEXT[];
BEGIN
  -- --- (a) The type this migration exists to rebind to. Re-derived here ---
  -- --- rather than taken from 00279's word, per the fix-up rule. ----------
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO v_labels
    FROM pg_enum e
   WHERE e.enumtypid = 'public.effective_product_status'::regtype;
  IF v_labels IS DISTINCT FROM ARRAY['pending', 'running', 'completed'] THEN
    RAISE EXCEPTION 'effective_product_status is % — this migration rebinds create_participation to the three-value type 00279 built', v_labels;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t
     WHERE t.typnamespace = 'public'::regnamespace
       AND t.typname = 'effective_product_status_old'
  ) THEN
    RAISE EXCEPTION 'effective_product_status_old is still standing — 00279 did not finish, and rebinding now would bind to the wrong type';
  END IF;

  -- --- (b) The body is untouched: still declaring the type, still gating --
  -- --- on the two labels it gates on. An ALTER that changed either would -
  -- --- mean this file did more than rewrite a catalog tuple. -------------
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
   WHERE p.oid = 'public.create_participation(uuid, uuid, uuid, text, text, text[])'::regprocedure;
  IF v_src !~ 'public\.effective_product_status' THEN
    RAISE EXCEPTION 'create_participation no longer declares a public.effective_product_status local — there is nothing left for this migration to rebind';
  END IF;
  IF v_src !~ 'NOT IN\s*\(\s*''pending''\s*,\s*''running''\s*\)' THEN
    RAISE EXCEPTION 'create_participation no longer gates on (pending, running) — the enrolment gate changed shape under this fix-up';
  END IF;

  -- --- (c) Security and search_path survived the ALTER. The statement ----
  -- --- above re-issues the setting the function already had; if it ------
  -- --- arrived at a different one, every unqualified name in a ---------
  -- --- SECURITY DEFINER body would resolve somewhere new. --------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.create_participation(uuid, uuid, uuid, text, text, text[])'::regprocedure
       AND p.prosecdef
       AND p.proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'create_participation is no longer SECURITY DEFINER with an empty search_path';
  END IF;

  -- --- (d) Grants are untouched. ALTER FUNCTION ... SET does not write ---
  -- --- the ACL, and this is what proves it did not. ---------------------
  IF has_function_privilege('anon', 'public.create_participation(uuid, uuid, uuid, text, text, text[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_participation(uuid, uuid, uuid, text, text, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'create_participation became executable by a browser role — it writes seats and is service_role only';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.create_participation(uuid, uuid, uuid, text, text, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'create_participation is not executable by service_role — every enrolment would fail closed';
  END IF;
END;
$assert$;
