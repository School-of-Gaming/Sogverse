-- Revoke the default PUBLIC grant from functions that should only be
-- callable by authenticated users. PostgreSQL auto-grants EXECUTE to
-- PUBLIC on new functions, which means anon inherits access too.
--
-- Pattern: REVOKE from public (removes inherited access for everyone),
-- then GRANT back to authenticated only.

REVOKE EXECUTE ON FUNCTION get_user_role() FROM public;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_admin() FROM public;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_parent_of(uuid) FROM public;
GRANT EXECUTE ON FUNCTION is_parent_of(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_my_gamers() FROM public;
GRANT EXECUTE ON FUNCTION get_my_gamers() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_my_parents() FROM public;
GRANT EXECUTE ON FUNCTION get_my_parents() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_open_voice_rooms() FROM public;
GRANT EXECUTE ON FUNCTION get_open_voice_rooms() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_product_groups_with_details(uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_product_groups_with_details(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_customer_enrollments(uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_customer_enrollments(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_enrollment_groups(uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_enrollment_groups(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION commit_group_changes(uuid, jsonb, jsonb, uuid[], jsonb) FROM public;
GRANT EXECUTE ON FUNCTION commit_group_changes(uuid, jsonb, jsonb, uuid[], jsonb) TO authenticated;
