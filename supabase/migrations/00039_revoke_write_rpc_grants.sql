-- Migration: Revoke direct browser access to write RPCs
--
-- enroll_gamer_in_group and unenroll_gamer are only called server-side via
-- the admin client (service role) from API routes. There is no reason for
-- browser clients to call them directly. Revoking the authenticated grant
-- ensures the API routes remain the sole entry point, where input validation
-- (price lookup, refund eligibility) is enforced.
--
-- get_customer_enrollments retains its grant — it is called directly from the
-- browser and is protected by the auth.uid() check added in migration 00037.

REVOKE EXECUTE ON FUNCTION enroll_gamer_in_group(UUID, UUID, UUID, DATE) FROM authenticated;
REVOKE EXECUTE ON FUNCTION unenroll_gamer(UUID, UUID, INTEGER) FROM authenticated;
