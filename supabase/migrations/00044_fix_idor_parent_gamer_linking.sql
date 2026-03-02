-- Migration: Fix Finding #2 — IDOR: Unauthorized Gamer Linking
-- Description: Remove client-side INSERT access to parent_gamer table.
-- The customers_create_links policy only checks parent_id = auth.uid() but does
-- not validate whether the customer is authorized to link to the target gamer_id.
-- Any customer can link themselves to any gamer by calling the REST API directly.
-- All legitimate linking goes through the server-side /api/gamers/create route
-- using the service role client, which bypasses RLS entirely.

-- Drop the vulnerable INSERT policy
DROP POLICY IF EXISTS "customers_create_links" ON parent_gamer;

-- Revoke INSERT grant from authenticated users.
-- SELECT and DELETE remain — customers still need to read and remove their own links.
-- Admin policy + service role client (used by /api/gamers/create) still have full access.
REVOKE INSERT ON parent_gamer FROM authenticated;
