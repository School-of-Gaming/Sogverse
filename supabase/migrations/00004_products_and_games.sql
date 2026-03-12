-- Games table, products table, get_visible_products

-- =============================================================================
-- Games
-- =============================================================================

CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Seed default game (referenced by any product that hasn't been assigned a game)
INSERT INTO games (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Unassigned');

-- =============================================================================
-- Products
-- =============================================================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  padlet_url TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id),
  game_id UUID NOT NULL REFERENCES games(id),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  timezone TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  min_age INTEGER NOT NULL CHECK (min_age >= 0),
  max_age INTEGER NOT NULL CHECK (max_age >= 0),
  token_cost INTEGER NOT NULL CHECK (token_cost >= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_age_range CHECK (max_age >= min_age)
);

CREATE INDEX idx_products_visible ON products(is_visible) WHERE is_visible = true;
CREATE INDEX idx_products_game ON products(game_id);
CREATE INDEX idx_products_day ON products(day_of_week);

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- get_visible_products RPC
-- =============================================================================

CREATE FUNCTION get_visible_products()
RETURNS SETOF products AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM products WHERE is_visible = true ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
