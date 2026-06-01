-- Fix the four functions whose names carry `_v2` MID-name rather than as a
-- suffix, which the 00072 generator's rename step (matched only names ENDING
-- in `_v2`) skipped. For each, 00072 still emitted a CREATE OR REPLACE under
-- the canonical name (correct body), so a canonical-named copy already exists —
-- but the original `_v2`-named function lingered:
--   * get_product_groups_v2_with_details — a plain RPC; its canonical copy is
--     the one callers use, so just drop the stale original.
--   * validate_gedu_assignment_v2_product / validate_participations_v2_group /
--     validate_products_v2_location — trigger functions whose triggers still
--     pointed at the stale (now broken — they reference pre-rename table names)
--     originals. Rebind each trigger to the canonical function and drop the stale.
--
-- Idempotent: DROP ... IF EXISTS no-ops if already cleaned; CREATE OR REPLACE
-- TRIGGER re-applies cleanly.

DROP FUNCTION IF EXISTS public.get_product_groups_v2_with_details(uuid);

-- gedu_group_assignments validator
DROP FUNCTION IF EXISTS public.validate_gedu_assignment_v2_product() CASCADE;
CREATE OR REPLACE TRIGGER trg_validate_gedu_assignment_product
  BEFORE INSERT OR UPDATE OF group_id, product_id ON public.gedu_group_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_gedu_assignment_product();

-- participations validator
DROP FUNCTION IF EXISTS public.validate_participations_v2_group() CASCADE;
CREATE OR REPLACE TRIGGER trg_validate_participations_group
  BEFORE INSERT OR UPDATE OF group_id, product_id ON public.participations
  FOR EACH ROW EXECUTE FUNCTION public.validate_participations_group();

-- products location validator
DROP FUNCTION IF EXISTS public.validate_products_v2_location() CASCADE;
CREATE OR REPLACE TRIGGER trg_validate_products_location
  BEFORE INSERT OR UPDATE OF location_id, is_remote, product_type ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_products_location();
