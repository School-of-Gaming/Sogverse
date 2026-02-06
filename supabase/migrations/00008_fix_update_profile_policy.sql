-- Migration: Fix infinite recursion in users_update_own_profile policy
-- Description: Replace direct subquery on profiles with get_user_role() to avoid
-- PostgreSQL error 42P17 (infinite recursion in policy for relation).
-- The subquery `SELECT role FROM profiles WHERE id = auth.uid()` triggers
-- recursive RLS evaluation on the same table. Using get_user_role() instead
-- bypasses RLS via SECURITY DEFINER.

DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;

CREATE POLICY "users_update_own_profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND
    -- Users cannot change their own role.
    -- get_user_role() is SECURITY DEFINER so it bypasses RLS,
    -- avoiding infinite recursion.
    role = get_user_role()
  );
