-- Hierarchical location system for mapping products, gedus, and future
-- entities to geographic regions. Uses a self-referential adjacency list
-- with a location_type enum for level classification.
--
-- See docs/locations-architecture.md for the full design, hierarchy examples,
-- and international expansion plan.

-- =============================================================================
-- Enum
-- =============================================================================

CREATE TYPE location_type AS ENUM (
  'country',
  'region',        -- state, province, county, maakunta
  'municipality',  -- city, town, kunta
  'district',      -- school district, borough, neighborhood
  'site'           -- individual school, company, building
);

-- =============================================================================
-- Table
-- =============================================================================

CREATE TABLE locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  type         location_type NOT NULL,
  parent_id    UUID REFERENCES locations(id) ON DELETE RESTRICT,
  country_code TEXT,  -- ISO 3166-1 alpha-2 (e.g. 'FI', 'GB', 'US'), denormalized for fast filtering
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT locations_no_self_parent CHECK (parent_id IS DISTINCT FROM id)
);

CREATE INDEX idx_locations_parent ON locations(parent_id);
CREATE INDEX idx_locations_type ON locations(type);
CREATE INDEX idx_locations_country ON locations(country_code) WHERE country_code IS NOT NULL;

CREATE TRIGGER locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Locations are reference data — all authenticated users can read
CREATE POLICY "authenticated_read_locations"
  ON locations FOR SELECT TO authenticated
  USING (true);

-- Only admins can manage locations
CREATE POLICY "admin_manage_locations"
  ON locations FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- =============================================================================
-- Grants
-- =============================================================================

REVOKE ALL ON locations FROM authenticated;
GRANT SELECT ON locations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON locations TO authenticated;

-- =============================================================================
-- Function grants — no RPCs in this migration, nothing to revoke
-- =============================================================================
