-- Migration: Grant INSERT, UPDATE, DELETE on products to authenticated role
-- Description: The previous migrations only granted SELECT on products to authenticated users.
-- This meant RLS policies (e.g. admin_full_access_products) could never take effect for
-- write operations because the table-level GRANT blocked them first.

GRANT INSERT, UPDATE, DELETE ON products TO authenticated;
