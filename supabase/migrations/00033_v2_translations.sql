-- Localize products_v2 / topics_v2 / tags_v2 — split user-visible text out
-- into per-locale child tables so admins can provide a name + description in
-- multiple languages and parents see the product info in their own UI locale.
--
-- See docs/products-redesign.md (translations section) for the resolution
-- rule (user_locale → en → fi → first_available) and the must-have-en-or-fi
-- rule, and docs/i18n-architecture.md for the broader locale model.
--
-- This migration:
--   1. Creates product_translations_v2 / topic_translations_v2 / tag_translations_v2.
--   2. Backfills existing rows under locale 'en' (per agreed default).
--   3. Drops the now-redundant `name` / `description` columns from the parents.
--   4. Re-creates create_product_v2() to take a `p_translations` JSONB array
--      instead of `p_name` / `p_description`, with validation that at least
--      one of (en, fi) is supplied.
--   5. Adds a BEFORE-DELETE trigger on product_translations_v2 so a product
--      can never end up with no en/fi translation through routine deletes.
--
-- NOTE: inline topic/tag create stays single-locale (current admin locale only).
-- Other-locale names for shared reference data (topics, tags) are managed in a
-- future "Manage topic/tag translations" admin UI — see products-redesign.md.

-- =============================================================================
-- product_translations_v2
-- =============================================================================

CREATE TABLE product_translations_v2 (
  product_id   UUID NOT NULL REFERENCES products_v2(id) ON DELETE CASCADE,
  locale       TEXT NOT NULL,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, locale)
);

CREATE INDEX idx_product_translations_v2_locale
  ON product_translations_v2(locale);

CREATE TRIGGER product_translations_v2_updated_at
  BEFORE UPDATE ON product_translations_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Backfill: existing rows are assumed English. Confirmed with product owner.
INSERT INTO product_translations_v2 (product_id, locale, name, description)
SELECT id, 'en', name, description FROM products_v2;

ALTER TABLE product_translations_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_product_translations_v2"
  ON product_translations_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Public read follows parent visibility — same predicate as the other v2
-- child tables (schedule_slots_v2, product_prices_v2, product_tags_v2).
CREATE POLICY "public_read_product_translations_v2"
  ON product_translations_v2 FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products_v2 p
      WHERE p.id = product_translations_v2.product_id
        AND p.status IN ('pending', 'running')
        AND p.is_visible = true
    )
  );

-- Trigger: prevent deleting the last en/fi translation on a product.
-- The RPC validates inserts; this catches direct deletes from the admin UI
-- so a product can never reach a state where parents in en/fi have no copy.
CREATE OR REPLACE FUNCTION ensure_product_keeps_en_or_fi_translation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Removing a non-(en,fi) row never breaks the rule.
  IF OLD.locale NOT IN ('en', 'fi') THEN
    RETURN OLD;
  END IF;

  -- Allowed if at least one OTHER en/fi row will remain after this delete.
  IF EXISTS (
    SELECT 1 FROM public.product_translations_v2
    WHERE product_id = OLD.product_id
      AND locale IN ('en', 'fi')
      AND locale <> OLD.locale
  ) THEN
    RETURN OLD;
  END IF;

  -- The product itself is being deleted — CASCADE delete is fine.
  IF NOT EXISTS (
    SELECT 1 FROM public.products_v2 WHERE id = OLD.product_id
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Each product must keep at least one of (en, fi) translations'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION ensure_product_keeps_en_or_fi_translation()
  FROM authenticated, anon, public;

CREATE TRIGGER trg_ensure_product_keeps_en_or_fi_translation
  BEFORE DELETE ON product_translations_v2
  FOR EACH ROW
  EXECUTE FUNCTION ensure_product_keeps_en_or_fi_translation();

-- =============================================================================
-- topic_translations_v2
-- =============================================================================

CREATE TABLE topic_translations_v2 (
  topic_id     UUID NOT NULL REFERENCES topics_v2(id) ON DELETE CASCADE,
  locale       TEXT NOT NULL,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (topic_id, locale)
);

CREATE INDEX idx_topic_translations_v2_locale
  ON topic_translations_v2(locale);

CREATE TRIGGER topic_translations_v2_updated_at
  BEFORE UPDATE ON topic_translations_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

INSERT INTO topic_translations_v2 (topic_id, locale, name, description)
SELECT id, 'en', name, description FROM topics_v2;

ALTER TABLE topic_translations_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_topic_translations_v2"
  ON topic_translations_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_read_topic_translations_v2"
  ON topic_translations_v2 FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- tag_translations_v2
-- =============================================================================

CREATE TABLE tag_translations_v2 (
  tag_id       UUID NOT NULL REFERENCES tags_v2(id) ON DELETE CASCADE,
  locale       TEXT NOT NULL,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tag_id, locale)
);

CREATE INDEX idx_tag_translations_v2_locale
  ON tag_translations_v2(locale);

CREATE TRIGGER tag_translations_v2_updated_at
  BEFORE UPDATE ON tag_translations_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

INSERT INTO tag_translations_v2 (tag_id, locale, name, description)
SELECT id, 'en', name, description FROM tags_v2;

ALTER TABLE tag_translations_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_tag_translations_v2"
  ON tag_translations_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "public_read_tag_translations_v2"
  ON tag_translations_v2 FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- Drop name/description columns from parents — translation tables now own them
-- =============================================================================
--
-- Drop the existing create_product_v2() first since its body references the
-- columns we're about to drop. Re-created further down with the new
-- p_translations JSONB array argument.

