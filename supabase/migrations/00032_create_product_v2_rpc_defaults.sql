-- create_product_v2() — add DEFAULT NULL on nullable args.
--
-- The original definition in 00031 had no defaults, so the TypeScript type
-- generator marks every arg as required + non-null. The admin UI needs to
-- pass NULL for fields like image_path, start_date, end_date, location_id,
-- etc., so we re-create with DEFAULT NULL on the nullable params — mirrors
-- the shape of adjust_token_balance() and commit_group_changes(), which
-- generate `?`-optional TS args.
--
-- Signature change forces a DROP + CREATE (you can't replace default lists).

DROP FUNCTION IF EXISTS create_product_v2(
  product_type_v2, billing_mode_v2, TEXT, TEXT, UUID, INTEGER, INTEGER, TEXT,
  TEXT, TEXT, UUID, BOOLEAN, product_status_v2, INTEGER, DATE, DATE, TEXT,
  INTEGER, BOOLEAN, TIMESTAMPTZ, INTEGER, BOOLEAN, JSONB, UUID[], JSONB, UUID[]
);

CREATE OR REPLACE FUNCTION create_product_v2(
  p_product_type          product_type_v2,
  p_billing_mode          billing_mode_v2,
  p_name                  TEXT,
  p_description           TEXT,
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
  v_product_id UUID;
  v_slot       JSONB;
  v_price      JSONB;
BEGIN
  IF (SELECT public.get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can create products'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.products_v2 (
    product_type, billing_mode, name, description, topic_id,
    min_age, max_age, spoken_language_code, image_path, padlet_url,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    refund_policy_days, is_visible, created_by
  )
  VALUES (
    p_product_type, p_billing_mode, p_name, p_description, p_topic_id,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path, p_padlet_url,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_refund_policy_days, p_is_visible, auth.uid()
  )
  RETURNING id INTO v_product_id;

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
  product_type_v2, billing_mode_v2, TEXT, TEXT, UUID, INTEGER, INTEGER, TEXT,
  BOOLEAN, TEXT, product_status_v2, BOOLEAN, BOOLEAN, TEXT, TEXT, UUID,
  INTEGER, DATE, DATE, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, UUID[], JSONB, UUID[]
) FROM public, anon;

GRANT EXECUTE ON FUNCTION create_product_v2(
  product_type_v2, billing_mode_v2, TEXT, TEXT, UUID, INTEGER, INTEGER, TEXT,
  BOOLEAN, TEXT, product_status_v2, BOOLEAN, BOOLEAN, TEXT, TEXT, UUID,
  INTEGER, DATE, DATE, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, UUID[], JSONB, UUID[]
) TO authenticated;
