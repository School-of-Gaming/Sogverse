-- Migration: Product groups and enrollments
-- Description: Create product_groups and group_enrollments tables for gedu-gamer group management

-- =============================================================================
-- 1. Change products default visibility to hidden
-- =============================================================================
ALTER TABLE products ALTER COLUMN is_visible SET DEFAULT false;

-- =============================================================================
-- 2. Create product_groups table
-- =============================================================================
CREATE TABLE product_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  gedu_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, gedu_id)
);

CREATE INDEX idx_product_groups_product ON product_groups(product_id);
CREATE INDEX idx_product_groups_gedu ON product_groups(gedu_id);

ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. Create group_enrollments table
-- =============================================================================
CREATE TABLE group_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES product_groups(id) ON DELETE RESTRICT,
  gamer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, gamer_id)
);

CREATE INDEX idx_group_enrollments_group ON group_enrollments(group_id);
CREATE INDEX idx_group_enrollments_gamer ON group_enrollments(gamer_id);

ALTER TABLE group_enrollments ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. RLS Policies — product_groups
-- =============================================================================

-- Admin: full access
CREATE POLICY "admin_full_access_product_groups"
  ON product_groups FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Gedus: read own groups
CREATE POLICY "gedus_view_own_groups"
  ON product_groups FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gedu'
    AND gedu_id = auth.uid()
  );

-- Authenticated: read groups for visible products
CREATE POLICY "authenticated_view_visible_product_groups"
  ON product_groups FOR SELECT TO authenticated
  USING (
    product_id IN (SELECT id FROM products WHERE is_visible = true)
  );

-- =============================================================================
-- 5. RLS Policies — group_enrollments
-- =============================================================================

-- Admin: full access
CREATE POLICY "admin_full_access_group_enrollments"
  ON group_enrollments FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Gedus: read enrollments for their groups
CREATE POLICY "gedus_view_own_group_enrollments"
  ON group_enrollments FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gedu'
    AND group_id IN (
      SELECT id FROM product_groups WHERE gedu_id = auth.uid()
    )
  );

-- Gamers: read own enrollments
CREATE POLICY "gamers_view_own_enrollments"
  ON group_enrollments FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gamer'
    AND gamer_id = auth.uid()
  );

-- Authenticated: read enrollments for visible product groups
CREATE POLICY "authenticated_view_visible_group_enrollments"
  ON group_enrollments FOR SELECT TO authenticated
  USING (
    group_id IN (
      SELECT pg.id FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      WHERE p.is_visible = true
    )
  );

-- =============================================================================
-- 6. Grants
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON product_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON group_enrollments TO authenticated;

-- =============================================================================
-- 7. Helper RPC: get_product_groups_with_details
-- =============================================================================
CREATE OR REPLACE FUNCTION get_product_groups_with_details(p_product_id UUID)
RETURNS TABLE (
  group_id UUID,
  product_id UUID,
  gedu_id UUID,
  display_order INTEGER,
  gedu_display_name TEXT,
  gedu_email TEXT,
  gamer_id UUID,
  gamer_display_name TEXT,
  enrollment_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pg.id AS group_id,
    pg.product_id,
    pg.gedu_id,
    pg.display_order,
    gp.display_name AS gedu_display_name,
    gp.email AS gedu_email,
    ge.gamer_id,
    gmp.display_name AS gamer_display_name,
    ge.id AS enrollment_id
  FROM product_groups pg
  JOIN profiles gp ON gp.id = pg.gedu_id
  LEFT JOIN group_enrollments ge ON ge.group_id = pg.id
  LEFT JOIN profiles gmp ON gmp.id = ge.gamer_id
  WHERE pg.product_id = p_product_id
  ORDER BY pg.display_order, gmp.display_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION get_product_groups_with_details(UUID) TO authenticated;
