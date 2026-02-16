-- Migration: Products overhaul — recurring events with scheduling, games, and age ranges
-- Description: Create games table, add scheduling/game/age columns to products, drop metadata

-- =============================================================================
-- 1a. Create games table
-- =============================================================================
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_games"
  ON games FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_view_games"
  ON games FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON games TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON games TO authenticated;

-- =============================================================================
-- 1b. Seed a default game for existing rows
-- =============================================================================
INSERT INTO games (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Unassigned');

-- =============================================================================
-- 1c. Fix existing NULLs before adding NOT NULL constraints
-- =============================================================================
UPDATE products SET description = name WHERE description IS NULL;
UPDATE products SET image_url = '' WHERE image_url IS NULL;

-- =============================================================================
-- 1d. Alter products table
-- =============================================================================

-- Drop metadata column
ALTER TABLE products DROP COLUMN metadata;

-- Add created_by (nullable first so we can backfill)
ALTER TABLE products ADD COLUMN created_by UUID REFERENCES profiles(id);

-- Backfill created_by from the first admin profile
UPDATE products SET created_by = (
  SELECT id FROM profiles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1
);

-- Now make created_by NOT NULL
ALTER TABLE products ALTER COLUMN created_by SET NOT NULL;

-- Add new scheduling/game/age columns with temporary defaults for existing rows
ALTER TABLE products
  ADD COLUMN game_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES games(id),
  ADD COLUMN day_of_week SMALLINT NOT NULL DEFAULT 0 CHECK (day_of_week BETWEEN 0 AND 6),
  ADD COLUMN start_time TIME NOT NULL DEFAULT '12:00',
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Helsinki',
  ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  ADD COLUMN min_age INTEGER NOT NULL DEFAULT 0 CHECK (min_age >= 0),
  ADD COLUMN max_age INTEGER NOT NULL DEFAULT 99 CHECK (max_age >= 0);

-- Add check constraint: max_age >= min_age
ALTER TABLE products ADD CONSTRAINT chk_age_range CHECK (max_age >= min_age);

-- Drop temporary defaults (new rows must supply these explicitly)
ALTER TABLE products ALTER COLUMN game_id DROP DEFAULT;
ALTER TABLE products ALTER COLUMN day_of_week DROP DEFAULT;
ALTER TABLE products ALTER COLUMN start_time DROP DEFAULT;
ALTER TABLE products ALTER COLUMN duration_minutes DROP DEFAULT;
ALTER TABLE products ALTER COLUMN min_age DROP DEFAULT;
ALTER TABLE products ALTER COLUMN max_age DROP DEFAULT;

-- Make description and image_url NOT NULL
ALTER TABLE products ALTER COLUMN description SET NOT NULL;
ALTER TABLE products ALTER COLUMN image_url SET NOT NULL;

-- Indexes
CREATE INDEX idx_products_game ON products(game_id);
CREATE INDEX idx_products_day ON products(day_of_week);

-- =============================================================================
-- 1e. Recreate get_active_products() with search_path fix
-- =============================================================================
CREATE OR REPLACE FUNCTION get_active_products()
RETURNS SETOF products AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
