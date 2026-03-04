-- Fix: migration 00047 only revoked from public, but in Supabase anon is a
-- separate role that doesn't inherit revocations from public. Explicitly
-- revoke from anon for all authenticated-only functions.

REVOKE EXECUTE ON FUNCTION get_user_role() FROM anon;
REVOKE EXECUTE ON FUNCTION is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION is_parent_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_my_gamers() FROM anon;
REVOKE EXECUTE ON FUNCTION get_my_parents() FROM anon;
REVOKE EXECUTE ON FUNCTION get_open_voice_rooms() FROM anon;
REVOKE EXECUTE ON FUNCTION get_product_groups_with_details(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_customer_enrollments(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_enrollment_groups(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION commit_group_changes(uuid, jsonb, jsonb, uuid[], jsonb) FROM anon;
