-- Fix: Wrap auth.uid() and get_user_role() in subselects for RLS initplan optimization
-- Resolves Supabase Linter: auth_rls_initplan (9 issues)
-- This ensures auth functions are evaluated once per query, not once per row.

-- 1. profiles: users_view_own_profile
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;
CREATE POLICY "users_view_own_profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

-- 2. profiles: parents_view_linked_gamers
DROP POLICY IF EXISTS "parents_view_linked_gamers" ON profiles;
CREATE POLICY "parents_view_linked_gamers"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    (select get_user_role()) = 'customer' AND
    id IN (SELECT gamer_id FROM parent_gamer WHERE parent_id = (select auth.uid()))
  );

-- 3. profiles: users_update_own_profile
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (
    id = (select auth.uid()) AND
    role = (select get_user_role())
  );

-- 4. parent_gamer: customers_view_own_links
DROP POLICY IF EXISTS "customers_view_own_links" ON parent_gamer;
CREATE POLICY "customers_view_own_links"
  ON parent_gamer
  FOR SELECT
  TO authenticated
  USING (
    (select get_user_role()) = 'customer' AND
    parent_id = (select auth.uid())
  );

-- 5. parent_gamer: customers_create_links
DROP POLICY IF EXISTS "customers_create_links" ON parent_gamer;
CREATE POLICY "customers_create_links"
  ON parent_gamer
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'customer' AND
    parent_id = (select auth.uid())
  );

-- 6. parent_gamer: customers_delete_own_links
DROP POLICY IF EXISTS "customers_delete_own_links" ON parent_gamer;
CREATE POLICY "customers_delete_own_links"
  ON parent_gamer
  FOR DELETE
  TO authenticated
  USING (
    (select get_user_role()) = 'customer' AND
    parent_id = (select auth.uid())
  );

-- 7. parent_gamer: gamers_view_parent_links
DROP POLICY IF EXISTS "gamers_view_parent_links" ON parent_gamer;
CREATE POLICY "gamers_view_parent_links"
  ON parent_gamer
  FOR SELECT
  TO authenticated
  USING (
    (select get_user_role()) = 'gamer' AND
    gamer_id = (select auth.uid())
  );

-- 8. voice_rooms: gedu_manage_own_voice_room
DROP POLICY IF EXISTS "gedu_manage_own_voice_room" ON voice_rooms;
CREATE POLICY "gedu_manage_own_voice_room"
  ON voice_rooms FOR ALL TO authenticated
  USING ((select get_user_role()) = 'gedu' AND creator_id = (select auth.uid()))
  WITH CHECK ((select get_user_role()) = 'gedu' AND creator_id = (select auth.uid()));

-- 9. token_transactions: Users can read own transactions
DROP POLICY IF EXISTS "Users can read own transactions" ON token_transactions;
CREATE POLICY "Users can read own transactions"
  ON token_transactions
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));
