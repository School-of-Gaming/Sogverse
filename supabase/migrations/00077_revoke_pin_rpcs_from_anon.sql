-- Lock the parent-PIN RPCs to authenticated only.
--
-- 00075 created set_my_pin / verify_my_pin / pin_is_set and ran
-- `revoke execute ... from public`, intending them to be callable only by an
-- authenticated parent session (each is auth.uid()-scoped and touches only the
-- caller's own customer_profiles row). That revoke was insufficient: Supabase's
-- default privileges explicitly grant EXECUTE to BOTH anon and authenticated on
-- every new function in the public schema, so revoking only the PUBLIC grant
-- left anon's explicit grant in place. tests/db/access-control.test.ts caught
-- this — the three functions were callable by anon.
--
-- anon calls are functionally harmless today (auth.uid() is NULL for anon, so
-- the WHERE matches no row → verify/pin_is_set return false, set_my_pin raises),
-- but these guard a security boundary and must follow least privilege: anon has
-- no business reaching them, and a future change to the functions must not
-- silently inherit anon access. Revoke from anon (and authenticated, then
-- re-grant) to match the canonical pattern in get_user_role (00002) and
-- set_pin_for_user (00076).
--
-- Forward-only fix: 00075 is already applied to staging, so it cannot be edited
-- in place. This migration corrects the grant on every environment.
revoke execute on function set_my_pin(text) from public, anon, authenticated;
revoke execute on function verify_my_pin(text) from public, anon, authenticated;
revoke execute on function pin_is_set() from public, anon, authenticated;
grant execute on function set_my_pin(text) to authenticated;
grant execute on function verify_my_pin(text) to authenticated;
grant execute on function pin_is_set() to authenticated;
