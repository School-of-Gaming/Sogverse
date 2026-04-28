-- products_v2 definition — foundational schema for the four-product-type redesign.
--
-- This migration lays down just enough to represent a product of any of the four
-- types (consumer club, municipality club, camp, event). Participations, groups,
-- payments, family subscriptions, and session-level tables land in follow-up
-- migrations.
--
-- Ships in parallel with the existing Sorg-era schema; every new object carries
-- a `_v2` suffix. Suffixes are stripped mechanically at cutover (§9 of the doc).
--
-- See docs/products-redesign.md § 5.1 – 5.8 for the design; CLAUDE.md for the
-- RLS / function-grant / migration-workflow rules.

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE product_type_v2 AS ENUM (
  'consumer_club',
  'municipality_club',
  'camp',
  'event'
);

CREATE TYPE billing_mode_v2 AS ENUM (
  'paid',
  'free',
  'external_contract'
);

CREATE TYPE product_status_v2 AS ENUM (
  'draft',
  'pending',
  'running',
  'completed',
  'cancelled'
);

CREATE TYPE topic_kind_v2 AS ENUM (
  'game',
  'subject'
);

-- =============================================================================
-- topics_v2
-- =============================================================================

CREATE TABLE topics_v2 (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  kind         topic_kind_v2 NOT NULL,
  description  TEXT,
  icon_path    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_topics_v2_kind ON topics_v2(kind);

CREATE TRIGGER topics_v2_updated_at
  BEFORE UPDATE ON topics_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE topics_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_topics_v2"
  ON topics_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_read_topics_v2"
  ON topics_v2 FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- tags_v2
-- =============================================================================

CREATE TABLE tags_v2 (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tags_v2_updated_at
  BEFORE UPDATE ON tags_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tags_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_tags_v2"
  ON tags_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_read_tags_v2"
  ON tags_v2 FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- holiday_calendars_v2 + calendar_holidays_v2
-- =============================================================================

CREATE TABLE holiday_calendars_v2 (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  timezone    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER holiday_calendars_v2_updated_at
  BEFORE UPDATE ON holiday_calendars_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE holiday_calendars_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_holiday_calendars_v2"
  ON holiday_calendars_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_read_holiday_calendars_v2"
  ON holiday_calendars_v2 FOR SELECT TO anon, authenticated
  USING (true);

CREATE TABLE calendar_holidays_v2 (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id  UUID NOT NULL REFERENCES holiday_calendars_v2(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  reason       TEXT,
  UNIQUE (calendar_id, date)
);

CREATE INDEX idx_calendar_holidays_v2_date ON calendar_holidays_v2(date);

ALTER TABLE calendar_holidays_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_calendar_holidays_v2"
  ON calendar_holidays_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_read_calendar_holidays_v2"
  ON calendar_holidays_v2 FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- site_details_v2 + site_staff_details_v2 — two visibility tiers on locations
-- =============================================================================
--
-- Two separate tables rather than one, because the information has two distinct
-- visibility tiers and column-level RLS is awkward:
--
--   site_details_v2        — member-visible. Address, parking, accessibility,
--                            wifi, opening hours. Shown on the parent-facing
--                            product detail page.
--   site_staff_details_v2  — admin + Gedu only. Gate codes, back-entrance
--                            directions, keys, ops notes. Never leaves staff
--                            surfaces.
--
-- Both are keyed by location_id (1:1 with locations) and restricted to
-- type='site' rows via a shared validator trigger.

CREATE OR REPLACE FUNCTION validate_site_details_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  loc_type public.location_type;
BEGIN
  SELECT type INTO loc_type FROM public.locations WHERE id = NEW.location_id;
  IF loc_type IS NULL THEN
    RAISE EXCEPTION 'location_id % does not exist', NEW.location_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF loc_type <> 'site' THEN
    RAISE EXCEPTION 'site detail rows are only valid for type=site (got %)', loc_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_site_details_location() FROM authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- site_details_v2 — member-visible
-- ---------------------------------------------------------------------------

CREATE TABLE site_details_v2 (
  location_id  UUID PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  address      TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER site_details_v2_updated_at
  BEFORE UPDATE ON site_details_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_validate_site_details_v2_location
  BEFORE INSERT OR UPDATE OF location_id ON site_details_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_site_details_location();

ALTER TABLE site_details_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_site_details_v2"
  ON site_details_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Anonymous browse needs the address to decide whether to sign up, so this
-- stays broadly readable. If product ever wants to gate address on membership,
-- add a participations_v2-aware policy once that table lands.
CREATE POLICY "public_read_site_details_v2"
  ON site_details_v2 FOR SELECT TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- site_staff_details_v2 — admin + Gedu only
-- ---------------------------------------------------------------------------

CREATE TABLE site_staff_details_v2 (
  location_id  UUID PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER site_staff_details_v2_updated_at
  BEFORE UPDATE ON site_staff_details_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_validate_site_staff_details_v2_location
  BEFORE INSERT OR UPDATE OF location_id ON site_staff_details_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_site_details_location();

ALTER TABLE site_staff_details_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_site_staff_details_v2"
  ON site_staff_details_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Gedus need these notes for sites they work at. Fine-grained gating —
-- "Gedus assigned to a group on a product at this site" — depends on
-- gedu_group_assignments_v2 + products_v2.location_id joins; that table
-- doesn't exist in this migration. For now, any Gedu can read. The check
-- tightens in the groups/gedu migration.
CREATE POLICY "gedu_read_site_staff_details_v2"
  ON site_staff_details_v2 FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) = 'gedu');

-- =============================================================================
-- products_v2
-- =============================================================================

CREATE TABLE products_v2 (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type          product_type_v2 NOT NULL,
  billing_mode          billing_mode_v2 NOT NULL,

  name                  TEXT NOT NULL,
  description           TEXT NOT NULL,
  topic_id              UUID NOT NULL REFERENCES topics_v2(id) ON DELETE RESTRICT,
  min_age               INTEGER NOT NULL CHECK (min_age >= 0),
  max_age               INTEGER NOT NULL CHECK (max_age >= 0),
  spoken_language_code  TEXT NOT NULL REFERENCES spoken_languages(code) ON DELETE RESTRICT,
  image_path            TEXT,
  padlet_url            TEXT,

  location_id           UUID REFERENCES locations(id) ON DELETE RESTRICT,
  is_remote             BOOLEAN NOT NULL,

  status                product_status_v2 NOT NULL DEFAULT 'draft',
  signup_threshold      INTEGER CHECK (signup_threshold IS NULL OR signup_threshold >= 1),

  start_date            DATE,
  end_date              DATE,
  timezone              TEXT NOT NULL,

  seat_count            INTEGER CHECK (seat_count IS NULL OR seat_count >= 1),
  waitlist_enabled      BOOLEAN NOT NULL DEFAULT true,

  registration_opens_at TIMESTAMPTZ,
  refund_policy_days    INTEGER CHECK (refund_policy_days IS NULL OR refund_policy_days >= 0),

  is_visible            BOOLEAN NOT NULL DEFAULT false,
  created_by            UUID NOT NULL REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_products_v2_age_range
    CHECK (max_age >= min_age),

  -- §4.7: product_type is a label; the business rules branch on orthogonal
  -- fields. These CHECKs enforce the combinations from §5.1.

  CONSTRAINT chk_products_v2_external_contract_muni
    CHECK (billing_mode <> 'external_contract' OR product_type = 'municipality_club'),

  CONSTRAINT chk_products_v2_seat_count_null_requires_free
    CHECK (seat_count IS NOT NULL OR billing_mode = 'free'),

  -- Events are one-off: start_date and end_date collapse to the same day.
  -- Both may be NULL on a draft that hasn't been scheduled yet.
  CONSTRAINT chk_products_v2_event_single_date
    CHECK (product_type <> 'event' OR end_date IS NOT DISTINCT FROM start_date),

  -- Non-consumer products must have an end_date once published.
  -- Consumer clubs are ongoing, so end_date stays nullable for them.
  CONSTRAINT chk_products_v2_non_consumer_has_end_date
    CHECK (
      product_type = 'consumer_club'
      OR status = 'draft'
      OR end_date IS NOT NULL
    ),

  -- In-person products must have a location.
  CONSTRAINT chk_products_v2_in_person_has_location
    CHECK (is_remote = true OR location_id IS NOT NULL),

  -- Online municipality clubs must have a jurisdiction location.
  CONSTRAINT chk_products_v2_online_muni_has_location
    CHECK (
      NOT (is_remote = true AND product_type = 'municipality_club')
      OR location_id IS NOT NULL
    ),

  -- Online non-muni products have no location.
  CONSTRAINT chk_products_v2_online_non_muni_no_location
    CHECK (
      NOT (is_remote = true AND product_type <> 'municipality_club')
      OR location_id IS NULL
    ),

  CONSTRAINT chk_products_v2_running_has_start_date
    CHECK (status <> 'running' OR start_date IS NOT NULL),

  CONSTRAINT chk_products_v2_threshold_within_seat_count
    CHECK (
      signup_threshold IS NULL
      OR seat_count IS NULL
      OR signup_threshold <= seat_count
    ),

  CONSTRAINT chk_products_v2_refund_policy_only_for_single_payment
    CHECK (refund_policy_days IS NULL OR product_type IN ('camp', 'event')),

  -- Municipality clubs must publish a ticket-drop time once out of draft.
  CONSTRAINT chk_products_v2_muni_requires_registration_opens_at
    CHECK (
      status = 'draft'
      OR product_type <> 'municipality_club'
      OR registration_opens_at IS NOT NULL
    ),

  CONSTRAINT chk_products_v2_date_range
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_products_v2_status ON products_v2(status);
CREATE INDEX idx_products_v2_type ON products_v2(product_type);
CREATE INDEX idx_products_v2_topic ON products_v2(topic_id);
CREATE INDEX idx_products_v2_location ON products_v2(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX idx_products_v2_visible ON products_v2(is_visible) WHERE is_visible = true;
CREATE INDEX idx_products_v2_reg_opens_at ON products_v2(registration_opens_at) WHERE registration_opens_at IS NOT NULL;

CREATE TRIGGER products_v2_updated_at
  BEFORE UPDATE ON products_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Cross-table validation: location_id's type must match (is_remote, product_type)
-- per §4.9. CHECK constraints above enforce presence/absence; this trigger
-- enforces the *type* of location.
CREATE OR REPLACE FUNCTION validate_products_v2_location()
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

  IF NEW.is_remote = false THEN
    IF loc_type <> 'site' THEN
      RAISE EXCEPTION 'In-person product location must be a site (got %)', loc_type
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.product_type = 'municipality_club' THEN
    IF loc_type NOT IN ('country', 'region', 'municipality') THEN
      RAISE EXCEPTION 'Online municipality club location must be country/region/municipality (got %)', loc_type
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_products_v2_location() FROM authenticated, anon, public;

CREATE TRIGGER trg_validate_products_v2_location
  BEFORE INSERT OR UPDATE OF location_id, is_remote, product_type ON products_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_products_v2_location();

ALTER TABLE products_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_products_v2"
  ON products_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Baseline public read for published products. Broader policies that let
-- parents see their participations' products land with the participations
-- migration (§5.8). Gedus see their assigned products via the same future
-- migration.
CREATE POLICY "public_read_published_products_v2"
  ON products_v2 FOR SELECT TO anon, authenticated
  USING (status IN ('pending', 'running') AND is_visible = true);

-- =============================================================================
-- schedule_slots_v2
-- =============================================================================

CREATE TABLE schedule_slots_v2 (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES products_v2(id) ON DELETE CASCADE,
  weekday           SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time        TIME NOT NULL,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, weekday)
);

COMMENT ON COLUMN schedule_slots_v2.weekday IS
  '0=Monday .. 6=Sunday (ISO-style, matches products-redesign.md §4.2).';

CREATE INDEX idx_schedule_slots_v2_product ON schedule_slots_v2(product_id);

CREATE TRIGGER schedule_slots_v2_updated_at
  BEFORE UPDATE ON schedule_slots_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE schedule_slots_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_schedule_slots_v2"
  ON schedule_slots_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Follows parent product's visibility for public/customer/gamer/gedu reads.
CREATE POLICY "public_read_schedule_slots_v2"
  ON schedule_slots_v2 FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products_v2 p
      WHERE p.id = schedule_slots_v2.product_id
        AND p.status IN ('pending', 'running')
        AND p.is_visible = true
    )
  );

-- =============================================================================
-- product_tags_v2
-- =============================================================================

CREATE TABLE product_tags_v2 (
  product_id  UUID NOT NULL REFERENCES products_v2(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags_v2(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, tag_id)
);

CREATE INDEX idx_product_tags_v2_tag ON product_tags_v2(tag_id);

ALTER TABLE product_tags_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_product_tags_v2"
  ON product_tags_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_read_product_tags_v2"
  ON product_tags_v2 FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products_v2 p
      WHERE p.id = product_tags_v2.product_id
        AND p.status IN ('pending', 'running')
        AND p.is_visible = true
    )
  );

-- =============================================================================
-- product_prices_v2 — manually-entered per-currency base prices (§5.1a)
-- =============================================================================
--
-- currency is constrained against SUPPORTED_CURRENCIES in
-- src/lib/constants/currency.ts. Keep the two in sync when adding a currency.

CREATE TABLE product_prices_v2 (
  product_id         UUID NOT NULL REFERENCES products_v2(id) ON DELETE CASCADE,
  currency           TEXT NOT NULL CHECK (currency IN ('eur', 'gbp', 'usd')),
  price_per_session  INTEGER NOT NULL CHECK (price_per_session >= 0),
  price_per_month    INTEGER NOT NULL CHECK (price_per_month >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, currency)
);

CREATE TRIGGER product_prices_v2_updated_at
  BEFORE UPDATE ON product_prices_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE product_prices_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_product_prices_v2"
  ON product_prices_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_read_product_prices_v2"
  ON product_prices_v2 FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products_v2 p
      WHERE p.id = product_prices_v2.product_id
        AND p.status IN ('pending', 'running')
        AND p.is_visible = true
    )
  );

