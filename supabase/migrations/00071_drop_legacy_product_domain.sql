-- Drop the legacy (v1) product / groups / enrollment domain.
--
-- Background: products v2 (products_v2 + participations_v2 + the Stripe flow)
-- is the live system; v1 has no users. The v1 frontend was removed in the
-- preceding PR (admin product pages, the group editor, the parent/gamer
-- group-viewing pages — replaced by the dashboard Sessions sections, the
-- products/groups/games services, and the v1 group-change emails). With no
-- code path left to call them, the v1 schema objects come out here.
--
-- Already gone (earlier migrations): the Sorg token system + enrollment_charges
-- + enroll/unenroll RPCs (00059), and voice_rooms + get_available_voice_rooms
-- (00060). This migration removes what those left behind.
--
-- The `_v2` → canonical rename is a SEPARATE follow-up migration; this one only
-- deletes. After this, `products`/`product_groups`/etc. names are free for the
-- rename to reuse.
--
-- Survives (NOT v1): gedu_locations (gedu coverage for substitute matching),
-- can_read_product() (reads products_v2 / participations_v2), and everything
-- with a `_v2` suffix.

-- =============================================================================
-- 1. Functions
-- =============================================================================
-- get_visible_products() RETURNS SETOF products, so it must go before the table
-- (a DROP TABLE ... CASCADE would take it anyway; explicit is clearer and keeps
-- the access-control allowlist honest). The group/enrollment RPCs are plpgsql
-- and have no hard parse-time dependency on the tables, but they're dead too.

DROP FUNCTION IF EXISTS get_visible_products();
DROP FUNCTION IF EXISTS get_my_groups();
DROP FUNCTION IF EXISTS commit_group_changes(UUID, JSONB, JSONB, UUID[], JSONB);
DROP FUNCTION IF EXISTS get_product_groups_with_details(UUID);
DROP FUNCTION IF EXISTS get_enrollment_groups(UUID);

-- =============================================================================
-- 2. Tables (drop in FK-dependency order; CASCADE clears policies, indexes,
--    and triggers — including products_updated_at, trg_validate_product_location,
--    and enforce_unique_gamer_per_product).
-- =============================================================================

DROP TABLE IF EXISTS group_enrollments CASCADE;
DROP TABLE IF EXISTS product_groups CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS games CASCADE;

-- =============================================================================
-- 3. Trigger functions left behind once their tables/triggers are gone.
-- =============================================================================

DROP FUNCTION IF EXISTS check_unique_gamer_per_product();
DROP FUNCTION IF EXISTS validate_product_location();
