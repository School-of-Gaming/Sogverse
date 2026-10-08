-- A gamer cannot rewrite their own birth date or gender.
--
-- After a child's account is created, date_of_birth and gender are written by
-- admins only (ruling 2026-08-31). The parent supplies them once, in the Add
-- Gamer dialog, through the server-side creation write; the admin edit card is
-- the one surface that changes them afterwards. Age is what places a child in a
-- product's band and what a gedu sees on the roster, so it is not the child's
-- to change.
--
-- The gamer's own UPDATE policy is dropped rather than narrowed. The only
-- columns `authenticated` may UPDATE on this table are date_of_birth and
-- gender, so the policy admitted nothing else a gamer could legitimately
-- write. The column grants stay: they are what the admin edit card writes
-- through, under the `FOR ALL` admin policy, and a grant cannot tell an admin's
-- session from a gamer's — the policy is where that distinction lives.

DROP POLICY gamers_update_own_gamer_profile ON public.gamer_profiles;

DO $$
DECLARE
  v_writers text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
    INTO v_writers
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'gamer_profiles'
     AND cmd IN ('UPDATE', 'ALL');

  IF v_writers IS DISTINCT FROM 'admin_full_access_gamer_profiles' THEN
    RAISE EXCEPTION 'gamer_profiles must be writable through the admin policy alone, found: %', v_writers;
  END IF;
END;
$$;
