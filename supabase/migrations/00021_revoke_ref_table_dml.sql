-- Defense in depth: revoke write grants on admin-only reference tables
-- from authenticated. Admin writes go through the service-role client
-- which bypasses grants.

REVOKE INSERT, UPDATE, DELETE ON languages FROM authenticated;
REVOKE INSERT, UPDATE ON locations FROM authenticated;
