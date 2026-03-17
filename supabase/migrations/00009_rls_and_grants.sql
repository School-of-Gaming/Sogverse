-- =============================================================================
-- Row Level Security policies and permission grants
-- =============================================================================

-- All RLS policies and table/function grants are centralized here for
-- easy auditing. Tables have RLS enabled in their creation migrations.

-- =============================================================================
-- PROFILES POLICIES
-- =============================================================================

CREATE POLICY "admin_full_access_profiles"
  ON profiles FOR ALL TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Wrap auth.uid() / get_user_role() in (select ...) for RLS initplan optimization:
-- evaluated once per query instead of once per row.
CREATE POLICY "users_view_own_profile"
  ON profiles FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

-- Uses get_user_role() instead of a subquery on profiles to avoid PostgreSQL
-- error 42P17 (infinite recursion in policy for relation).
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (
    id = (select auth.uid()) AND
    role = (select get_user_role())
  );

CREATE POLICY "parents_view_linked_gamers"
  ON profiles FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'customer' AND
    id IN (SELECT gamer_id FROM parent_gamer WHERE parent_id = (select auth.uid()))
  );

-- =============================================================================
-- CUSTOMER_PROFILES POLICIES
-- =============================================================================

CREATE POLICY "admin_full_access_customer_profiles"
  ON customer_profiles FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY "customers_read_own_customer_profile"
  ON customer_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- GAMER_PROFILES POLICIES
-- =============================================================================

CREATE POLICY "admin_full_access_gamer_profiles"
  ON gamer_profiles FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY "gamers_read_own_gamer_profile"
  ON gamer_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "gamers_update_own_gamer_profile"
  ON gamer_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "parents_read_linked_gamer_profiles"
  ON gamer_profiles FOR SELECT TO authenticated
  USING (is_parent_of(user_id));

-- =============================================================================
-- PARENT_GAMER POLICIES
-- =============================================================================

-- No INSERT policy: all linking goes through the server-side /api/gamers/create
-- route using the service-role client, which bypasses RLS entirely.

CREATE POLICY "admin_full_access_parent_gamer"
  ON parent_gamer FOR ALL TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "customers_view_own_links"
  ON parent_gamer FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'customer' AND
    parent_id = (select auth.uid())
  );

CREATE POLICY "customers_delete_own_links"
  ON parent_gamer FOR DELETE TO authenticated
  USING (
    (select get_user_role()) = 'customer' AND
    parent_id = (select auth.uid())
  );

CREATE POLICY "gamers_view_parent_links"
  ON parent_gamer FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'gamer' AND
    gamer_id = (select auth.uid())
  );

-- =============================================================================
-- PRODUCTS POLICIES
-- =============================================================================

CREATE POLICY "admin_full_access_products"
  ON products FOR ALL TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "public_view_visible_products"
  ON products FOR SELECT TO anon, authenticated
  USING (is_visible = true);

-- =============================================================================
-- GAMES POLICIES
-- =============================================================================

CREATE POLICY "admin_full_access_games"
  ON games FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_view_games"
  ON games FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- VOICE_ROOMS POLICIES
-- =============================================================================

CREATE POLICY "admin_full_access_voice_rooms"
  ON voice_rooms FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "gedu_view_voice_rooms"
  ON voice_rooms FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gedu'
    AND (
      room_type = 'gedu_only'
      OR (room_type = 'group' AND group_id IN (
        SELECT id FROM product_groups WHERE gedu_id = auth.uid()
      ))
    )
  );

CREATE POLICY "gamer_view_enrolled_voice_rooms"
  ON voice_rooms FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gamer'
    AND room_type = 'group'
    AND group_id IN (
      SELECT ge.group_id FROM group_enrollments ge
       WHERE ge.gamer_id = auth.uid()
         AND ge.status = 'active'
    )
  );

-- =============================================================================
-- TOKEN_TRANSACTIONS POLICIES
-- =============================================================================

CREATE POLICY "admin_full_access_token_transactions"
  ON token_transactions FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY "users_read_own_transactions"
  ON token_transactions FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================================================
-- PRODUCT_GROUPS POLICIES
-- =============================================================================

CREATE POLICY "admin_full_access_product_groups"
  ON product_groups FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "gedus_view_own_groups"
  ON product_groups FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gedu'
    AND gedu_id = auth.uid()
  );

CREATE POLICY "authenticated_view_visible_product_groups"
  ON product_groups FOR SELECT TO authenticated
  USING (
    product_id IN (SELECT id FROM products WHERE is_visible = true)
  );

-- =============================================================================
-- GROUP_ENROLLMENTS POLICIES
-- =============================================================================

CREATE POLICY "admin_full_access_group_enrollments"
  ON group_enrollments FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "gedus_view_own_group_enrollments"
  ON group_enrollments FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gedu'
    AND group_id IN (
      SELECT id FROM product_groups WHERE gedu_id = auth.uid()
    )
  );

