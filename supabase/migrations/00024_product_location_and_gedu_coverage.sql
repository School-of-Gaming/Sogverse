-- Product location + spoken language, and gedu coverage areas.
--
-- Supports automated substitute matching: when a gedu can't cover their club,
-- the system needs to find other gedus who (a) can physically reach the venue
-- and (b) speak the language the club is delivered in.
--
-- See docs/locations-architecture.md for the substitute-matching query shape
-- and the Gedu/Product Locations plan that drove this migration.

-- =============================================================================
-- 1. products: is_remote, location_id, spoken_language_code
-- =============================================================================
--
-- All three columns are NOT NULL with no DEFAULT. Admins must pick location
-- (or explicitly mark remote) and spoken language on every new product.
-- There are no existing rows at the time of this migration, so no backfill
-- is needed.

ALTER TABLE products
  ADD COLUMN is_remote BOOLEAN NOT NULL,
  ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
  ADD COLUMN spoken_language_code TEXT NOT NULL REFERENCES spoken_languages(code) ON DELETE RESTRICT;

-- A product is either remote (no location) or in-person (has a location) — never both, never neither.
ALTER TABLE products ADD CONSTRAINT products_location_xor_remote
  CHECK (
    (is_remote = true  AND location_id IS NULL) OR
    (is_remote = false AND location_id IS NOT NULL)
  );

-- Enforce that location_id (when set) points at a leaf — a 'site'. We don't
-- want products attached to an entire region or city.
CREATE OR REPLACE FUNCTION public.validate_product_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  loc_type public.location_type;
BEGIN
  IF NEW.location_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT type INTO loc_type FROM public.locations WHERE id = NEW.location_id;
  IF loc_type IS NULL THEN
    RAISE EXCEPTION 'location_id % does not exist', NEW.location_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF loc_type <> 'site' THEN
    RAISE EXCEPTION 'Product location must be a site (leaf), got %', loc_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_product_location() FROM authenticated, anon, public;

CREATE TRIGGER trg_validate_product_location
  BEFORE INSERT OR UPDATE OF location_id ON products
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_location();

-- =============================================================================
-- 2. gedu_locations: coverage areas a gedu can sub at
-- =============================================================================
--
-- A gedu ticks rows at any level of the location hierarchy. The substitute-
-- matching query walks ancestors upward from the product's site — a single
-- row at a parent level matches every descendant without further rows.

CREATE TABLE gedu_locations (
  gedu_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gedu_id, location_id)
);

CREATE INDEX idx_gedu_locations_location ON gedu_locations(location_id);

ALTER TABLE gedu_locations ENABLE ROW LEVEL SECURITY;

-- Gedus can read/write their own coverage rows. WITH CHECK also verifies the
-- actor is actually a gedu — per the access-control rule, both actor and
-- target must be authorized.
CREATE POLICY "gedu_manage_own_locations"
  ON gedu_locations FOR ALL TO authenticated
  USING (gedu_id = (SELECT auth.uid()))
  WITH CHECK (
    gedu_id = (SELECT auth.uid())
    AND (SELECT get_user_role()) = 'gedu'
  );

-- Admins can read/write any rows (managing coverage from the user detail page).
CREATE POLICY "admin_manage_gedu_locations"
  ON gedu_locations FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

REVOKE ALL ON gedu_locations FROM authenticated;
GRANT SELECT, INSERT, DELETE ON gedu_locations TO authenticated;
