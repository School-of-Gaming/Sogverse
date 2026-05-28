-- Migration: rename get_gedu_session_detail → get_gedu_assigned_product
-- Description: The function was introduced in 00064 to back the gedu session
--              details page. The "session" framing was a leftover from the
--              entry-point name on the dashboard card; the function itself
--              answers a product-scoped question and raises 42501 unless the
--              caller has a gedu_group_assignments_v2 row on the product. The
--              accurate name for that is `get_gedu_assigned_product` — same
--              shape, same body, same grants. ALTER FUNCTION ... RENAME TO
--              preserves grants, so no REVOKE/GRANT replay is needed.

ALTER FUNCTION get_gedu_session_detail(UUID) RENAME TO get_gedu_assigned_product;
