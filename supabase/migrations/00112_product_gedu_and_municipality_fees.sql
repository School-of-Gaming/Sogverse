-- Per-session fee fields on products.
--
-- WHY. Each product carries operating fees the platform tracks separately from
-- the price parents pay:
--   * primary_gedu_fee_cents   — what we pay the lead game educator per session
--   * assistant_gedu_fee_cents — what we pay an assistant educator per session
--   * municipality_fee_cents   — what a municipality pays us per session
--                                (municipality clubs only)
--
-- All three are a single EUR amount stored as integer cents, mirroring
-- product_prices.price_cents. They are nullable because an admin may not know
-- the figure when the product is first created.
--
-- STATE IS DERIVED FROM THE VALUE — there is no separate status column. The UI
-- forces the admin to choose a state explicitly (a select, never an empty box
-- or a typed 0); the DB just stores the compact result:
--   NULL  → "unknown" (gedu/municipality)  /  "none" (assistant)
--   0     → "volunteer" (free) — gedu fees only
--   > 0   → a real fee
-- The admin product list alerts on a NULL primary gedu fee (always) and a NULL
-- municipality fee (municipality clubs only). The assistant fee never alerts.
--
-- The municipality fee cannot be 0 (a municipality always pays) and is
-- meaningless on non-municipality products, so its CHECKs are tighter than the
-- gedu fees': > 0 when present, and NULL unless product_type is
-- 'municipality_club'.

ALTER TABLE public.products
  ADD COLUMN primary_gedu_fee_cents   integer,
  ADD COLUMN assistant_gedu_fee_cents integer,
  ADD COLUMN municipality_fee_cents   integer;

ALTER TABLE public.products
  -- Gedu fees: NULL (unknown / none) or >= 0 (0 = volunteer).
  ADD CONSTRAINT products_primary_gedu_fee_cents_check
    CHECK (primary_gedu_fee_cents IS NULL OR primary_gedu_fee_cents >= 0),
  ADD CONSTRAINT products_assistant_gedu_fee_cents_check
    CHECK (assistant_gedu_fee_cents IS NULL OR assistant_gedu_fee_cents >= 0),
  -- Municipality fee: NULL (unknown) or > 0 — never 0 (a municipality always
  -- pays).
  ADD CONSTRAINT products_municipality_fee_cents_check
    CHECK (municipality_fee_cents IS NULL OR municipality_fee_cents > 0),
  -- ...and it only applies to municipality clubs; any other product type must
  -- leave it NULL.
  ADD CONSTRAINT chk_products_municipality_fee_only_for_muni
    CHECK (
      municipality_fee_cents IS NULL
      OR product_type = 'municipality_club'::public.product_type
    );

-- create_product / update_product write the products row directly, so both gain
-- the three new params. Adding parameters changes the signature, so CREATE OR
-- REPLACE would create a second overload — DROP the old signatures first, then
-- recreate and re-GRANT (DROP drops the grants). Bodies copied from the current
-- schema.sql with the three new columns threaded through the INSERT / UPDATE.

DROP FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, text, uuid, integer, date,
  date, integer, integer, jsonb, jsonb, uuid[]
);

CREATE FUNCTION public.create_product(
  p_product_type            public.product_type,
  p_billing_mode            public.billing_mode,
  p_translations            jsonb,
  p_topic                   public.product_topic,
  p_min_age                 integer,
  p_max_age                 integer,
  p_spoken_language_code    text,
  p_is_remote               boolean,
  p_timezone                text,
  p_registration_opens_at   timestamp with time zone,
  p_status                  public.product_status DEFAULT 'draft'::public.product_status,
  p_is_visible              boolean        DEFAULT false,
  p_waitlist_enabled        boolean        DEFAULT true,
  p_image_path              text           DEFAULT NULL,
  p_padlet_url              text           DEFAULT NULL,
  p_location_id             uuid           DEFAULT NULL,
  p_signup_threshold        integer        DEFAULT NULL,
  p_start_date              date           DEFAULT NULL,
  p_end_date                date           DEFAULT NULL,
  p_seat_count              integer        DEFAULT NULL,
  p_refund_policy_days      integer        DEFAULT NULL,
  p_schedule_slots          jsonb          DEFAULT NULL,
  p_prices                  jsonb          DEFAULT NULL,
  p_holiday_calendar_ids    uuid[]         DEFAULT NULL,
  p_primary_gedu_fee_cents   integer       DEFAULT NULL,
  p_assistant_gedu_fee_cents integer       DEFAULT NULL,
  p_municipality_fee_cents   integer       DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $function$
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

  INSERT INTO public.products (
    product_type, billing_mode, topic,
    min_age, max_age, spoken_language_code, image_path, padlet_url,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    refund_policy_days, is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path, p_padlet_url,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_refund_policy_days, p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents
  )
  RETURNING id INTO v_product_id;

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      v_product_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      NULLIF(v_translation->'long_description', 'null'::jsonb)
    );
  END LOOP;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
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

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_cents
      )
      VALUES (
        v_product_id,
        v_price->>'currency',
        (v_price->>'price_cents')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT v_product_id, unnest(p_holiday_calendar_ids);
  END IF;

  RETURN v_product_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, text, uuid, integer, date,
  date, integer, integer, jsonb, jsonb, uuid[], integer, integer, integer
) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, text, uuid, integer, date,
  date, integer, integer, jsonb, jsonb, uuid[], integer, integer, integer
) TO authenticated;
GRANT ALL ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, text, uuid, integer, date,
  date, integer, integer, jsonb, jsonb, uuid[], integer, integer, integer
) TO service_role;