DROP FUNCTION IF EXISTS create_product_v2(
  product_type_v2, billing_mode_v2, TEXT, TEXT, UUID, INTEGER, INTEGER, TEXT,
  BOOLEAN, TEXT, product_status_v2, BOOLEAN, BOOLEAN, TEXT, TEXT, UUID,
  INTEGER, DATE, DATE, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, UUID[], JSONB, UUID[]
);

ALTER TABLE products_v2 DROP COLUMN name;
ALTER TABLE products_v2 DROP COLUMN description;

ALTER TABLE topics_v2 DROP COLUMN name;
ALTER TABLE topics_v2 DROP COLUMN description;

ALTER TABLE tags_v2 DROP COLUMN name;
ALTER TABLE tags_v2 DROP COLUMN description;

-- =============================================================================
-- Re-create create_product_v2() with p_translations
-- =============================================================================

CREATE OR REPLACE FUNCTION create_product_v2(
  p_product_type          product_type_v2,
  p_billing_mode          billing_mode_v2,
  p_translations          JSONB,
  p_topic_id              UUID,
  p_min_age               INTEGER,
  p_max_age               INTEGER,
  p_spoken_language_code  TEXT,
  p_is_remote             BOOLEAN,
  p_timezone              TEXT,
  p_status                product_status_v2      DEFAULT 'draft',
  p_is_visible            BOOLEAN                DEFAULT false,
  p_waitlist_enabled      BOOLEAN                DEFAULT true,
  p_image_path            TEXT                   DEFAULT NULL,
  p_padlet_url            TEXT                   DEFAULT NULL,
  p_location_id           UUID                   DEFAULT NULL,
  p_signup_threshold      INTEGER                DEFAULT NULL,
  p_start_date            DATE                   DEFAULT NULL,
  p_end_date              DATE                   DEFAULT NULL,
  p_seat_count            INTEGER                DEFAULT NULL,
  p_registration_opens_at TIMESTAMPTZ            DEFAULT NULL,
  p_refund_policy_days    INTEGER                DEFAULT NULL,
  p_schedule_slots        JSONB                  DEFAULT NULL,
  p_tag_ids               UUID[]                 DEFAULT NULL,
  p_prices                JSONB                  DEFAULT NULL,
  p_holiday_calendar_ids  UUID[]                 DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_product_id    UUID;
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_has_en_or_fi  BOOLEAN := false;
BEGIN
  IF (SELECT public.get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can create products'
      USING ERRCODE = '42501';
  END IF;

  -- Translations: must have at least one entry, and must include en or fi.
  -- See docs/products-redesign.md "Translations".
  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    IF v_translation->>'locale' IN ('en', 'fi') THEN
      v_has_en_or_fi := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_has_en_or_fi THEN
    RAISE EXCEPTION 'Products must have at least one of (en, fi) translations'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.products_v2 (
    product_type, billing_mode, topic_id,
    min_age, max_age, spoken_language_code, image_path, padlet_url,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    refund_policy_days, is_visible, created_by
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic_id,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path, p_padlet_url,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_refund_policy_days, p_is_visible, auth.uid()
  )
  RETURNING id INTO v_product_id;

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations_v2 (
      product_id, locale, name, description
    )
    VALUES (
      v_product_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'description', '')
    );
  END LOOP;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots_v2 (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        v_product_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.product_tags_v2 (product_id, tag_id)
    SELECT v_product_id, unnest(p_tag_ids);
  END IF;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices_v2 (
        product_id, currency, price_per_session, price_per_month
      )
      VALUES (
        v_product_id,
        v_price->>'currency',
        (v_price->>'price_per_session')::INTEGER,
        (v_price->>'price_per_month')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars_v2 (product_id, calendar_id)
    SELECT v_product_id, unnest(p_holiday_calendar_ids);
  END IF;

  RETURN v_product_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_product_v2(
  product_type_v2, billing_mode_v2, JSONB, UUID, INTEGER, INTEGER, TEXT,
  BOOLEAN, TEXT, product_status_v2, BOOLEAN, BOOLEAN, TEXT, TEXT, UUID,
  INTEGER, DATE, DATE, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, UUID[], JSONB, UUID[]
) FROM public, anon;

GRANT EXECUTE ON FUNCTION create_product_v2(
  product_type_v2, billing_mode_v2, JSONB, UUID, INTEGER, INTEGER, TEXT,
  BOOLEAN, TEXT, product_status_v2, BOOLEAN, BOOLEAN, TEXT, TEXT, UUID,
  INTEGER, DATE, DATE, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, UUID[], JSONB, UUID[]
) TO authenticated;

-- =============================================================================
-- Table grants for the new translation tables
-- =============================================================================
--
-- Mirrors the parent v2 tables: admin UI writes directly via
-- admin_full_access_* RLS policies, so authenticated needs INSERT/UPDATE/DELETE
-- + SELECT. Add these to tests/db/access-control.test.ts WRITE_GRANT_ALLOWLIST.

REVOKE ALL ON product_translations_v2 FROM authenticated;
REVOKE ALL ON topic_translations_v2   FROM authenticated;
REVOKE ALL ON tag_translations_v2     FROM authenticated;

GRANT SELECT                        ON product_translations_v2 TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON product_translations_v2 TO authenticated;

GRANT SELECT                        ON topic_translations_v2   TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON topic_translations_v2   TO authenticated;

GRANT SELECT                        ON tag_translations_v2     TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON tag_translations_v2     TO authenticated;
