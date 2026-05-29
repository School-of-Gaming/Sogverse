-- Let a gamer (the child's own login) read products they're actively
-- enrolled in, even when the product is hidden (is_visible = false).
--
-- The gap this closes: migration 00048 added `purchaser_read_products_v2`
-- (keyed on participations_v2.customer_id = auth.uid()) and 00056 added
-- `gedu_assigned_read_products_v2`. Both let the *parent* and the *gedu*
-- keep seeing a product after an admin hides it. But neither matches a
-- gamer signed in as themselves — auth.uid() is the gamer_id, not the
-- customer_id, and the gamer has no assignment row. So when an admin hides
-- a running product, the parent and gedu keep access while the kid who
-- actually attends loses it: `getMyUpcomingSessions("gamer")` joins
-- products_v2!inner, the RLS-hidden product drops out of the join, and the
-- session silently vanishes from the gamer dashboard (including the
-- voice-join doorway, mid-run).
--
-- Mirror 00048 for the gamer: a gamer may read a product they have an
-- `active` or `waitlisted` participation on. `reserving` is excluded for
-- the same reason 00048 excludes it for customers — a pre-payment hold
-- shouldn't grant a peek at a hidden product (a gamer can't create one of
-- their own anyway, but keeping the status filter identical avoids a
-- surprise if that ever changes). `completed` stays out too, matching the
-- "still has access" semantics 00048 settled on.
--
-- Purely additive — `public_read_published_products_v2` keeps the baseline
-- visible-product access. Postgres OR-combines USING clauses across SELECT
-- policies.

CREATE POLICY "gamer_read_enrolled_products_v2"
  ON products_v2 FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participations_v2 p
      WHERE p.product_id = products_v2.id
        AND p.gamer_id = (SELECT auth.uid())
        AND p.status IN ('active', 'waitlisted')
    )
  );
