--
-- Name: create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, public.delivery_mode, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[], public.voice_room_mode, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_delivery_mode public.delivery_mode, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false, p_invoice_customer_id uuid DEFAULT NULL::uuid, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_voice_room_mode public.voice_room_mode DEFAULT 'sogverse'::public.voice_room_mode, p_external_voice_url text DEFAULT NULL::text) RETURNS uuid
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

  -- image_path is absent from this INSERT on purpose: a product's
  -- picture is the catalogue entry it points at, the route writes image_id in
  -- its own statement after this one, and the trigger on products derives the
  -- served path from it.
  INSERT INTO public.products (
    product_type, billing_mode, topic,
    min_age, max_age, spoken_language_code,
    location_id, delivery_mode,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents,
    for_gamers, for_parents, tag, region_lock_country,
    requires_gamer_creations, invoice_customer_id,
    voice_room_mode, external_voice_url
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code,
    p_location_id, p_delivery_mode,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents,
    p_for_gamers, p_for_parents, p_tag, p_region_lock_country,
    -- NOT coalesced: the column is NOT NULL, so an explicit null is refused
    -- loudly rather than silently becoming false.
    p_requires_gamer_creations,
    -- The Fennoa customer. Null is the ordinary state and the CHECK
    -- refuses one on any product that is not a municipality club.
    p_invoice_customer_id,
    -- How the sessions are joined. Written as given: the CHECKs on products
    -- refuse a link on any mode but external, and anything but a Sogverse
    -- room on a product that is not online.
    p_voice_room_mode, p_external_voice_url
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
      product_id, locale, name, short_description, long_description,
      voice_join_instructions
    )
    VALUES (
      v_product_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      v_translation->>'long_description',
      v_translation->>'voice_join_instructions'
    );
  END LOOP;

  -- The join instructions are written per locale on the translations,
  -- and belong to the no-room mode alone. A rule across two tables cannot
  -- be a CHECK, so it is enforced here, once the translations are in
  -- place: no room needs instructions in at least one language, and any
  -- other mode carries none.
  IF p_voice_room_mode = 'none' AND NOT EXISTS (
    SELECT 1 FROM public.product_translations
     WHERE product_id = v_product_id
       AND voice_join_instructions IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A product with no voice room needs join instructions in at least one language'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_voice_room_mode <> 'none' AND EXISTS (
    SELECT 1 FROM public.product_translations
     WHERE product_id = v_product_id
       AND voice_join_instructions IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Join instructions belong only to a product with no voice room'
      USING ERRCODE = 'check_violation';
  END IF;

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

  -- The enrolment conditions. Delegated rather than written inline
  -- because this function is SECURITY INVOKER and product_required_consents
  -- carries no write grant for `authenticated` — the guarded DEFINER writer is
  -- what makes that possible. Unconditional: NULL means "requires nothing",
  -- which on a create is the same as doing nothing, and calling it anyway keeps
  -- this function and update_product reading identically.
  PERFORM public.set_product_required_consents(v_product_id, p_required_consent_slugs);

  -- The holiday calendars the club follows, through that join table's single
  -- guarded writer for the reason the consents above go through theirs. NULL
  -- follows none; a non-empty set on a camp or an event is refused there.
  PERFORM public.set_product_holiday_calendars(v_product_id, p_holiday_calendar_ids);

  RETURN v_product_id;
END;
$$;


--
-- Name: FUNCTION create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_delivery_mode public.delivery_mode, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid, p_holiday_calendar_ids uuid[], p_voice_room_mode public.voice_room_mode, p_external_voice_url text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_delivery_mode public.delivery_mode, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid, p_holiday_calendar_ids uuid[], p_voice_room_mode public.voice_room_mode, p_external_voice_url text) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, the staff-only material link and the consent documents enrolling on it requires. It takes NO status: a product''s lifecycle is derived from its dates, so there is nothing for a creating caller to choose and nothing stored for a later reader to mistake for a fact. p_start_date is defaulted like every other optional argument, but the column behind it is NOT NULL — an omitting caller is refused by the column rather than creating a product with no day it begins. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. p_required_consent_slugs is defaulted on the same argument and is NOT written inline: this function is SECURITY INVOKER and product_required_consents carries no write grant, so the row goes through set_product_required_consents, the join table''s single guarded writer. p_requires_gamer_creations is defaulted to FALSE rather than to null, because the column is NOT NULL and false is the resting state of that whole feature — so an omitting caller creates an unflagged product, which is what omission should mean, and an explicit null is refused loudly by the column rather than silently becoming false. p_invoice_customer_id is defaulted on the same argument as p_tag — null is legal, nothing backstops its absence, and codegen cannot express an explicit null — and names the FENNOA CUSTOMER a municipality club is invoiced to; it is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type. This function does NOT take a picture: a product''s picture is the catalogue_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. p_spoken_language_code is public.spoken_language, an enum rather than a text key into a reference table. p_holiday_calendar_ids names the holiday calendars a club follows and is NOT written inline either: it goes through set_product_holiday_calendars, product_holiday_calendars'' single guarded writer, which refuses a non-empty set on a product that is not a club. NULL, the default, follows none. p_voice_room_mode and p_external_voice_url say how an online product''s sessions are joined: a Sogverse voice room (the default), an outside link, or no room at all, in which case each translation may carry voice_join_instructions. The CHECKs on products refuse a link on any mode but external and anything but a Sogverse room on a product that is not online; the rule that crosses into the translations is this function''s own, enforced after they are written: mode none needs instructions in at least one translation, and instructions on any translation need mode none. p_voice_room_mode defaults to ''sogverse'' for the reason p_requires_gamer_creations defaults to false: the column is NOT NULL and that is its resting state. p_delivery_mode — online, in_person or hybrid — is non-defaulted on purpose, like the audience: there is no resting state to fall back on, so an admin always chooses it. A product that is not online needs a site location, and only an online one may leave the Sogverse room, both enforced by the CHECKs and validate_products_location rather than here.';


--
-- Name: FUNCTION create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_delivery_mode public.delivery_mode, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid, p_holiday_calendar_ids uuid[], p_voice_room_mode public.voice_room_mode, p_external_voice_url text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_delivery_mode public.delivery_mode, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid, p_holiday_calendar_ids uuid[], p_voice_room_mode public.voice_room_mode, p_external_voice_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_delivery_mode public.delivery_mode, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid, p_holiday_calendar_ids uuid[], p_voice_room_mode public.voice_room_mode, p_external_voice_url text) TO authenticated;
GRANT ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_delivery_mode public.delivery_mode, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid, p_holiday_calendar_ids uuid[], p_voice_room_mode public.voice_room_mode, p_external_voice_url text) TO service_role;


