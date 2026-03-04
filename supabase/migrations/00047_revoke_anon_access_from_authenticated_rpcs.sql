-- Revoke access from functions that should only be callable by authenticated
-- users. In Supabase, anon and authenticated are separate roles — revoking
-- from public alone does NOT revoke from anon. Must revoke from all three.
--
-- Pattern: REVOKE from public, anon, and authenticated (clean slate),
-- then GRANT back to authenticated only.

REVOKE EXECUTE ON FUNCTION get_user_role() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_admin() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_parent_of(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION is_parent_of(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_my_gamers() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_gamers() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_my_parents() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_parents() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_open_voice_rooms() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_open_voice_rooms() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_product_groups_with_details(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_product_groups_with_details(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_customer_enrollments(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_customer_enrollments(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_enrollment_groups(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_enrollment_groups(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION commit_group_changes(uuid, jsonb, jsonb, uuid[], jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION commit_group_changes(uuid, jsonb, jsonb, uuid[], jsonb) TO authenticated;
