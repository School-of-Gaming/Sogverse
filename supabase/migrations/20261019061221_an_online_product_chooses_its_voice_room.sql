-- An online product chooses its voice room.
--
-- Every online product's sessions have been joined through a Sogverse voice
-- room, and a Sogverse room holds at most 50 people. A parent webinar for 100
-- to 300 does not fit, so until a room can hold more an admin defining an
-- online product picks one of three ways in: the Sogverse room (the default,
-- unchanged), a link to a meeting held somewhere else, or no room at all and
-- join instructions written per locale instead. An in-person product always
-- keeps the Sogverse setting, with no link and no instructions.
--
-- The link lives on products and the instructions on product_translations,
-- and anon can read both tables: the link and the instructions are marketed
-- publicly anyway, and the column comments say so.

-- ---------------------------------------------------------------------------
-- 1. The choice
-- ---------------------------------------------------------------------------

CREATE TYPE public.voice_room_mode AS ENUM ('sogverse', 'external', 'none');

COMMENT ON TYPE public.voice_room_mode IS
  'How an online product''s sessions are joined. sogverse: the Sogverse voice '
  'room, opened during each session''s window — the default, and the only value '
  'an in-person product may hold. external: a meeting held on another service, '
  'at products.external_voice_url. none: no room of any kind; a family is shown '
  'the product''s join instructions instead, written per locale in '
  'product_translations.voice_join_instructions. external and none are a '
  'STOPGAP for audiences larger than a Sogverse room holds (50 people), to be '
  'removed once Sogverse rooms can hold more — see '
  'docs/investigations/voice-room-scale.md.';

-- ---------------------------------------------------------------------------
-- 2. The mode and the link, on products
-- ---------------------------------------------------------------------------
-- The default fills every existing row with sogverse and leaves the link
-- null, which is what every product already does, so both CHECKs below hold
-- for them on arrival.

ALTER TABLE public.products
  ADD COLUMN voice_room_mode public.voice_room_mode DEFAULT 'sogverse' NOT NULL,
  ADD COLUMN external_voice_url text,
  ADD CONSTRAINT chk_products_in_person_voice_room_is_sogverse
    CHECK (is_remote OR voice_room_mode = 'sogverse'),
  ADD CONSTRAINT chk_products_external_voice_url_iff_external
    CHECK (
      CASE
        WHEN voice_room_mode = 'external'
          THEN external_voice_url IS NOT NULL
           AND external_voice_url ~* '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'
        ELSE external_voice_url IS NULL
      END
    );

COMMENT ON COLUMN public.products.voice_room_mode IS
  'How this product''s sessions are joined — see the voice_room_mode type. '
  'Anything but sogverse is refused on an in-person product by '
  'chk_products_in_person_voice_room_is_sogverse. The admin chooses it on the '
  'product form, beside online versus in person. Mode none goes with join '
  'instructions on the translations, a rule across two tables that '
  'create_product and update_product enforce rather than a CHECK.';

COMMENT ON COLUMN public.products.external_voice_url IS
  'PUBLIC TO EVERYONE, LOGGED-OUT VISITORS INCLUDED. products carries a '
  'table-level SELECT grant for anon and its read policy admits every product, '
  'so anybody can read this link through the Data API without an account, a seat '
  'or a session window. That is a KNOWN AND ACCEPTED RISK, decided by the owner: '
  'the meeting is marketed publicly anyway. Do not put a link here that must stay '
  'private. The meeting a family is sent to when voice_room_mode is external, '
  'and NULL otherwise (chk_products_external_voice_url_iff_external, which also '
  'requires an http or https address so a javascript: or mistyped value cannot '
  'be stored). Admin-supplied and otherwise unrestricted: any meeting service '
  'will do. A STOPGAP for audiences larger than a Sogverse room holds; remove the '
  'column, with the external mode, once Sogverse rooms can hold more than 50 '
  'people — see docs/investigations/voice-room-scale.md.';

-- ---------------------------------------------------------------------------
-- 3. The instructions, per locale
-- ---------------------------------------------------------------------------
-- Shaped like long_description beside them: nullable, and never blank when
-- present, so there is one spelling of "none written in this locale".

ALTER TABLE public.product_translations
  ADD COLUMN voice_join_instructions text,
  ADD CONSTRAINT product_translations_voice_join_instructions_check
    CHECK (voice_join_instructions IS NULL OR voice_join_instructions ~ '[^[:space:]]');

