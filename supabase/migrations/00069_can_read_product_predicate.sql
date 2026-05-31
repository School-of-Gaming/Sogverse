-- Centralize the "may this user read this product?" rule into one function,
-- then have products_v2 and its detail child tables all delegate to it.
--
-- The bug this fixes: products_v2 accreted four SELECT policies over time —
-- public_read_published (00030-era), purchaser_read (00048),
-- gedu_assigned_read (00056), gamer_read_enrolled (00067) — so an enrolled
-- gamer / parent / gedu keeps reading a product after an admin hides it
-- (is_visible = false). But the product-detail child tables only ever got the
-- visibility branch (public_read_*, gated on is_visible = true). The 00030
-- comment even says the predicate "follows parent product's visibility for
-- public/customer/gamer/gedu reads" — the customer/gamer/gedu half was never
-- implemented on the children.
--
-- Net effect: getMyUpcomingSessions embeds schedule_slots_v2 and
-- product_translations_v2 under the product. For a hidden-but-enrolled product
-- the viewer reads the product row, but the embedded slots come back empty
-- (expandUpcomingSessions drops the row → empty Sessions section) and the
-- translations come back empty (blank product name).
--
-- The deeper issue is the smell, not just the gap: the same authorization rule
-- was hand-copied per table and drifted. Fix it once. can_read_product(uuid)
-- holds the whole rule (admin OR visible-published OR enrolled gamer/purchaser
-- OR assigned gedu); every product-scoped read policy delegates to it. Adding a
-- new product-child table is now a one-line policy, and the rule can't drift
-- per-table again.
--
-- product_seat_counts_v2 is deliberately NOT included: its read policy is
-- USING (true) (counts only, no PII) — there is no visibility gate to fix, and
-- routing it through can_read_product would *restrict* it (a regression).

-- =============================================================================
-- The single source of truth
-- =============================================================================
--
-- SECURITY DEFINER so the EXISTS probes bypass RLS on the inner tables
-- (products_v2 / participations_v2 / gedu_group_assignments_v2) — this is what
-- prevents the products_v2 read policy below from recursing when it calls back
-- into can_read_product (which reads products_v2). auth.uid() still resolves to
-- the session user inside a SECURITY DEFINER body (it reads the JWT GUC, not the
-- executing role), exactly as get_user_role()/is_parent_of() rely on.
CREATE OR REPLACE FUNCTION can_read_product(p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- admin sees everything (mirrors admin_full_access_* FOR ALL)
    (SELECT get_user_role()) = 'admin'
    -- public: published and visible
    OR EXISTS (
      SELECT 1 FROM products_v2 pr
      WHERE pr.id = p_product_id
        AND pr.status IN ('pending', 'running')
        AND pr.is_visible = true
    )
    -- enrolled gamer (child's own login) OR purchaser (parent), active/waitlisted
    OR EXISTS (
      SELECT 1 FROM participations_v2 p
      WHERE p.product_id = p_product_id
        AND (p.gamer_id = (SELECT auth.uid()) OR p.customer_id = (SELECT auth.uid()))
        AND p.status IN ('active', 'waitlisted')
    )
    -- assigned gedu
    OR EXISTS (
      SELECT 1 FROM gedu_group_assignments_v2 a
      WHERE a.product_id = p_product_id
        AND a.gedu_id = (SELECT auth.uid())
    );
$$;

-- The product-scoped read policies (TO anon, authenticated) evaluate this in
-- the caller's context, so anon + authenticated need EXECUTE — same pattern as
-- get_user_role()/is_parent_of(). Both are added to the access-control
-- allowlists in tests/db/access-control.test.ts alongside this migration.
REVOKE ALL ON FUNCTION can_read_product(UUID) FROM public;
GRANT EXECUTE ON FUNCTION can_read_product(UUID) TO anon, authenticated;

-- =============================================================================
-- products_v2 — collapse the four hand-written SELECT policies into one
-- =============================================================================
--
-- admin_full_access_products_v2 (FOR ALL) is left untouched: it carries the
-- write authorization and is redundantly covered on the read side by the admin
-- branch above.
DROP POLICY IF EXISTS "public_read_published_products_v2" ON products_v2;
DROP POLICY IF EXISTS "purchaser_read_products_v2" ON products_v2;
DROP POLICY IF EXISTS "gedu_assigned_read_products_v2" ON products_v2;
DROP POLICY IF EXISTS "gamer_read_enrolled_products_v2" ON products_v2;

CREATE POLICY "read_products_v2"
  ON products_v2 FOR SELECT TO anon, authenticated
  USING (can_read_product(id));

-- =============================================================================
-- Detail child tables — replace the visibility-only policy with the predicate
-- =============================================================================

DROP POLICY IF EXISTS "public_read_schedule_slots_v2" ON schedule_slots_v2;
CREATE POLICY "read_schedule_slots_v2_via_product"
  ON schedule_slots_v2 FOR SELECT TO anon, authenticated
  USING (can_read_product(product_id));

DROP POLICY IF EXISTS "public_read_product_translations_v2" ON product_translations_v2;
CREATE POLICY "read_product_translations_v2_via_product"
  ON product_translations_v2 FOR SELECT TO anon, authenticated
  USING (can_read_product(product_id));

DROP POLICY IF EXISTS "public_read_product_prices_v2" ON product_prices_v2;
CREATE POLICY "read_product_prices_v2_via_product"
  ON product_prices_v2 FOR SELECT TO anon, authenticated
  USING (can_read_product(product_id));

DROP POLICY IF EXISTS "public_read_product_tags_v2" ON product_tags_v2;
CREATE POLICY "read_product_tags_v2_via_product"
  ON product_tags_v2 FOR SELECT TO anon, authenticated
  USING (can_read_product(product_id));

DROP POLICY IF EXISTS "public_read_product_holiday_calendars_v2" ON product_holiday_calendars_v2;
CREATE POLICY "read_product_holiday_calendars_v2_via_product"
  ON product_holiday_calendars_v2 FOR SELECT TO anon, authenticated
  USING (can_read_product(product_id));
