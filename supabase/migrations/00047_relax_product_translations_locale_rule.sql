-- Relax the product translation rule: any locale, not just en/fi.
--
-- Previously every product had to keep ≥1 of (en, fi). The reason was a
-- "translation must always be readable" guarantee — if the user's locale
-- is missing, fall back to en, then fi. We're loosening this: a product
-- only needs ≥1 row in any locale. The display fallback chain is now
-- preferred-locale → en → first available, which still always resolves
-- because at least one row exists.
--
-- Three pieces change in lock-step:
--   1. The BEFORE-DELETE trigger goes from "≥1 en/fi remains" to
--      "≥1 row remains." Renamed for clarity.
--   2. create_product_v2() drops the en/fi-must-exist check; only the
--      "non-empty translations" check remains.
--   3. update_product_v2() drops the same check. The wipe-and-replace
--      ordering (UPSERT new rows, then DELETE leftovers) still works
--      under the new rule for the same reason it worked under the old
--      one — by the time deletes fire, the new set is already in place.

-- =============================================================================
-- 1. Replace the trigger function and re-attach.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ensure_product_keeps_en_or_fi_translation
  ON product_translations_v2;
DROP FUNCTION IF EXISTS ensure_product_keeps_en_or_fi_translation();

CREATE FUNCTION ensure_product_keeps_at_least_one_translation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Allowed if at least one OTHER row will remain after this delete.
  IF EXISTS (
    SELECT 1 FROM public.product_translations_v2
    WHERE product_id = OLD.product_id
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
    'Each product must keep at least one translation'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION ensure_product_keeps_at_least_one_translation()
  FROM authenticated, anon, public;

CREATE TRIGGER trg_ensure_product_keeps_at_least_one_translation
  BEFORE DELETE ON product_translations_v2
  FOR EACH ROW
  EXECUTE FUNCTION ensure_product_keeps_at_least_one_translation();

-- =============================================================================
-- 2. create_product_v2 — drop the en/fi-must-exist check.
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
BEGIN
  IF (SELECT public.get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can create products'
      USING ERRCODE = '42501';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
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

-- =============================================================================
-- 3. update_product_v2 — drop the en/fi-must-exist check.
-- =============================================================================

CREATE OR REPLACE FUNCTION update_product_v2(
  p_id                    UUID,
  p_billing_mode          billing_mode_v2,
  p_translations          JSONB,
  p_topic_id              UUID,
  p_min_age               INTEGER,
  p_max_age               INTEGER,
  p_spoken_language_code  TEXT,
  p_is_remote             BOOLEAN,
  p_timezone              TEXT,
  p_registration_opens_at TIMESTAMPTZ,
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
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_locales       TEXT[];
BEGIN
  IF (SELECT public.get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can update products'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products_v2 WHERE id = p_id) THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Parent row update. status / product_type / created_by / created_at
  -- are deliberately untouched. updated_at flips via the existing trigger.
  UPDATE public.products_v2 SET
    billing_mode          = p_billing_mode,
    topic_id              = p_topic_id,
    min_age               = p_min_age,
    max_age               = p_max_age,
    spoken_language_code  = p_spoken_language_code,
    image_path            = p_image_path,
    padlet_url            = p_padlet_url,
    location_id           = p_location_id,
    is_remote             = p_is_remote,
    signup_threshold      = p_signup_threshold,
    start_date            = p_start_date,
    end_date              = p_end_date,
    timezone              = p_timezone,
    seat_count            = p_seat_count,
    waitlist_enabled      = p_waitlist_enabled,
    registration_opens_at = p_registration_opens_at,
    refund_policy_days    = p_refund_policy_days,
    is_visible            = p_is_visible
  WHERE id = p_id;

  -- ============================================================
  -- product_translations_v2 — UPSERT new set, then DELETE leftovers.
  -- The trigger guards "≥1 row remains"; the upsert puts the new rows
  -- in place before any delete fires, so leftover deletes never trip
  -- the check.
  -- ============================================================

  v_locales := ARRAY[]::TEXT[];

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations_v2 (
      product_id, locale, name, description
    )
    VALUES (
      p_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'description', '')
    )
    ON CONFLICT (product_id, locale) DO UPDATE SET
      name        = EXCLUDED.name,
      description = EXCLUDED.description,
      updated_at  = NOW();

    v_locales := array_append(v_locales, v_translation->>'locale');
  END LOOP;

  DELETE FROM public.product_translations_v2
  WHERE product_id = p_id
    AND locale <> ALL (v_locales);

  -- ============================================================
  -- schedule_slots_v2 — wipe and replace.
  -- ============================================================

  DELETE FROM public.schedule_slots_v2 WHERE product_id = p_id;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots_v2 (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        p_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  -- ============================================================
  -- product_tags_v2 — wipe and replace.
  -- ============================================================

  DELETE FROM public.product_tags_v2 WHERE product_id = p_id;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.product_tags_v2 (product_id, tag_id)
    SELECT p_id, unnest(p_tag_ids);
  END IF;

  -- ============================================================
  -- product_prices_v2 — wipe and replace.
  -- ============================================================

  DELETE FROM public.product_prices_v2 WHERE product_id = p_id;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices_v2 (
        product_id, currency, price_per_session, price_per_month
      )
      VALUES (
        p_id,
        v_price->>'currency',
        (v_price->>'price_per_session')::INTEGER,
        (v_price->>'price_per_month')::INTEGER
      );
    END LOOP;
  END IF;

  -- ============================================================
  -- product_holiday_calendars_v2 — wipe and replace.
  -- ============================================================

  DELETE FROM public.product_holiday_calendars_v2 WHERE product_id = p_id;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars_v2 (product_id, calendar_id)
    SELECT p_id, unnest(p_holiday_calendar_ids);
  END IF;

  RETURN p_id;
END;
$$;
