-- Migration: Rename is_active → is_visible
-- Description: Rename "active/inactive" to "visible/hidden" to distinguish public listing
-- from future "active enrollment" state. Column rename, index, RLS policy, and RPC function.

-- =============================================================================
-- 1. Rename the column
-- =============================================================================
ALTER TABLE products RENAME COLUMN is_active TO is_visible;

-- =============================================================================
-- 2. Drop & recreate partial index (index conditions don't auto-update)
-- =============================================================================
DROP INDEX IF EXISTS idx_products_active;
CREATE INDEX idx_products_visible ON products(is_visible) WHERE is_visible = true;

-- =============================================================================
-- 3. Drop & recreate RLS policy (policy text doesn't auto-update on column rename)
-- =============================================================================
DROP POLICY IF EXISTS "public_view_active_products" ON products;
CREATE POLICY "public_view_visible_products" ON products FOR SELECT TO anon, authenticated
  USING (is_visible = true);

-- =============================================================================
-- 4. Replace get_active_products() with get_visible_products()
-- =============================================================================
DROP FUNCTION IF EXISTS get_active_products();

CREATE FUNCTION get_visible_products()
RETURNS SETOF products AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM products WHERE is_visible = true ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION get_visible_products() TO anon, authenticated;
