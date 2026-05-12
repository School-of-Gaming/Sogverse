-- Let gedus read products they're assigned to even when the product is
-- hidden (is_visible = false) or in a non-public lifecycle state (draft,
-- cancelled). Parallel to migration 00048's purchaser_read_products_v2:
-- assignment is the gedu's claim on a product, the same way a participation
-- is the customer's claim. Without this, a hidden product that a gedu is
-- assigned to disappears from their "My Clubs / Camps / Events" rail and
-- detail page — same orphaning trap 00048 fixed for purchasers.
--
-- A gedu is assigned to a product iff there's a row in
-- gedu_group_assignments_v2 with their auth.uid() and the product's id.
-- That row implies the admin put them on a group inside that product, so
-- granting product read is appropriate at any product lifecycle state.
--
-- Purely additive — public_read_published_products_v2 keeps the baseline
-- anon/authenticated visibility on `is_visible = true` rows. Postgres
-- OR-combines USING clauses across SELECT policies.

CREATE POLICY "gedu_assigned_read_products_v2"
  ON products_v2 FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM gedu_group_assignments_v2 a
      WHERE a.product_id = products_v2.id
        AND a.gedu_id = (SELECT auth.uid())
    )
  );
