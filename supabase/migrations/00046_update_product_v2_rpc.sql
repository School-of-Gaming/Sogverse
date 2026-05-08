-- update_product_v2() — atomic multi-table update for products_v2.
--
-- Sibling of create_product_v2(). Wipe-and-replaces every child set
-- (translations, schedule_slots, prices, tags, holiday_calendars) inside
-- one transaction so an edit never leaves a half-updated product. Image
-- bytes live in Supabase Storage and are managed by the API route around
-- this RPC (upload-before, cleanup-after) — same orphan-avoidance pattern
-- as the legacy update-product route.
--
-- Excluded vs create:
--   p_product_type   immutable; the type is locked by the URL the admin
--                    navigated to, and changing it would invalidate
--                    type-specific config (schedule shape, billing).
--   p_status         admin-driven status is preserved as-is. Effective
--                    status is *derived* at read time from fields this
--                    RPC does edit (start_date, end_date, …), so the
--                    displayed state moves naturally without touching
--                    the stored column. Future "Cancel product" / "Save
--                    as draft" actions will set status via a different
--                    path.
--   p_created_by     immutable provenance.
--
-- Translation BEFORE-DELETE trigger interplay: a plain
-- DELETE-then-INSERT of product_translations_v2 would trip the trigger
-- on the last en/fi row. Instead we UPSERT the new set first (so any
-- new en/fi rows are already in place), then DELETE leftovers — the
-- trigger's "another en/fi row remains?" check passes for every leftover
-- row because the new set is already present.
--
-- See docs/products-v2-architecture.md.

CREATE FUNCTION update_product_v2(
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
  v_has_en_or_fi  BOOLEAN := false;
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

  -- Translations: must have at least one entry, and must include en or fi.
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
  -- See header comment for why this order matters (BEFORE-DELETE trigger).
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
  -- schedule_slots_v2 — wipe and replace. No trigger constraints.
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

REVOKE EXECUTE ON FUNCTION update_product_v2(
  UUID, billing_mode_v2, JSONB, UUID, INTEGER, INTEGER, TEXT, BOOLEAN, TEXT,
  TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT, TEXT, UUID, INTEGER, DATE, DATE,
  INTEGER, INTEGER, JSONB, UUID[], JSONB, UUID[]
) FROM public, anon;

GRANT EXECUTE ON FUNCTION update_product_v2(
  UUID, billing_mode_v2, JSONB, UUID, INTEGER, INTEGER, TEXT, BOOLEAN, TEXT,
  TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT, TEXT, UUID, INTEGER, DATE, DATE,
  INTEGER, INTEGER, JSONB, UUID[], JSONB, UUID[]
) TO authenticated;