-- =============================================================================
-- product_holiday_calendars_v2 — products subscribe to shared holiday calendars
-- =============================================================================

CREATE TABLE product_holiday_calendars_v2 (
  product_id   UUID NOT NULL REFERENCES products_v2(id) ON DELETE CASCADE,
  calendar_id  UUID NOT NULL REFERENCES holiday_calendars_v2(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, calendar_id)
);

CREATE INDEX idx_product_holiday_calendars_v2_calendar ON product_holiday_calendars_v2(calendar_id);

ALTER TABLE product_holiday_calendars_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_product_holiday_calendars_v2"
  ON product_holiday_calendars_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_read_product_holiday_calendars_v2"
  ON product_holiday_calendars_v2 FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products_v2 p
      WHERE p.id = product_holiday_calendars_v2.product_id
        AND p.status IN ('pending', 'running')
        AND p.is_visible = true
    )
  );

-- =============================================================================
-- Table grants
-- =============================================================================
--
-- Admin UI writes these tables directly from the browser via the
-- `admin_full_access_*` RLS policies — same pattern as the existing `products`
-- table. Add the new tables to tests/db/access-control.test.ts
-- WRITE_GRANT_ALLOWLIST alongside this migration.

REVOKE ALL ON topics_v2                     FROM authenticated;
REVOKE ALL ON tags_v2                       FROM authenticated;
REVOKE ALL ON holiday_calendars_v2          FROM authenticated;
REVOKE ALL ON calendar_holidays_v2          FROM authenticated;
REVOKE ALL ON site_details_v2               FROM authenticated;
REVOKE ALL ON site_staff_details_v2         FROM authenticated;
REVOKE ALL ON products_v2                   FROM authenticated;
REVOKE ALL ON schedule_slots_v2             FROM authenticated;
REVOKE ALL ON product_tags_v2               FROM authenticated;
REVOKE ALL ON product_prices_v2             FROM authenticated;
REVOKE ALL ON product_holiday_calendars_v2  FROM authenticated;

