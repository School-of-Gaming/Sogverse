-- Let customers read products they've purchased even when admin has hidden
-- the row. Realises the use case Migration 00030 foreshadowed: "Broader
-- policies that let parents see their participations' products land with
-- the participations migration (§5.8)" — 00039 added participations_v2 but
-- never followed through with the products_v2 SELECT extension, so a
-- `is_visible = false` flip orphaned existing purchasers from their own
-- "My Clubs / Camps / Events" rail and from the product's detail page.
--
-- Use case: an admin wants to retire a product (no new sign-ups) without
-- evicting the customers who already bought it. Hide the product → it
-- vanishes from /clubs, /camps, /events; their purchased rail and detail
-- page keep working.
--
-- Status filter:
--   active     → grants read (current enrollment).
--   waitlisted → grants read (they may yet get promoted to active; UI
--                surfaces position + product chrome).
--   reserving  → does NOT grant read. Pre-payment Stripe Checkout hold;
--                a 30-min window of access to a hidden product on a row
--                anyone can create just by clicking Sign Up is not the
--                threshold we want.
--   completed  → does NOT grant read. Past enrollments are out of scope
--                for the "still has access" semantics; if a need
--                materialises (receipt history etc.) extend the policy.
--
-- This is purely additive — `public_read_published_products_v2` keeps the
-- baseline anon/authenticated visibility on `is_visible = true` rows.
-- Postgres OR-combines USING clauses across SELECT policies, so a
-- purchaser sees both their hidden purchase AND every published product.

CREATE POLICY "purchaser_read_products_v2"
  ON products_v2 FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participations_v2 p
      WHERE p.product_id = products_v2.id
        AND p.customer_id = (SELECT auth.uid())
        AND p.status IN ('active', 'waitlisted')
    )
  );
