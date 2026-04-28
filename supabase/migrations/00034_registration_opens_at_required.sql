-- Make products_v2.registration_opens_at non-nullable.
--
-- Rationale: every product type (consumer / muni / camp / event) has the same
-- "ticket drop" UX — pre-open countdown → open → closed/waitlist. A product
-- registered "right away" is just one whose open moment is `now()` at create
-- time. Treating immediate-open as `NULL` was a special case that forced the
-- detail page to branch and forced a muni-only check constraint to reinstate
-- the invariant on the one type where it mattered. Collapsing both into a
-- single always-set timestamp removes the branch.

-- 1. Backfill any pre-existing row that came in under the old "nullable"
--    contract. Using created_at gives a sensible "open since creation"
--    answer that's already in the past, so `pendingHintKey` will skip the
--    countdown branch — same behavior as the previous NULL.
UPDATE products_v2
SET registration_opens_at = created_at
WHERE registration_opens_at IS NULL;

-- 2. The muni-only constraint is now subsumed by NOT NULL on the column.
ALTER TABLE products_v2
  DROP CONSTRAINT chk_products_v2_muni_requires_registration_opens_at;

-- 3. Enforce the invariant universally.
ALTER TABLE products_v2
  ALTER COLUMN registration_opens_at SET NOT NULL;

-- 4. The partial-index predicate `WHERE registration_opens_at IS NOT NULL`
--    is now tautological. Replace with a plain index.
DROP INDEX idx_products_v2_reg_opens_at;
CREATE INDEX idx_products_v2_reg_opens_at ON products_v2(registration_opens_at);

-- 5. Recreate create_product_v2 with p_registration_opens_at promoted to a
--    required arg (no DEFAULT). The form always sends a value — "Right away"
--    is resolved to `new Date().toISOString()` on the client.
--
-- DROP + CREATE (rather than CREATE OR REPLACE) because the parameter list
-- is reordered: PG identifies functions by ordered argument types.
DROP FUNCTION IF EXISTS create_product_v2(
  product_type_v2, billing_mode_v2, JSONB, UUID, INTEGER, INTEGER, TEXT,
  BOOLEAN, TEXT, product_status_v2, BOOLEAN, BOOLEAN, TEXT, TEXT, UUID,
  INTEGER, DATE, DATE, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, UUID[], JSONB, UUID[]
);

CREATE FUNCTION create_product_v2(
  p_product_type          product_type_v2,
  p_billing_mode          billing_mode_v2,
  p_translations          JSONB,
  p_topic_id              UUID,
  p_min_age               INTEGER,
  p_max_age               INTEGER,
  p_spoken_language_code  TEXT,
  p_is_remote             BOOLEAN,
  p_timezone              TEXT,
  p_registration_opens_at TIMESTAMPTZ,
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
  BOOLEAN, TEXT, TIMESTAMPTZ, product_status_v2, BOOLEAN, BOOLEAN, TEXT, TEXT,
  UUID, INTEGER, DATE, DATE, INTEGER, INTEGER, JSONB, UUID[], JSONB, UUID[]
) FROM public, anon;

GRANT EXECUTE ON FUNCTION create_product_v2(
  product_type_v2, billing_mode_v2, JSONB, UUID, INTEGER, INTEGER, TEXT,
  BOOLEAN, TEXT, TIMESTAMPTZ, product_status_v2, BOOLEAN, BOOLEAN, TEXT, TEXT,
  UUID, INTEGER, DATE, DATE, INTEGER, INTEGER, JSONB, UUID[], JSONB, UUID[]
) TO authenticated;
