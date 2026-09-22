--
-- Name: update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false, p_invoice_customer_id uuid DEFAULT NULL::uuid) RETURNS uuid
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
  -- one 00178 added, and it is the case that shows why the rule needs stating:
  -- its parameter is defaulted, so an omitting caller clears the tag silently
  -- and legally. That is the intended way to clear one; what stops it happening
  -- by accident is the wire schema demanding the field on every update.
  -- `region_lock_country` (00193) is the same shape for the same reasons, and a
  -- region lock is editable for a product's whole life on purpose: it gates
  -- future enrolments only and never revisits an existing seat.
  -- `requires_gamer_creations` (00227) obeys the same rule with one difference:
  -- its parameter defaults FALSE, not null, because the column is NOT NULL — so
  -- an omitting caller UNFLAGS the product rather than failing, which is the
  -- same "omission clears it" semantics `tag` has, and the same required wire
  -- field is what keeps it deliberate.
  -- `invoice_customer_id` (00268) is `tag`'s shape exactly: a defaulted
  -- parameter whose omission clears the club's Fennoa customer, kept deliberate
  -- by a required-nullable wire field. Editable for a club's whole life, because
  -- who buys a club can genuinely change between terms.
  --
  -- `start_date` is the one editable column omission cannot clear: the column
  -- is NOT NULL (00279), so an omitting caller is refused by the column rather
  -- than quietly blanking the date on a club that is already running.
  --
  -- `image_path` is the one editable-looking column this statement must NOT
  -- name, and 00198 removed the assignment along with the parameter that fed
  -- it. It is derived from image_id by trg_products_apply_image_path, which
  -- runs on this very UPDATE; assigning it here only ever wrote a value the
  -- trigger overwrote a moment later.
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
    invoice_customer_id      = p_invoice_customer_id
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
  -- (00170's predicate — a family_subscriptions row with status <>
  -- 'cancelled'; a dunning-dead one is not live and does not protect the row).
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
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      p_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      v_translation->>'long_description'
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

  -- product_required_consents — wipe and replace (00210), through the join
  -- table's single guarded writer. NULL clears the set, which is the only
  -- expressible way to clear one and is why the wire schema demands the field
  -- on every update. Existing consent_acceptances are untouched: dropping a
  -- requirement changes what FUTURE enrolments must agree to and says nothing
  -- about what past ones did agree to.
  PERFORM public.set_product_required_consents(p_id, p_required_consent_slugs);

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid) IS 'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, the staff-only material link and the set of consent documents enrolling on it requires, under the product gate lock. It also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so a queue left stranded on a product whose waitlist is already off is cleared by the next save. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'') is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. It assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. It also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. It assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested. start_date is the one editable column omission CANNOT clear: it is NOT NULL, so an omitting caller is refused by the column rather than quietly blanking the date on a live product. It does NOT assign image_path and takes no p_image_path: that column is derived from image_id by trg_products_apply_image_path on this very UPDATE, so an assignment here would be overwritten a moment later. p_spoken_language_code is public.spoken_language, an enum rather than a text key into a reference table. p_required_consent_slugs replaces the requirement set through set_product_required_consents — NULL clears it, and past acceptances are never touched, because dropping a requirement changes what future enrolments must agree to and says nothing about what past ones did. It assigns requires_gamer_creations, whose parameter defaults FALSE rather than null because the column is NOT NULL — so an omitting caller unflags the product, the same "omission clears it" semantics tag has, kept deliberate by the required wire field. It assigns invoice_customer_id, the FENNOA CUSTOMER a municipality club is invoiced to — tag''s shape exactly, a defaulted parameter whose omission clears the link, kept deliberate by a required-nullable wire field, and editable for the club''s whole life because who buys a club can change between terms. It is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type.';


--
-- Name: FUNCTION update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean, p_invoice_customer_id uuid) TO service_role;