GRANT SELECT                        ON topics_v2                     TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON topics_v2                     TO authenticated;

GRANT SELECT                        ON tags_v2                       TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON tags_v2                       TO authenticated;

GRANT SELECT                        ON holiday_calendars_v2          TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON holiday_calendars_v2          TO authenticated;

GRANT SELECT                        ON calendar_holidays_v2          TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON calendar_holidays_v2          TO authenticated;

GRANT SELECT                        ON site_details_v2               TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON site_details_v2               TO authenticated;

-- site_staff_details_v2: authenticated-only SELECT (Gedu policy gates it).
-- No anon grant — non-authenticated users can't see staff notes.
GRANT SELECT                        ON site_staff_details_v2         TO authenticated;
GRANT INSERT, UPDATE, DELETE        ON site_staff_details_v2         TO authenticated;

GRANT SELECT                        ON products_v2                   TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON products_v2                   TO authenticated;

GRANT SELECT                        ON schedule_slots_v2             TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON schedule_slots_v2             TO authenticated;

GRANT SELECT                        ON product_tags_v2               TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON product_tags_v2               TO authenticated;

GRANT SELECT                        ON product_prices_v2             TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON product_prices_v2             TO authenticated;

GRANT SELECT                        ON product_holiday_calendars_v2  TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON product_holiday_calendars_v2  TO authenticated;