COMMENT ON COLUMN public.product_translations.voice_join_instructions IS
  'PUBLIC TO EVERYONE, LOGGED-OUT VISITORS INCLUDED. product_translations '
  'carries a table-level SELECT grant for anon and its read policy admits the '
  'translations of every product, so anybody can read these instructions '
  'through the Data API without an account or a seat. That is a KNOWN AND '
  'ACCEPTED RISK, decided by the owner: do not write anything here that must stay '
  'private. How to join the product''s sessions in this locale when the '
  'product''s voice_room_mode is none, as plain text the team writes per locale; '
  'NULL where this locale has none, never blank. A reader is shown one locale''s '
  'version through the app''s translation picker, like the rest of the row. '
  'create_product and update_product refuse mode none with instructions in no '
  'translation, and instructions in any translation under another mode — a rule '
  'across two tables, so it is theirs rather than a CHECK. A STOPGAP like '
  'products.external_voice_url, to be removed with the none mode once Sogverse '
  'rooms can hold more than 50 people — see '
  'docs/investigations/voice-room-scale.md.';

-- ---------------------------------------------------------------------------
-- 4. The product writers take the voice room
-- ---------------------------------------------------------------------------
-- Two defaulted parameters on the end of each writer's list, and a
-- voice_join_instructions key on each translation. A new parameter changes
-- the signature, so each writer is dropped and created again, with its
-- grants re-stated.

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[]);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false, p_invoice_customer_id uuid DEFAULT NULL::uuid, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_voice_room_mode public.voice_room_mode DEFAULT 'sogverse'::public.voice_room_mode, p_external_voice_url text DEFAULT NULL::text) RETURNS uuid
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
    location_id, is_remote,
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
    p_location_id, p_is_remote,
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
    -- room on an in-person product.
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

COMMENT ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[], public.voice_room_mode, text) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, the staff-only material link and the consent documents enrolling on it requires. It takes NO status: a product''s lifecycle is derived from its dates, so there is nothing for a creating caller to choose and nothing stored for a later reader to mistake for a fact. p_start_date is defaulted like every other optional argument, but the column behind it is NOT NULL — an omitting caller is refused by the column rather than creating a product with no day it begins. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. p_required_consent_slugs is defaulted on the same argument and is NOT written inline: this function is SECURITY INVOKER and product_required_consents carries no write grant, so the row goes through set_product_required_consents, the join table''s single guarded writer. p_requires_gamer_creations is defaulted to FALSE rather than to null, because the column is NOT NULL and false is the resting state of that whole feature — so an omitting caller creates an unflagged product, which is what omission should mean, and an explicit null is refused loudly by the column rather than silently becoming false. p_invoice_customer_id is defaulted on the same argument as p_tag — null is legal, nothing backstops its absence, and codegen cannot express an explicit null — and names the FENNOA CUSTOMER a municipality club is invoiced to; it is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type. This function does NOT take a picture: a product''s picture is the catalogue_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. p_spoken_language_code is public.spoken_language, an enum rather than a text key into a reference table. p_holiday_calendar_ids names the holiday calendars a club follows and is NOT written inline either: it goes through set_product_holiday_calendars, product_holiday_calendars'' single guarded writer, which refuses a non-empty set on a product that is not a club. NULL, the default, follows none. p_voice_room_mode and p_external_voice_url say how an online product''s sessions are joined: a Sogverse voice room (the default), an outside link, or no room at all, in which case each translation may carry voice_join_instructions. The CHECKs on products refuse a link on any mode but external and anything but a Sogverse room on an in-person product; the rule that crosses into the translations is this function''s own, enforced after they are written: mode none needs instructions in at least one translation, and instructions on any translation need mode none. p_voice_room_mode defaults to ''sogverse'' for the reason p_requires_gamer_creations defaults to false: the column is NOT NULL and that is its resting state.';

REVOKE EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[], public.voice_room_mode, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[], public.voice_room_mode, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[], public.voice_room_mode, text) TO service_role;

