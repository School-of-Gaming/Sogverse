-- Migration: Row Level Security policies
-- Description: Implements access control for all tables based on user roles

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_gamer ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PROFILES POLICIES
-- =============================================================================

-- Admin: Full access to all profiles
CREATE POLICY "admin_full_access_profiles"
  ON profiles
  FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Users can view their own profile
CREATE POLICY "users_view_own_profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "users_update_own_profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND
    -- Users cannot change their own role
    role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- Customers can view profiles of their linked gamers
CREATE POLICY "parents_view_linked_gamers"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'customer' AND
    id IN (SELECT gamer_id FROM parent_gamer WHERE parent_id = auth.uid())
  );

-- =============================================================================
-- PARENT_GAMER POLICIES
-- =============================================================================

-- Admin: Full access
CREATE POLICY "admin_full_access_parent_gamer"
  ON parent_gamer
  FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Customers can view their own links
CREATE POLICY "customers_view_own_links"
  ON parent_gamer
  FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'customer' AND
    parent_id = auth.uid()
  );

-- Customers can create links (only for themselves)
CREATE POLICY "customers_create_links"
  ON parent_gamer
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() = 'customer' AND
    parent_id = auth.uid()
  );

-- Customers can delete their own links
CREATE POLICY "customers_delete_own_links"
  ON parent_gamer
  FOR DELETE
  TO authenticated
  USING (
    get_user_role() = 'customer' AND
    parent_id = auth.uid()
  );

-- Gamers can view their parent links
CREATE POLICY "gamers_view_parent_links"
  ON parent_gamer
  FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'gamer' AND
    gamer_id = auth.uid()
  );

-- =============================================================================
-- PRODUCTS POLICIES
-- =============================================================================

-- Admin: Full access
CREATE POLICY "admin_full_access_products"
  ON products
  FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Public (including anonymous): Read active products
CREATE POLICY "public_view_active_products"
  ON products
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant permissions on tables
GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url) ON profiles TO authenticated;

GRANT SELECT, INSERT, DELETE ON parent_gamer TO authenticated;

GRANT SELECT ON products TO anon, authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_parent_of(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_gamers() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_parents() TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_products() TO anon, authenticated;

COMMENT ON POLICY "admin_full_access_profiles" ON profiles IS 'Admins have full CRUD access to all profiles';
COMMENT ON POLICY "users_view_own_profile" ON profiles IS 'All users can view their own profile';
COMMENT ON POLICY "users_update_own_profile" ON profiles IS 'Users can update their own profile (except role)';
COMMENT ON POLICY "parents_view_linked_gamers" ON profiles IS 'Parents can view profiles of their linked gamers';