CREATE POLICY "gamers_view_own_enrollments"
  ON group_enrollments FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gamer'
    AND gamer_id = auth.uid()
  );

CREATE POLICY "authenticated_view_visible_group_enrollments"
  ON group_enrollments FOR SELECT TO authenticated
  USING (
    group_id IN (
      SELECT pg.id FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      WHERE p.is_visible = true
    )
  );

CREATE POLICY "customers_read_own_enrollments"
  ON group_enrollments FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND enrolled_by = auth.uid()
  );

-- =============================================================================
-- ENROLLMENT_CHARGES POLICIES
-- =============================================================================

CREATE POLICY "admin_full_access_enrollment_charges"
  ON enrollment_charges FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "customers_read_own_enrollment_charges"
  ON enrollment_charges FOR SELECT TO authenticated
  USING (
    enrollment_id IN (
      SELECT id FROM group_enrollments WHERE enrolled_by = auth.uid()
    )
  );

-- =============================================================================
-- TABLE GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- profiles: SELECT + UPDATE(display_name) only
GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (display_name) ON profiles TO authenticated;

-- parent_gamer: SELECT + DELETE only (INSERT revoked — linking goes through service-role).
-- Explicit REVOKE needed because Supabase bootstraps default grants on public tables.
REVOKE ALL ON parent_gamer FROM authenticated;
GRANT SELECT, DELETE ON parent_gamer TO authenticated;

-- products: full CRUD for admin RLS policies, SELECT for anon
GRANT SELECT ON products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON products TO authenticated;

-- games: same pattern as products
GRANT SELECT ON games TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON games TO authenticated;

-- voice_rooms: read-only for authenticated (writes go through admin client / migration seed)
GRANT SELECT ON voice_rooms TO authenticated;

-- token_transactions: read-only (writes go through adjust_token_balance RPC)
GRANT SELECT ON token_transactions TO authenticated;

-- customer_profiles: read-only (writes go through adjust_token_balance RPC)
GRANT SELECT ON customer_profiles TO authenticated;

-- gamer_profiles: SELECT + UPDATE for gamers/parents
GRANT SELECT, UPDATE ON gamer_profiles TO authenticated;

-- product_groups: full CRUD for admin commit_group_changes RPC
GRANT SELECT, INSERT, UPDATE, DELETE ON product_groups TO authenticated;

-- group_enrollments: full CRUD for admin/enrollment RPCs
GRANT SELECT, INSERT, UPDATE, DELETE ON group_enrollments TO authenticated;

-- enrollment_charges: read-only
GRANT SELECT ON enrollment_charges TO authenticated;

-- =============================================================================
-- FUNCTION GRANTS
-- =============================================================================

-- In Supabase, anon and authenticated are separate roles — neither inherits
-- from public. Must explicitly revoke from all three, then grant back as needed.

-- Auth helpers: authenticated only
REVOKE EXECUTE ON FUNCTION get_user_role() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_admin() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- Parent-gamer helpers: authenticated only
REVOKE EXECUTE ON FUNCTION is_parent_of(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION is_parent_of(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_my_gamers() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_gamers() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_my_parents() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_parents() TO authenticated;

-- Product queries: get_visible_products is public, rest are authenticated
REVOKE EXECUTE ON FUNCTION get_visible_products() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_visible_products() TO anon, authenticated;

-- Voice rooms: authenticated only
REVOKE EXECUTE ON FUNCTION get_available_voice_rooms() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_available_voice_rooms() TO authenticated;

-- Group management RPCs: authenticated only (admin-gated internally)
REVOKE EXECUTE ON FUNCTION get_product_groups_with_details(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_product_groups_with_details(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION commit_group_changes(UUID, JSONB, JSONB, UUID[], JSONB) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION commit_group_changes(UUID, JSONB, JSONB, UUID[], JSONB) TO authenticated;

-- Customer-facing enrollment RPCs: authenticated only
REVOKE EXECUTE ON FUNCTION get_enrollment_groups(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_enrollment_groups(UUID) TO authenticated;

-- Service-role only: enrollment write RPCs (called from API routes)
REVOKE EXECUTE ON FUNCTION enroll_gamer_in_group(UUID, UUID, UUID, DATE) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION unenroll_gamer(UUID, UUID, BOOLEAN) FROM public, anon, authenticated;

-- Service-role only: token balance (called from API routes and other RPCs)
REVOKE EXECUTE ON FUNCTION adjust_token_balance(UUID, INTEGER, token_transaction_type, TEXT, TEXT, TEXT, UUID, TEXT) FROM public, anon, authenticated;

-- Cron-only: internal functions (called by pg_cron, not via PostgREST)
REVOKE EXECUTE ON FUNCTION compute_next_session(SMALLINT, TIME, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION process_enrollment_charges() FROM public, anon, authenticated;