DROP FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic, integer, integer,
  text, boolean, text, timestamp with time zone, boolean, boolean, text, text,
  uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[]
);

CREATE FUNCTION public.update_product(
  p_id                      uuid,
  p_billing_mode            public.billing_mode,
  p_translations            jsonb,
  p_topic                   public.product_topic,
  p_min_age                 integer,
  p_max_age                 integer,
  p_spoken_language_code    text,
  p_is_remote               boolean,
  p_timezone                text,
  p_registration_opens_at   timestamp with time zone,
  p_is_visible              boolean        DEFAULT false,
  p_waitlist_enabled        boolean        DEFAULT true,
  p_image_path              text           DEFAULT NULL,
  p_padlet_url              text           DEFAULT NULL,
  p_location_id             uuid           DEFAULT NULL,
  p_signup_threshold        integer        DEFAULT NULL,
  p_start_date              date           DEFAULT NULL,
  p_end_date                date           DEFAULT NULL,
  p_seat_count              integer        DEFAULT NULL,
  p_refund_policy_days      integer        DEFAULT NULL,
  p_schedule_slots          jsonb          DEFAULT NULL,
  p_prices                  jsonb          DEFAULT NULL,
  p_holiday_calendar_ids    uuid[]         DEFAULT NULL,
  p_primary_gedu_fee_cents   integer       DEFAULT NULL,
  p_assistant_gedu_fee_cents integer       DEFAULT NULL,
  p_municipality_fee_cents   integer       DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $function$
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

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_id) THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.products SET
    billing_mode             = p_billing_mode,
    topic                    = p_topic,
    min_age                  = p_min_age,
    max_age                  = p_max_age,
    spoken_language_code     = p_spoken_language_code,
    image_path               = p_image_path,
    padlet_url               = p_padlet_url,
    location_id              = p_location_id,
    is_remote                = p_is_remote,
    signup_threshold         = p_signup_threshold,
    start_date               = p_start_date,
    end_date                 = p_end_date,
    timezone                 = p_timezone,
    seat_count               = p_seat_count,
    waitlist_enabled         = p_waitlist_enabled,
    registration_opens_at    = p_registration_opens_at,
    refund_policy_days       = p_refund_policy_days,
    is_visible               = p_is_visible,
    primary_gedu_fee_cents   = p_primary_gedu_fee_cents,
    assistant_gedu_fee_cents = p_assistant_gedu_fee_cents,
    municipality_fee_cents   = p_municipality_fee_cents
  WHERE id = p_id;

  -- product_translations — UPSERT new set, then DELETE leftovers (the
  -- "≥1 row remains" trigger passes because the new rows are already in
  -- place before any delete fires).
  v_locales := ARRAY[]::TEXT[];

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      p_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      NULLIF(v_translation->'long_description', 'null'::jsonb)
    )
    ON CONFLICT (product_id, locale) DO UPDATE SET
      name              = EXCLUDED.name,
      short_description = EXCLUDED.short_description,
      long_description  = EXCLUDED.long_description,
      updated_at        = NOW();

    v_locales := array_append(v_locales, v_translation->>'locale');
  END LOOP;

  DELETE FROM public.product_translations
  WHERE product_id = p_id
    AND locale <> ALL (v_locales);

  -- schedule_slots — wipe and replace.
  DELETE FROM public.schedule_slots WHERE product_id = p_id;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
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

  -- product_prices — wipe and replace.
  DELETE FROM public.product_prices WHERE product_id = p_id;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_cents
      )
      VALUES (
        p_id,
        v_price->>'currency',
        (v_price->>'price_cents')::INTEGER
      );
    END LOOP;
  END IF;

  -- product_holiday_calendars — wipe and replace.
  DELETE FROM public.product_holiday_calendars WHERE product_id = p_id;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT p_id, unnest(p_holiday_calendar_ids);
  END IF;

  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic, integer, integer,
  text, boolean, text, timestamp with time zone, boolean, boolean, text, text,
  uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[],
  integer, integer, integer
) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic, integer, integer,
  text, boolean, text, timestamp with time zone, boolean, boolean, text, text,
  uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[],
  integer, integer, integer
) TO authenticated;
GRANT ALL ON FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic, integer, integer,
  text, boolean, text, timestamp with time zone, boolean, boolean, text, text,
  uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[],
  integer, integer, integer
) TO service_role;
