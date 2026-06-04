-- Simplify the product "topic" into a fixed enum, and drop "tags" entirely.
--
-- Two product-domain simplifications land together here:
--
--   1. TAGS GONE. The tags / product_tags / tag_translations triad (the shop
--      "Vibe" filter) is removed wholesale — unused in the current product,
--      cheaper to re-add later than to carry. RLS policies, triggers, and the
--      products.topic_id-independent FKs drop with the tables.
--
--   2. TOPIC IS NOW A FIXED ENUM. Previously a dynamic `topics` table (admins
--      could create arbitrary rows, kind = game|subject, locale-keyed names in
--      topic_translations). We replace it with a closed enum on products:
--        product_topic = { minecraft, fortnite, webinar }
--      Minecraft / Fortnite are games (brand proper nouns, never translated);
--      Webinar is a subject (localized in the next-intl message files, not the
--      DB). The game/subject split stays meaningful but lives in code now (see
--      src/lib/products/topics.ts) — there's no kind column to store because
--      it's a pure function of the enum value.
--
--      Modeling it as a Postgres enum gives DB-level protection (no invalid
--      topic can be inserted) AND a type-safe union in the generated TS, so
--      future per-topic logic (e.g. "Minecraft signups require a Java
--      username, Fortnite an Epic account") gets compiler-enforced exhaustive
--      handling.
--
-- The create_product / update_product RPCs are re-issued with p_topic_id (uuid)
-- replaced by p_topic (product_topic) and the p_tag_ids arg + product_tags
-- writes removed. Signature change ⇒ DROP + CREATE (defaults/arg-types can't be
-- altered in place), then REVOKE/GRANT re-applied.

-- ============================================================
-- 1. The enum
-- ============================================================
CREATE TYPE public.product_topic AS ENUM ('minecraft', 'fortnite', 'webinar');

-- ============================================================
-- 2. products.topic — add, backfill from the old topic slug, lock NOT NULL.
--    topic_id is NOT NULL with an ON DELETE RESTRICT FK to topics, so every
--    product has exactly one topic row to map. Slugs other than the two games
--    collapse to 'webinar' (the only subject value we keep).
-- ============================================================
ALTER TABLE public.products ADD COLUMN topic public.product_topic;

UPDATE public.products p
SET topic = CASE t.slug
  WHEN 'minecraft' THEN 'minecraft'::public.product_topic
  WHEN 'fortnite'  THEN 'fortnite'::public.product_topic
  ELSE 'webinar'::public.product_topic
END
FROM public.topics t
WHERE p.topic_id = t.id;

-- Defensive: any row the JOIN somehow missed (shouldn't happen given the
-- NOT NULL FK) lands on the safe subject default.
UPDATE public.products SET topic = 'webinar' WHERE topic IS NULL;

ALTER TABLE public.products ALTER COLUMN topic SET NOT NULL;

-- ============================================================
-- 3. Drop the RPCs that reference topic_id / product_tags (recreated below).
-- ============================================================
DROP FUNCTION IF EXISTS public.create_product(
  product_type, billing_mode, jsonb, uuid, integer, integer, text, boolean,
  text, timestamptz, product_status, boolean, boolean, text, text, uuid,
  integer, date, date, integer, integer, jsonb, uuid[], jsonb, uuid[]
);
DROP FUNCTION IF EXISTS public.update_product(
  uuid, billing_mode, jsonb, uuid, integer, integer, text, boolean, text,
  timestamptz, boolean, boolean, text, text, uuid, integer, date, date,
  integer, integer, jsonb, uuid[], jsonb, uuid[]
);

-- ============================================================
-- 4. Drop the old topic_id column. This drops products_topic_id_fkey and the
--    index idx_products_topic (which was on topic_id, renamed from
--    idx_products_v2_topic in 00072), freeing the name for the new column.
-- ============================================================
ALTER TABLE public.products DROP COLUMN topic_id;
CREATE INDEX idx_products_topic ON public.products (topic);

-- ============================================================
-- 5. Drop the tag + topic reference tables. RLS policies and triggers on each
--    drop with the table. Order respects FKs (children before parents);
--    CASCADE is belt-and-suspenders.
-- ============================================================
DROP TABLE IF EXISTS public.product_tags CASCADE;
DROP TABLE IF EXISTS public.tag_translations CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;
DROP TABLE IF EXISTS public.topic_translations CASCADE;
DROP TABLE IF EXISTS public.topics CASCADE;

-- topic_kind was only ever the type of topics.kind, now gone.
DROP TYPE IF EXISTS public.topic_kind;

-- ============================================================
-- 6. Recreate create_product — p_topic_id (uuid) → p_topic (product_topic),
--    p_tag_ids + product_tags writes removed. Body otherwise unchanged from
--    the canonical definition (migration 00072).
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
-- 7. Recreate update_product — same swap (p_topic_id → p_topic, p_tag_ids +
--    product_tags wipe-and-replace removed). Body otherwise unchanged from
--    the canonical definition (migration 00072).
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
