-- Split the single 'minecraft' product topic into three editions.
--
-- WHY. "Minecraft" is no longer one thing in the catalog: Java, Education, and
-- Bedrock are distinct editions with different accounts, clients, and server
-- requirements, and families pick by edition. The closed `product_topic` enum
-- (introduced in 00078) becomes:
--   product_topic = { minecraft_java, minecraft_education, minecraft_bedrock,
--                     fortnite, webinar }
-- 'minecraft' is removed; every existing 'minecraft' product backfills to
-- 'minecraft_java' (the dominant edition and the safe landing spot). fortnite
-- and webinar are untouched. All three Minecraft editions stay "games" (brand
-- proper nouns, never translated) — the game/subject split still lives in code
-- (src/lib/products/topics.ts), not the DB.
--
-- HOW. Postgres can ADD an enum value but cannot REMOVE one, so dropping
-- 'minecraft' means swapping the whole type: rename the old enum aside, create
-- the new one, retype products.topic with a value mapping, then drop the old
-- enum. The create_product / update_product RPCs take `product_topic` as an
-- argument, so they pin the old type's OID and must be dropped before it and
-- recreated against the new one. Their bodies are unchanged from 00078 — only
-- the enum the `p_topic` argument resolves to differs. Done inside the
-- migration's implicit transaction (the rename-swap is transaction-safe, unlike
-- ALTER TYPE ... ADD VALUE).

-- ============================================================
-- 1. Drop the RPCs that pin the old enum type (recreated in step 5/6).
-- ============================================================
DROP FUNCTION IF EXISTS public.create_product(
  product_type, billing_mode, jsonb, product_topic, integer, integer, text,
  boolean, text, timestamptz, product_status, boolean, boolean, text, text,
  uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[]
);
DROP FUNCTION IF EXISTS public.update_product(
  uuid, billing_mode, jsonb, product_topic, integer, integer, text, boolean,
  text, timestamptz, boolean, boolean, text, text, uuid, integer, date, date,
  integer, integer, jsonb, jsonb, uuid[]
);

-- ============================================================
-- 2. Swap the enum: rename old aside, create the new closed set.
-- ============================================================
ALTER TYPE public.product_topic RENAME TO product_topic_old;

CREATE TYPE public.product_topic AS ENUM (
  'minecraft_java',
  'minecraft_education',
  'minecraft_bedrock',
  'fortnite',
  'webinar'
);

-- ============================================================
-- 3. Retype products.topic, mapping the old value to the new set.
--    'minecraft' collapses to 'minecraft_java'; fortnite/webinar pass through.
--    ALTER COLUMN ... TYPE rewrites the table and rebuilds idx_products_topic
--    automatically; NOT NULL is preserved.
-- ============================================================
ALTER TABLE public.products
  ALTER COLUMN topic TYPE public.product_topic
  USING (
    CASE topic::text
      WHEN 'minecraft' THEN 'minecraft_java'
      ELSE topic::text
    END
  )::public.product_topic;

-- ============================================================
-- 4. Drop the now-unreferenced old enum.
-- ============================================================
DROP TYPE public.product_topic_old;

-- ============================================================
-- 5. Recreate create_product against the new enum. Body unchanged from 00078.
-- ============================================================
CREATE FUNCTION public.create_product(
  p_product_type          product_type,
  p_billing_mode          billing_mode,
  p_translations          jsonb,
  p_topic                 product_topic,
  p_min_age               integer,
  p_max_age               integer,
  p_spoken_language_code  text,
  p_is_remote             boolean,
  p_timezone              text,
  p_registration_opens_at timestamptz,
  p_status                product_status DEFAULT 'draft'::product_status,
  p_is_visible            boolean        DEFAULT false,
  p_waitlist_enabled      boolean        DEFAULT true,
  p_image_path            text           DEFAULT NULL,
  p_padlet_url            text           DEFAULT NULL,
  p_location_id           uuid           DEFAULT NULL,
  p_signup_threshold      integer        DEFAULT NULL,
  p_start_date            date           DEFAULT NULL,
  p_end_date              date           DEFAULT NULL,
  p_seat_count            integer        DEFAULT NULL,
  p_refund_policy_days    integer        DEFAULT NULL,
  p_schedule_slots        jsonb          DEFAULT NULL,
  p_prices                jsonb          DEFAULT NULL,
  p_holiday_calendar_ids  uuid[]         DEFAULT NULL
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
    refund_policy_days, is_visible, created_by
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path, p_padlet_url,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_refund_policy_days, p_is_visible, auth.uid()
  )
  RETURNING id INTO v_product_id;

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
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
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT v_product_id, unnest(p_holiday_calendar_ids);
  END IF;

  RETURN v_product_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_product(
  product_type, billing_mode, jsonb, product_topic, integer, integer, text,
  boolean, text, timestamptz, product_status, boolean, boolean, text, text,
  uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[]
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_product(
  product_type, billing_mode, jsonb, product_topic, integer, integer, text,
  boolean, text, timestamptz, product_status, boolean, boolean, text, text,
  uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[]
) TO authenticated;

-- ============================================================
-- 6. Recreate update_product against the new enum. Body unchanged from 00078.
-- ============================================================
CREATE FUNCTION public.update_product(
  p_id                    uuid,
  p_billing_mode          billing_mode,
  p_translations          jsonb,
  p_topic                 product_topic,
  p_min_age               integer,
  p_max_age               integer,
  p_spoken_language_code  text,
  p_is_remote             boolean,
  p_timezone              text,
  p_registration_opens_at timestamptz,
  p_is_visible            boolean        DEFAULT false,
  p_waitlist_enabled      boolean        DEFAULT true,
  p_image_path            text           DEFAULT NULL,
  p_padlet_url            text           DEFAULT NULL,
  p_location_id           uuid           DEFAULT NULL,
  p_signup_threshold      integer        DEFAULT NULL,
  p_start_date            date           DEFAULT NULL,
  p_end_date              date           DEFAULT NULL,
  p_seat_count            integer        DEFAULT NULL,
  p_refund_policy_days    integer        DEFAULT NULL,
  p_schedule_slots        jsonb          DEFAULT NULL,
  p_prices                jsonb          DEFAULT NULL,
  p_holiday_calendar_ids  uuid[]         DEFAULT NULL
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
    billing_mode          = p_billing_mode,
    topic                 = p_topic,
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

  -- product_translations — UPSERT new set, then DELETE leftovers (the
  -- "≥1 row remains" trigger passes because the new rows are already in
  -- place before any delete fires).
  v_locales := ARRAY[]::TEXT[];

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
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

REVOKE EXECUTE ON FUNCTION public.update_product(
  uuid, billing_mode, jsonb, product_topic, integer, integer, text, boolean,
  text, timestamptz, boolean, boolean, text, text, uuid, integer, date, date,
  integer, integer, jsonb, jsonb, uuid[]
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_product(
  uuid, billing_mode, jsonb, product_topic, integer, integer, text, boolean,
  text, timestamptz, boolean, boolean, text, text, uuid, integer, date, date,
  integer, integer, jsonb, jsonb, uuid[]
) TO authenticated;
