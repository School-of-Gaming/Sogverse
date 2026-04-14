-- Restore authenticated INSERT/UPDATE/DELETE on products and games.
--
-- These grants were silently dropped during commit 0268419 ("Co-locate
-- RLS policies and grants into domain migration files") when
-- 00009_rls_and_grants.sql was dissolved into per-domain files. The
-- admin_full_access_{products,games} RLS policies remained, but without
-- the underlying table grants they were dead weight: authenticated
-- writes failed with "permission denied for table products" before
-- RLS ever got a chance to authorise them.
--
-- The admin edit UI writes directly from the browser client (see
-- services/products/products.service.ts updateProduct / deleteProduct /
-- toggleProductVisibility). Restoring the grants re-enables that path.
-- RLS policies `admin_full_access_products` and `admin_full_access_games`
-- still restrict who can actually succeed — only admins pass the
-- `get_user_role() = 'admin'` predicate.

GRANT INSERT, UPDATE, DELETE ON products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON games TO authenticated;
