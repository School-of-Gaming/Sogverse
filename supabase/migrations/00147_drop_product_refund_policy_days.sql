-- Removes `products.refund_policy_days` — the column, its CHECK constraints, and
-- the `p_refund_policy_days` parameter on both product-authoring RPCs.
--
-- WHY
--
-- The field promised a self-service refund window on single-payment products
-- (camps and events) that the platform never learned to honour. Nothing was ever
-- built to act on the number: no cancellation path consults it, no job expires
-- against it, and refunds are issued by hand in the Stripe dashboard. It was
-- read in exactly one place — a bullet on the purchase confirmation page telling
-- a parent they had N days to change their mind — which is the worst possible
-- shape for a value nothing enforces: a promise to a paying customer backed by
-- no mechanism.
--
-- It was also unreachable in practice. The admin product form never collected
-- it, and `update_product` defaults every editable column it is not sent, so any
-- value that did arrive was wiped by the next edit of that product. Across the
-- whole staging dataset one row out of eighty-four carried a value, and it had
-- survived only by never being edited. So the column's real behaviour was
-- "silently forgets whatever you put in it", and the confirmation bullet fired
-- for essentially no one.
--
-- Stripe remains the system of record for refunds — the same conclusion that
-- retired the `refunds` ledger in 00145. Refund policy lives in the terms
-- families agree to, and issuing one is a manual admin action. When the platform
-- is ready to automate a window, the column comes back alongside the machinery
-- that honours it, rather than years ahead of it.
--
-- SCOPE
--
-- Dropping the column takes both of its CHECK constraints with it
-- (`chk_products_refund_policy_only_for_single_payment`, which confined it to
-- camps and events, and `products_refund_policy_days_check`, the `>= 0` bound).
-- Nothing else references it: no index, no view, no other function body, no
-- foreign key.
--
-- The two RPCs must be dropped and recreated rather than replaced: removing a
-- parameter changes the function's identity, so `CREATE OR REPLACE` would leave
-- the old overload in place alongside the new one and make every call
-- ambiguous. The bodies below are copied from the current `supabase/schema.sql`
-- with only the parameter, the INSERT column/value pair, and the UPDATE
-- assignment removed. Dropping a function also drops its ACL, so the grants at
-- the end restore the posture the old signatures had exactly: revoked from
-- PUBLIC, executable by `authenticated` and `service_role`. Both remain SECURITY
-- INVOKER with an `assert_admin()` guard as their first statement, so the
-- `authenticated` grant is gated by the guard, not by the grant.

-- ---------------------------------------------------------------------------
-- 1. Drop the old signatures
-- ---------------------------------------------------------------------------
--
-- Spelled out in full so this fails loudly if the live signature has drifted
-- from what this migration was written against, rather than dropping some other
-- overload that happens to share the name.

DROP FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, text, uuid, integer,
  date, date, integer, integer, jsonb, jsonb, uuid[], integer, integer,
  integer, text
);

DROP FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  boolean, boolean, text, text, uuid, integer,
  date, date, integer, integer, jsonb, jsonb, uuid[], integer, integer,
  integer, text
);

-- ---------------------------------------------------------------------------
-- 2. Drop the column
-- ---------------------------------------------------------------------------
--
-- No CASCADE, deliberately: the two CHECK constraints on the column go with it
-- automatically, and anything *else* that turns out to depend on it should stop
-- this migration rather than be quietly deleted by it.

ALTER TABLE public.products DROP COLUMN refund_policy_days;

-- ---------------------------------------------------------------------------
-- 3. Recreate create_product without the parameter
-- ---------------------------------------------------------------------------

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
  p_registration_opens_at   timestamptz,
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
  p_schedule_slots          jsonb          DEFAULT NULL,
  p_prices                  jsonb          DEFAULT NULL,
  p_holiday_calendar_ids    uuid[]         DEFAULT NULL,
  p_primary_gedu_fee_cents  integer        DEFAULT NULL,
  p_assistant_gedu_fee_cents integer       DEFAULT NULL,
  p_municipality_fee_cents  integer        DEFAULT NULL,
  p_material_url            text           DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
