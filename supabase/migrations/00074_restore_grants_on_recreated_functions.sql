-- Restore EXECUTE grants on the four functions that 00072 created fresh via
-- CREATE OR REPLACE (the mid-name `_v2` functions — see 00073). A newly-created
-- function gets PostgreSQL's default PUBLIC EXECUTE grant; the original
-- `_v2`-named versions carried explicit REVOKEs that the regenerated
-- definitions didn't include, so these orphans ended up public/anon-callable.
--
-- (The suffix-`_v2` functions were ALTER-renamed in place, which preserves
--  grants, so only these four need fixing.)
--
-- get_product_groups_with_details: admin-gated RPC, authenticated-only
--   (internal role check). The three validators are trigger functions that
--   must not be directly callable.

REVOKE EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_gedu_assignment_product() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_participations_group()    FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_products_location()       FROM public, anon, authenticated;
