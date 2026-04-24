-- create_product_v2() — atomic multi-table insert for products_v2.
--
-- A product create touches up to 5 tables (products_v2, schedule_slots_v2,
-- product_tags_v2, product_prices_v2, product_holiday_calendars_v2). Doing
-- those as sequential browser writes would leak partial rows on failure, so
-- the admin UI funnels through this RPC — same pattern as
-- commit_group_changes() for groups (see docs/groups-architecture.md).
--
-- SECURITY INVOKER: RLS on each table already restricts writes to admins
-- via admin_full_access_* policies. The explicit role check at the top is
-- belt-and-suspenders so non-admin callers fail with a clean message
-- before any row touches the DB.

CREATE OR REPLACE FUNCTION create_product_v2(
  p_product_type          product_type_v2,
  p_billing_mode          billing_mode_v2,
  p_name                  TEXT,
  p_description           TEXT,
  p_topic_id              UUID,
  p_min_age               INTEGER,
  p_max_age               INTEGER,
  p_spoken_language_code  TEXT,
  p_image_path            TEXT,
  p_padlet_url            TEXT,
  p_location_id           UUID,
  p_is_remote             BOOLEAN,
  p_status                product_status_v2,
  p_signup_threshold      INTEGER,
  p_start_date            DATE,
  p_end_date              DATE,
  p_timezone              TEXT,
  p_seat_count            INTEGER,
  p_waitlist_enabled      BOOLEAN,
  p_registration_opens_at TIMESTAMPTZ,
  p_refund_policy_days    INTEGER,
  p_is_visible            BOOLEAN,
  p_schedule_slots        JSONB,
  p_tag_ids               UUID[],
  p_prices                JSONB,
  p_holiday_calendar_ids  UUID[]
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
  TEXT, TEXT, UUID, BOOLEAN, product_status_v2, INTEGER, DATE, DATE, TEXT,
  INTEGER, BOOLEAN, TIMESTAMPTZ, INTEGER, BOOLEAN, JSONB, UUID[], JSONB, UUID[]
) FROM public, anon;

GRANT EXECUTE ON FUNCTION create_product_v2(
  product_type_v2, billing_mode_v2, TEXT, TEXT, UUID, INTEGER, INTEGER, TEXT,
  TEXT, TEXT, UUID, BOOLEAN, product_status_v2, INTEGER, DATE, DATE, TEXT,
  INTEGER, BOOLEAN, TIMESTAMPTZ, INTEGER, BOOLEAN, JSONB, UUID[], JSONB, UUID[]
) TO authenticated;
