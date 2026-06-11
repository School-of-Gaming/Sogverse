-- Repair drifted write grants for authenticated on five tables.
--
-- 00095 transcribed the live ACL state from supabase/schema.sql, which is
-- dumped from STAGING. Staging turned out to carry 21 broad write grants for
-- authenticated (GRANT ALL on customer_profiles/gamer_profiles, INSERT/DELETE/
-- TRUNCATE/etc. on profiles/parent_gamer, DELETE on locations) that exist
-- nowhere else: prod matches the migrations' deliberate REVOKEs (00002, 00003,
-- 00017, 00021, ...) and the access-control test's allowlist exactly. The
-- likely drift mechanism is a platform-side restore/upgrade re-applying the
-- legacy auto-expose default privileges on staging; prod's ACLs were never
-- disturbed. The transcript imported that drift into fresh stacks, where the
-- bidirectional grant test in tests/db/access-control.test.ts caught it.
--
-- This migration restores the intended state. On prod every REVOKE is a no-op
-- (the privileges are already absent); on staging it repairs the drift; on
-- fresh stacks it corrects 00095. Left intact: SELECT everywhere, the
-- column-level UPDATE grants on profiles, gamer_profiles UPDATE,
-- parent_gamer DELETE, and all anon/service_role grants (anon's broad grants
-- exist identically on prod and staging — pre-existing posture, RLS-gated,
-- not drift; tightening them is the db-authorization-architecture refactor's
-- territory).

REVOKE INSERT, DELETE, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON public.profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON public.customer_profiles FROM authenticated;
REVOKE INSERT, DELETE, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON public.gamer_profiles FROM authenticated;
REVOKE UPDATE, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON public.parent_gamer FROM authenticated;
REVOKE DELETE ON public.locations FROM authenticated;