AS $$
DECLARE
  v_product_id    UUID;
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_material_url  TEXT := NULLIF(btrim(COALESCE(p_material_url, '')), '');
BEGIN
  PERFORM public.assert_admin();

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
    is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path, p_padlet_url,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents
  )
  RETURNING id INTO v_product_id;

  -- Staff-only, so it lands in its own table. No row when there is no link.
  IF v_material_url IS NOT NULL THEN
    INSERT INTO public.product_staff_details (product_id, material_url)
    VALUES (v_product_id, v_material_url);
  END IF;

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
$$;

-- ---------------------------------------------------------------------------
-- 4. Recreate update_product without the parameter
-- ---------------------------------------------------------------------------

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
  p_registration_opens_at   timestamptz,
  p_is_visible              boolean        DEFAULT false,
  p_waitlist_enabled        boolean        DEFAULT true,
  p_image_path              text           DEFAULT NULL,
  p_padlet_url              text           DEFAULT NULL,
  p_location_id             uuid           DEFAULT NULL,
  p_signup_threshold        integer        DEFAULT NULL,
  p_start_date              date           DEFAULT NULL,
  p_end_date                date           DEFAULT NULL,
  p_seat_count              integer        DEFAULT NULL,
  p_schedule_slots          jsonb          DEFAULT NULL,
  p_prices                  jsonb          DEFAULT NULL,
  p_holiday_calendar_ids    uuid[]         DEFAULT NULL,
  p_primary_gedu_fee_cents  integer        DEFAULT NULL,
  p_assistant_gedu_fee_cents integer       DEFAULT NULL,
  p_municipality_fee_cents  integer        DEFAULT NULL,
  p_material_url            text           DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
AS $$
DECLARE
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_locales       TEXT[];
  v_material_url  TEXT := NULLIF(btrim(COALESCE(p_material_url, '')), '');
BEGIN
  PERFORM public.assert_admin();

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
    is_visible               = p_is_visible,
    primary_gedu_fee_cents   = p_primary_gedu_fee_cents,
    assistant_gedu_fee_cents = p_assistant_gedu_fee_cents,
    municipality_fee_cents   = p_municipality_fee_cents
  WHERE id = p_id;

  -- Cleared means the row goes, so "no lesson material" stays the absence of a
  -- record rather than becoming a row holding NULL.
  IF v_material_url IS NULL THEN
    DELETE FROM public.product_staff_details WHERE product_id = p_id;
  ELSE
    INSERT INTO public.product_staff_details (product_id, material_url)
    VALUES (p_id, v_material_url)
    ON CONFLICT (product_id) DO UPDATE
      SET material_url = EXCLUDED.material_url;
  END IF;

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
$$;

-- ---------------------------------------------------------------------------
-- 5. Restore the grant posture the dropped signatures had
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamptz,
  public.product_status, boolean, boolean, text, text, uuid, integer,
  date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamptz,
  public.product_status, boolean, boolean, text, text, uuid, integer,
  date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamptz,
  public.product_status, boolean, boolean, text, text, uuid, integer,
  date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) TO service_role;

REVOKE ALL ON FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamptz,
  boolean, boolean, text, text, uuid, integer,
  date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamptz,
  boolean, boolean, text, text, uuid, integer,
  date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamptz,
  boolean, boolean, text, text, uuid, integer,
  date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Assert the end state
-- ---------------------------------------------------------------------------
--
-- Three things have to be true together, and each can fail without the others
-- noticing: the column is gone, exactly one overload of each RPC survives, and
-- neither of the survivors still takes the parameter. A leftover overload is the
-- specific hazard of dropping-and-recreating by signature — PostgreSQL would
-- happily keep both and answer every call with "function is not unique".

DO $$
DECLARE
  v_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'products'
       AND column_name = 'refund_policy_days'
  ) THEN
    RAISE EXCEPTION 'public.products.refund_policy_days is still present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.products'::regclass
       AND conname IN (
         'chk_products_refund_policy_only_for_single_payment',
         'products_refund_policy_days_check'
       )
  ) THEN
    RAISE EXCEPTION 'a refund-policy CHECK constraint survived the column drop';
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_product', 'update_product');

  IF v_count <> 2 THEN
    RAISE EXCEPTION
      'expected exactly one create_product and one update_product, found % overloads total',
      v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('create_product', 'update_product')
       AND 'p_refund_policy_days' = ANY (p.proargnames)
  ) THEN
    RAISE EXCEPTION 'a product RPC still takes p_refund_policy_days';
  END IF;
END;
$$;