DROP FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[]);

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false, p_invoice_customer_id uuid DEFAULT NULL::uuid, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_voice_room_mode public.voice_room_mode DEFAULT 'sogverse'::public.voice_room_mode, p_external_voice_url text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
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

  -- The product gate lock, taken where the existence probe used to be: this
  -- function now deletes from the product's roster, so it serializes against
  -- the participation RPCs that write it (join_waitlist et al) exactly as they
  -- serialize against each other. FOUND is set by PERFORM, so the not-found
  -- error is unchanged in code and position.
  PERFORM 1 FROM public.products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every editable column is assigned on every call, which is why a new column
  -- has to reach this statement in the same change that adds it — a column this
  -- function does not know about is nulled by the next admin edit. `tag` is the
  -- case that shows why the rule needs stating: its parameter is defaulted, so
  -- an omitting caller clears the tag silently and legally. That is the
  -- intended way to clear one; what stops it happening by accident is the wire
  -- schema demanding the field on every update.
  -- `region_lock_country` is the same shape for the same reasons, and a region
  -- lock is editable for a product's whole life on purpose: it gates future
  -- enrolments only and never revisits an existing seat.
  -- `requires_gamer_creations` obeys the same rule with one difference: its
  -- parameter defaults FALSE, not null, because the column is NOT NULL — so an
  -- omitting caller UNFLAGS the product rather than failing, which is the same
  -- "omission clears it" semantics `tag` has, and the same required wire field
  -- is what keeps it deliberate.
  -- `invoice_customer_id` is `tag`'s shape exactly: a defaulted parameter whose
  -- omission clears the club's Fennoa customer, kept deliberate by a
  -- required-nullable wire field. Editable for a club's whole life, because who
  -- buys a club can genuinely change between terms.
  --
  -- The voice room pair is `requires_gamer_creations`' shape: the mode's
  -- parameter defaults to 'sogverse' (the column is NOT NULL) and the link's
  -- to NULL, so an omitting caller puts the product back on a Sogverse room
  -- with no link. Required wire fields keep that deliberate.
  --
  -- `start_date` is the one editable column omission cannot clear: the column
  -- is NOT NULL, so an omitting caller is refused by the column rather than
  -- quietly blanking the date on a club that is already running.
  --
  -- `image_path` is the one editable-looking column this statement must NOT
  -- name: it is derived from image_id by trg_products_apply_image_path, which
  -- runs on this very UPDATE, so assigning it here would only ever write a
  -- value the trigger overwrote a moment later.
  UPDATE public.products SET
    billing_mode             = p_billing_mode,
    topic                    = p_topic,
    min_age                  = p_min_age,
    max_age                  = p_max_age,
    for_gamers               = p_for_gamers,
    for_parents              = p_for_parents,
    tag                      = p_tag,
    region_lock_country      = p_region_lock_country,
    spoken_language_code     = p_spoken_language_code,
    location_id              = p_location_id,
    is_remote                = p_is_remote,
    start_date               = p_start_date,
    end_date                 = p_end_date,
    timezone                 = p_timezone,
    seat_count               = p_seat_count,
    waitlist_enabled         = p_waitlist_enabled,
    registration_opens_at    = p_registration_opens_at,
    is_visible               = p_is_visible,
    primary_gedu_fee_cents   = p_primary_gedu_fee_cents,
    assistant_gedu_fee_cents = p_assistant_gedu_fee_cents,
    municipality_fee_cents   = p_municipality_fee_cents,
    requires_gamer_creations = p_requires_gamer_creations,
    invoice_customer_id      = p_invoice_customer_id,
    voice_room_mode          = p_voice_room_mode,
    external_voice_url       = p_external_voice_url
  WHERE id = p_id;

  -- A product with no waitlist holds no queue. The admin form turns the flag
  -- off two ways — unticking the box, or choosing Unlimited seats, which
  -- derives it false — and the groups panel draws its waitlist column only
  -- while the flag is on, so anything left queued here would be invisible to
  -- every affordance that could promote or remove it. Deleting is the clean
  -- answer rather than the harsh one: the edit that got us here means the
  -- product has seats open, so a dropped family can re-enter through the front
  -- door and land in a BETTER state than the queue they were in (free products
  -- re-enroll instantly; paid ones check out, which is what creates the
  -- subscription a promotion could never have created for them). Promoting
  -- them here instead would grant a free seat on a subscription-billed club.
  --
  -- This is silent by owner decision: no confirmation, no warning, no email.
  -- The triggering edit is expected to be accidental, and the families are told
  -- nothing — a known, accepted impact, recorded here because it is the kind of
  -- thing a future reader will assume was an oversight.
  --
  -- Keyed to the flag's VALUE, not to it changing, so the same statement heals
  -- a queue stranded by an edit made before this rule existed: the next save of
  -- anything at all on the product clears it.
  --
  -- THE CARVE-OUT: never delete a row that carries a LIVE subscription
  -- (a family_subscriptions row with status <> 'cancelled'; a dunning-dead one
  -- is not live and does not protect the row).
  -- The FK is ON DELETE CASCADE, so dropping such a row would delete our only
  -- record of a subscription Stripe keeps billing — the exact hazard
  -- demote_to_waitlist and admin_remove_participation refuse for. A waitlisted
  -- row with a live subscription is a webhook-race ghost (a demote landing
  -- between Checkout completing and the webhook's insert, or a manual
  -- sub-adoption), effectively unreachable, and it is skipped in silence:
  -- there is no surface here to report it on, and refusing the whole product
  -- edit over a row nobody can see would be worse than leaving it queued.
  IF NOT p_waitlist_enabled THEN
    DELETE FROM public.participations p
     WHERE p.product_id = p_id
       AND p.status = 'waitlisted'
       AND NOT EXISTS (
         SELECT 1
           FROM public.family_subscriptions fs
          WHERE fs.participation_id = p.id
            AND fs.status <> 'cancelled'
       );
  END IF;

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
      product_id, locale, name, short_description, long_description,
      voice_join_instructions
    )
    VALUES (
      p_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      v_translation->>'long_description',
      v_translation->>'voice_join_instructions'
    )
    ON CONFLICT (product_id, locale) DO UPDATE SET
      name              = EXCLUDED.name,
      short_description = EXCLUDED.short_description,
      long_description  = EXCLUDED.long_description,
      voice_join_instructions = EXCLUDED.voice_join_instructions,
      updated_at        = NOW();

    v_locales := array_append(v_locales, v_translation->>'locale');
  END LOOP;

  DELETE FROM public.product_translations
  WHERE product_id = p_id
    AND locale <> ALL (v_locales);

  -- The join instructions are written per locale on the translations,
  -- and belong to the no-room mode alone. A rule across two tables cannot
  -- be a CHECK, so it is enforced here, once the translations are in
  -- place: no room needs instructions in at least one language, and any
  -- other mode carries none.
  IF p_voice_room_mode = 'none' AND NOT EXISTS (
    SELECT 1 FROM public.product_translations
     WHERE product_id = p_id
       AND voice_join_instructions IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A product with no voice room needs join instructions in at least one language'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_voice_room_mode <> 'none' AND EXISTS (
    SELECT 1 FROM public.product_translations
     WHERE product_id = p_id
       AND voice_join_instructions IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Join instructions belong only to a product with no voice room'
      USING ERRCODE = 'check_violation';
  END IF;

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

  -- product_required_consents — wipe and replace, through the join
  -- table's single guarded writer. NULL clears the set, which is the only
  -- expressible way to clear one and is why the wire schema demands the field
  -- on every update. Existing consent_acceptances are untouched: dropping a
  -- requirement changes what FUTURE enrolments must agree to and says nothing
  -- about what past ones did agree to.
  PERFORM public.set_product_required_consents(p_id, p_required_consent_slugs);

  -- The holiday calendars the club follows — replaced through that join
  -- table's single guarded writer. NULL clears the set, the consents' shape
  -- exactly, so the wire schema demands the field on every update.
  PERFORM public.set_product_holiday_calendars(p_id, p_holiday_calendar_ids);

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[], public.voice_room_mode, text) IS 'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, the staff-only material link and the set of consent documents enrolling on it requires, under the product gate lock. It also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so a queue left stranded on a product whose waitlist is already off is cleared by the next save. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'') is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. It assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. It also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. It assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested. start_date is the one editable column omission CANNOT clear: it is NOT NULL, so an omitting caller is refused by the column rather than quietly blanking the date on a live product. It does NOT assign image_path and takes no p_image_path: that column is derived from image_id by trg_products_apply_image_path on this very UPDATE, so an assignment here would be overwritten a moment later. p_spoken_language_code is public.spoken_language, an enum rather than a text key into a reference table. p_required_consent_slugs replaces the requirement set through set_product_required_consents — NULL clears it, and past acceptances are never touched, because dropping a requirement changes what future enrolments must agree to and says nothing about what past ones did. It assigns requires_gamer_creations, whose parameter defaults FALSE rather than null because the column is NOT NULL — so an omitting caller unflags the product, the same "omission clears it" semantics tag has, kept deliberate by the required wire field. It assigns invoice_customer_id, the FENNOA CUSTOMER a municipality club is invoiced to — tag''s shape exactly, a defaulted parameter whose omission clears the link, kept deliberate by a required-nullable wire field, and editable for the club''s whole life because who buys a club can change between terms. It is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type. p_holiday_calendar_ids replaces the set of holiday calendars the club follows through set_product_holiday_calendars — NULL clears it, the shape p_required_consent_slugs has, kept deliberate by a required wire field. The plan follows at once, past months included. It assigns voice_room_mode and external_voice_url on every call: the mode''s parameter defaults to ''sogverse'' and the link''s to null, so an omitting caller resets the product to a Sogverse room with no link, the same "omission clears it" semantics tag has, kept deliberate by required wire fields. Each translation''s voice_join_instructions is replaced with the rest of the translation, and once the set is in place the function refuses mode none with instructions in no translation, and instructions on any translation under another mode — a rule across two tables, so it lives here rather than in a CHECK.';

REVOKE EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[], public.voice_room_mode, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[], public.voice_room_mode, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[], public.voice_room_mode, text) TO service_role;
