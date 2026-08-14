-- The gedu admin-approval concept becomes "certified".
--
-- WHY, AND WHY IT IS WORTH A RENAME
--
-- `gedu_profiles.verified` has never meant "we can reach this person's inbox" —
-- it means an admin looked at an educator and vouched for them, which gates
-- group assignment and instant-voice-room moderation. The platform is now
-- growing a genuine email-verification marker (`profiles.email_verified_at`,
-- 00186), and one schema cannot carry two unrelated things both called
-- "verified" without somebody eventually reading the wrong one and shipping it.
-- "Certified" is what the approval always was; this migration makes the word
-- match, and frees "verified" to mean only the address check.
--
-- WHAT RENAMING PRESERVES, AND WHAT IT DOES NOT
--
-- `ALTER TABLE ... RENAME COLUMN` renames in place: the column keeps its
-- attribute number, so every privilege, default, constraint and index that
-- referenced it follows automatically — there is no drop, so there is nothing to
-- re-grant. The FK to `profiles` is renamed too, and that one is not cosmetic:
-- PostgREST disambiguates the two FKs from this table to `profiles` by
-- *constraint name*, so the embed the admin service asks for
-- (`verifier:profiles!gedu_profiles_verified_by_fkey`) is a wire-level
-- dependency on that string and moves with it.
--
-- A function is different: its name is part of its identity, so the RPC is
-- dropped and recreated rather than renamed — which means its ACL does NOT
-- follow, and the recreated function comes back PUBLIC-executable. Both halves
-- are re-issued below, and the DO block reads the result back out of the
-- catalog.
--
-- No data moves and no behaviour changes. Everything here is naming.

ALTER TABLE public.gedu_profiles RENAME COLUMN verified    TO certified;
ALTER TABLE public.gedu_profiles RENAME COLUMN verified_at TO certified_at;
ALTER TABLE public.gedu_profiles RENAME COLUMN verified_by TO certified_by;

ALTER TABLE public.gedu_profiles
  RENAME CONSTRAINT gedu_profiles_verified_by_fkey TO gedu_profiles_certified_by_fkey;

COMMENT ON COLUMN public.gedu_profiles.certified IS
  'Whether an admin has vouched for this educator. Gates two things and nothing '
  'else: group assignment (UI-only, because assignment is admin-driven) and '
  'instant-voice-room moderation (server-side, because it is gedu-initiated). An '
  'uncertified gedu still has broad platform access by design. Distinct from '
  'profiles.email_verified_at, which is about an address rather than a person; '
  'this column was called "verified" until 00187.';

COMMENT ON COLUMN public.gedu_profiles.certified_by IS
  'The admin whose call this was, or NULL — either because the gedu is not '
  'certified, or because they predate the feature and were backfilled as trusted. '
  'ON DELETE SET NULL: losing the certifying admin''s account must never silently '
  'de-certify a working educator.';

-- The function is dropped and recreated because a name is part of a function's
-- identity. The body is copied from the live definition unchanged apart from the
-- column and argument names.
DROP FUNCTION public.set_gedu_verified(uuid, boolean);

CREATE FUNCTION public.set_gedu_certified(p_gedu_id uuid, p_certified boolean)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_certified: % is not a gedu', p_gedu_id;
  END IF;

  UPDATE public.gedu_profiles
  SET certified    = p_certified,
      certified_at = CASE WHEN p_certified THEN now() ELSE NULL END,
      certified_by = CASE WHEN p_certified THEN (SELECT auth.uid()) ELSE NULL END
  WHERE user_id = p_gedu_id;
END;
$$;

COMMENT ON FUNCTION public.set_gedu_certified(p_gedu_id uuid, p_certified boolean) IS
  'Certify or de-certify a game educator. Admin-only (guard-first on '
  'assert_admin), and it stamps certified_at / certified_by server-side so the '
  'audit trail cannot be forged — which is why gedu_profiles carries no write '
  'grant at all and this RPC is the only way in. Called from the admin '
  'user-detail page through the admin''s own session. Renamed from '
  'set_gedu_verified in 00187.';

-- A created (or drop/recreated) function comes back PUBLIC-executable, so the
-- REVOKE is load-bearing rather than boilerplate. Grants match what the dropped
-- function held: `authenticated` only — the admin calls it with their own
-- session, and the guard is what makes that safe.
REVOKE EXECUTE ON FUNCTION public.set_gedu_certified(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_gedu_certified(uuid, boolean) TO authenticated;

-- Assert the end state rather than trusting that the statements above took the
-- branch they look like they took. Apply-time protection: it says what was true
-- when 00187 ran, and nothing about later migrations.
DO $$
DECLARE
  v_renamed integer;
BEGIN
  -- Positive: the new names exist, all three of them.
  SELECT count(*) INTO v_renamed
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'gedu_profiles'
     AND column_name IN ('certified', 'certified_at', 'certified_by');

  IF v_renamed <> 3 THEN
    RAISE EXCEPTION 'gedu_profiles carries % of the 3 certified* columns', v_renamed;
  END IF;

  -- Negative: the old ones do not. A rename that silently no-opped would leave
  -- both sets present, and every read would keep working against the stale one.
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'gedu_profiles'
       AND column_name IN ('verified', 'verified_at', 'verified_by')
  ) THEN
    RAISE EXCEPTION 'gedu_profiles still carries a verified* column — the rename did not take';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'gedu_profiles'
       AND c.conname = 'gedu_profiles_certified_by_fkey'
  ) THEN
    RAISE EXCEPTION 'gedu_profiles_certified_by_fkey is missing — the PostgREST embed disambiguator names this constraint';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'set_gedu_certified'
  ) THEN
    RAISE EXCEPTION 'set_gedu_certified is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'set_gedu_verified'
  ) THEN
    RAISE EXCEPTION 'set_gedu_verified still exists — the drop did not take';
  END IF;

  -- The recreated function's ACL, which does NOT survive a drop.
  IF NOT has_function_privilege('authenticated', 'public.set_gedu_certified(uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE set_gedu_certified — the admin UI calls it through the admin''s own session';
  END IF;

  IF has_function_privilege('anon', 'public.set_gedu_certified(uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE set_gedu_certified — the REVOKE FROM PUBLIC did not take';
  END IF;

  -- The renamed columns keep the table's ACL, which has no write grant at all:
  -- every write goes through the RPC so the audit stamps cannot be forged.
  IF has_column_privilege('authenticated', 'public.gedu_profiles', 'certified', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can UPDATE gedu_profiles.certified — certification must only ever be set by the RPC';
  END IF;

  IF has_column_privilege('authenticated', 'public.gedu_profiles', 'certified_by', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can UPDATE gedu_profiles.certified_by — the audit stamp would be forgeable';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.gedu_profiles', 'certified', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot SELECT gedu_profiles.certified — the rename lost the table read grant';
  END IF;
END;
$$;
