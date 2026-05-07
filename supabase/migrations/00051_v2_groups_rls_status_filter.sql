-- Migration: Filter v2 group RLS policies by participation status
-- Description: The four non-admin policies on product_groups_v2 and
--              gedu_group_assignments_v2 gate visibility through
--              participations_v2 but did not filter on status. A customer or
--              gamer who cancels keeps reading the product's group + Gedu
--              shape forever. The intent is "active members see active
--              product structure"; cancelled membership shouldn't grant
--              ongoing visibility. Add `status = 'active'` to all four.

DROP POLICY IF EXISTS "gamers_read_own_group_v2" ON product_groups_v2;
CREATE POLICY "gamers_read_own_group_v2"
  ON product_groups_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gamer'
    AND id IN (
      SELECT group_id FROM participations_v2
      WHERE gamer_id = auth.uid()
        AND group_id IS NOT NULL
        AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "customers_read_groups_via_gamers_v2" ON product_groups_v2;
CREATE POLICY "customers_read_groups_via_gamers_v2"
  ON product_groups_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND id IN (
      SELECT group_id FROM participations_v2
      WHERE customer_id = auth.uid()
        AND group_id IS NOT NULL
        AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "customers_read_assignments_via_gamers_v2" ON gedu_group_assignments_v2;
CREATE POLICY "customers_read_assignments_via_gamers_v2"
  ON gedu_group_assignments_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND product_id IN (
      SELECT product_id FROM participations_v2
      WHERE customer_id = auth.uid()
        AND status = 'active'
    )
  );
