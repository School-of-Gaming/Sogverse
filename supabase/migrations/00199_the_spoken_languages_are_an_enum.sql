-- 00199: the spoken languages are an enum.
--
-- WHY
--
-- public.spoken_languages was a two-column reference table (code, name) whose
-- flexibility was never real. The set is four values, it has not changed, and
-- adding a fifth was already a code deploy: the flag a language renders with
-- is a hardcoded map in src/components/ui/language-flag.tsx, and the display
-- name has not come from the `name` column since the UI started asking
-- Intl.DisplayNames for it in the reader's own locale. So the table stored one
-- dead column and one column that duplicated a compile-time constant.
--
-- What it cost was a network read on every surface that offers a language
-- choice. The shop's filter panel drew its Language row only if that read had
-- landed, the shop page's prefetch swallowed a failure into an empty array,
-- and one shared React Query key served four pages — so a failed prefetch hid
-- the row and a later refetch popped it back in, moving everything below it on
-- data's own schedule. That is the shift the layout rule exists to forbid, and
-- no amount of care at the call sites removes it while the values arrive over
-- the wire.
--
-- As an enum the values reach the application through codegen instead, which
-- is where the other four closed sets already live (product_topic,
-- product_tag, product_type, user_role). The map in language-flag.tsx then
-- becomes a Record keyed by the enum, so a value added without its flag fails
-- to compile rather than rendering nothing.
--
-- This is deliberately NOT the locations pattern, and deliberately not merged
-- with the UI locale: a spoken language is a human language a family speaks,
-- a locale is which translation of the app they see, and the relationship
-- between them stays one-way (every non-novelty locale must be offerable as a
-- spoken language, never the reverse).
--
-- WHAT CHANGES
--
--   1. public.spoken_language, an enum of exactly fi, sv, en, fr.
--   2. products.spoken_language_code and profiles.spoken_languages carry it;
--      the FK into the reference table goes with the table.
--   3. user_search_index and the validation trigger are dropped and recreated.
--      Postgres refuses to alter a column a view selects, and refuses just as
--      firmly while a trigger names it in UPDATE OF. The view comes back with
--      its comments, grants and security_invoker flag unchanged; the trigger
--      comes back verbatim.
--   4. create_product, update_product and register_gedu take the enum. A
--      text-typed plpgsql parameter assigned to an enum column needs an
--      explicit cast (an I/O conversion cast from a string type is
--      explicit-only), so leaving them as text would break the assignment
--      rather than merely leaving it loose. That is a signature change, so all
--      three are dropped and recreated, which rebuilds their ACLs from scratch
--      — hence the REVOKE/GRANT block after each. Bodies are otherwise
--      verbatim.
--   5. validate_profile_spoken_languages keeps only its duplicate check. The
--      enum makes the membership branch unreachable, but nothing in the type
--      system stops ARRAY['fi','fi']. It stays a trigger rather than becoming
--      a CHECK calling a helper: EXECUTE on a trigger function is checked when
--      the trigger is created, not when it fires, so a CHECK would need the
--      function granted to authenticated and classified in the authorization
--      spine, for a rule that has no reason to be callable at all.
--   6. The table is dropped, taking its policies and grants with it.

-- ---------------------------------------------------------------------------
-- 1. The type
-- ---------------------------------------------------------------------------
--
-- Complete in one CREATE TYPE. Order is fi, sv, en, fr — Finland's two
-- national languages, then the two the platform additionally delivers in —
-- and it is the order the pickers render, so it is worth getting right here
-- rather than sorting at every call site.

CREATE TYPE public.spoken_language AS ENUM ('fi', 'sv', 'en', 'fr');

COMMENT ON TYPE public.spoken_language IS 'A human language a club is delivered in, or that a person speaks. Distinct from profiles.locale, which is which translation of the app someone sees: a Finnish-speaking parent may read the app in Finnish and want their child in an English club. Display names are never stored — the UI asks Intl.DisplayNames for the name in the reader''s own locale — so this type carries codes and nothing else. Adding a value is a code change as well as a migration: the flag map in src/components/ui/language-flag.tsx is keyed by this enum and will not compile without an entry.';

-- ---------------------------------------------------------------------------
-- 2. The columns
-- ---------------------------------------------------------------------------
--
-- products first: the FK is what tied the column to the table, and it has to
-- go before either can.

ALTER TABLE public.products
  DROP CONSTRAINT products_spoken_language_code_fkey;

ALTER TABLE public.products
  ALTER COLUMN spoken_language_code TYPE public.spoken_language
    USING spoken_language_code::public.spoken_language;

-- profiles next, and two things pin that column against an ALTER: the
-- user_search_index view selects it, and the validation trigger names it in
-- its UPDATE OF list. Both are dropped here and both come back below,
-- unchanged apart from the type they inherit.

DROP VIEW public.user_search_index;

DROP TRIGGER trg_validate_profile_spoken_languages ON public.profiles;

ALTER TABLE public.profiles
  ALTER COLUMN spoken_languages DROP DEFAULT;

ALTER TABLE public.profiles
  ALTER COLUMN spoken_languages TYPE public.spoken_language[]
    USING spoken_languages::public.spoken_language[];

ALTER TABLE public.profiles
  ALTER COLUMN spoken_languages SET DEFAULT '{}'::public.spoken_language[];

COMMENT ON COLUMN public.profiles.spoken_languages IS 'Human languages the user speaks, as public.spoken_language values. Used for matching gamers/gedus to clubs. Distinct from locale, which controls UI translation. The enum guarantees every entry is a language we offer; the BEFORE trigger on this column is what guarantees no entry appears twice.';

-- A column ALTER preserves column-level ACLs, but this one is load-bearing —
-- it is the whole reason a family can save their own languages from the
-- settings page — so it is restated rather than assumed, and asserted at the
-- foot.

GRANT UPDATE(spoken_languages) ON TABLE public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. user_search_index, rebuilt
-- ---------------------------------------------------------------------------
--
-- Verbatim from the current definition, security_invoker spelled exactly as
-- the access-control sweep reads it out of reloptions, with both comments and
-- both grants back in place.

CREATE VIEW public.user_search_index WITH (security_invoker='true') AS
 SELECT p.id,
    p.email,
    p.email_verified_at,
    p.first_name,
    p.last_name,
    p.role,
    p.phone,
    p.currency,
    p.home_location_id,
    p.referral_code,
    p.locale,
    p.spoken_languages,
    p.created_at,
    p.updated_at,
    concat_ws(' '::text, p.first_name, p.last_name, p.email, p.phone, mc.minecraft_username, rb.roblox_username) AS search_blob
   FROM ((public.profiles p
     LEFT JOIN public.minecraft_accounts mc ON ((mc.user_id = p.id)))
     LEFT JOIN public.roblox_accounts rb ON ((rb.user_id = p.id)));

COMMENT ON VIEW public.user_search_index IS 'Profiles as the admin user search matches them: every profile column, plus search_blob. Read by that one search and nothing else. SECURITY INVOKER, so RLS on profiles, minecraft_accounts and roblox_accounts governs every row exactly as it would a direct read — which also means a role granted SELECT here must hold SELECT on all three. The joins are on those tables'' primary key and so cannot multiply a profile into several rows; the search reads its match total from this view''s row count, so that is asserted rather than assumed. A future game platform is one more LEFT JOIN and one more argument to concat_ws, with no change anywhere outside the database.';

COMMENT ON COLUMN public.user_search_index.search_blob IS 'Every string a person can be found by — name, email, phone, and each game handle — space-joined. Derived, never written, and never selected: the search filters on it and reads the profile columns beside it, so it does not cross the wire. referral_code and email_verified_at are deliberately absent: one labels where a family came from and the other is a date, and neither is a name anyone should be findable by. The phone is the stored digits (E.164 without the +), which is why a needle reduced to its trailing digits matches a number typed either nationally or internationally without the search knowing any dialling rules.';

GRANT SELECT ON TABLE public.user_search_index TO authenticated;
GRANT SELECT ON TABLE public.user_search_index TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The three RPCs that name these columns
-- ---------------------------------------------------------------------------

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_status public.product_status DEFAULT 'pending'::public.product_status, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text) RETURNS uuid
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

  -- image_path is absent from this INSERT on purpose (00198): a product's
  -- picture is the catalogue entry it points at, the route writes image_id in
  -- its own statement after this one, and the trigger on products derives the
  -- served path from it.
  INSERT INTO public.products (
    product_type, billing_mode, topic,
    min_age, max_age, spoken_language_code,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents,
    for_gamers, for_parents, tag, region_lock_country
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents,
    p_for_gamers, p_for_parents, p_tag, p_region_lock_country
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
      v_translation->>'long_description'
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

REVOKE EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO service_role;

COMMENT ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, holiday calendars and the staff-only material link. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag (00178) IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country (00193) is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. This function does NOT take a picture: 00198 dropped p_image_path, because a product''s picture is the product_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone.';

DROP FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text);

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text) RETURNS uuid
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

REVOKE EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO service_role;

COMMENT ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text) IS 'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, holiday calendars and the staff-only material link, under the product gate lock. Since 00171 it also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so it also heals a queue stranded before the rule existed. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'', 00170''s predicate) is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER since 00171 — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. Since 00173 it assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. Since 00178 it also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. Since 00193 it assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested. Since 00198 it does NOT assign image_path and takes no p_image_path: that column is derived from image_id by trg_products_apply_image_path on this very UPDATE, so the assignment was always overwritten a moment later. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone.';

-- register_gedu is service-role only: the registration route calls it with the
-- admin client, because it promotes a profile the caller is not yet allowed to
-- write. That grant is the one that must come back, and authenticated must NOT.

DROP FUNCTION public.register_gedu(uuid, text, text, text, text, text[], uuid[], text, text, text, text);

CREATE FUNCTION public.register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages public.spoken_language[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only operate on a freshly-created customer profile (the role the new-user
  -- trigger seeds). Refusing anything else stops this from being used to mutate
  -- an established account of any role.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'register_gedu: % is not a newly-created customer profile', p_user_id;
  END IF;

  -- Callers pass '' for absent optional text (the generated RPC arg types are
  -- non-null `string`); NULLIF turns those back into SQL NULL so e.g. an empty
  -- phone stays NULL rather than tripping the profiles.phone format CHECK.
  UPDATE public.profiles
  SET role             = 'gedu',
      first_name       = p_first_name,
      last_name        = p_last_name,
      locale           = NULLIF(p_locale, ''),
      phone            = NULLIF(p_phone, ''),
      spoken_languages = COALESCE(p_spoken_languages, '{}')
  WHERE id = p_user_id;

  -- Swap the trigger-created customer extension row for a gedu one.
  DELETE FROM public.customer_profiles WHERE user_id = p_user_id;
  INSERT INTO public.gedu_profiles (user_id) VALUES (p_user_id);

  -- Coverage areas (empty = remote-only, which is valid).
  IF p_location_ids IS NOT NULL AND array_length(p_location_ids, 1) IS NOT NULL THEN
    INSERT INTO public.gedu_locations (gedu_id, location_id)
    SELECT p_user_id, unnest(p_location_ids);
  END IF;

  -- Optional Minecraft account. A duplicate uuid is allowed (an educator may
  -- share an account with someone else on the platform), so this insert has no
  -- rejection path of its own.
  IF p_minecraft_username IS NOT NULL AND p_minecraft_username <> '' THEN
    INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
    VALUES (p_user_id, p_minecraft_username, NULLIF(p_minecraft_uuid, ''));
  END IF;

  -- Optional Roblox account, on the same terms. The account id arrives as text
  -- carrying the same '' sentinel and is cast once here; a non-numeric value
  -- would raise, which is correct — the only caller resolves it from Roblox's
  -- own answer, so anything else is a bug rather than a user's typo.
  IF p_roblox_username IS NOT NULL AND p_roblox_username <> '' THEN
    INSERT INTO public.roblox_accounts (user_id, roblox_username, roblox_user_id)
    VALUES (p_user_id, p_roblox_username, NULLIF(p_roblox_user_id, '')::bigint);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_gedu(uuid, text, text, text, text, public.spoken_language[], uuid[], text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_gedu(uuid, text, text, text, text, public.spoken_language[], uuid[], text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The trigger keeps the half the type system cannot do
-- ---------------------------------------------------------------------------
--
-- The function is CREATE OR REPLACE — its signature never changes, so its ACL
-- survives — but the REVOKE/GRANT pair is restated anyway, because a
-- function's ACL is exactly the thing that quietly comes back wrong. The
-- trigger itself has to be recreated: step 2 dropped it, because a trigger
-- naming a column in UPDATE OF pins that column's type just as a view does.

CREATE OR REPLACE FUNCTION public.validate_profile_spoken_languages() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF array_length(NEW.spoken_languages, 1) IS NOT NULL THEN
    -- Membership is the column type's job since 00199. Uniqueness is not:
    -- public.spoken_language[] is perfectly happy to hold ARRAY['fi','fi'],
    -- and every reader of this column treats it as a set.
    IF (SELECT count(DISTINCT v) FROM unnest(NEW.spoken_languages) v)
       < array_length(NEW.spoken_languages, 1) THEN
      RAISE EXCEPTION 'Duplicate language codes are not allowed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_profile_spoken_languages() IS 'BEFORE INSERT OR UPDATE OF profiles.spoken_languages. Its only remaining rule is that no language appears twice — public.spoken_language decides which values are legal, and did so from 00199. It stays a trigger rather than a CHECK on purpose: EXECUTE on a trigger function is checked when the trigger is created, so this never needs a grant to authenticated, and therefore never needs a classification in the authorization spine, for a rule no caller has any business invoking.';

REVOKE ALL ON FUNCTION public.validate_profile_spoken_languages() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_profile_spoken_languages() TO service_role;

CREATE TRIGGER trg_validate_profile_spoken_languages BEFORE INSERT OR UPDATE OF spoken_languages ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_profile_spoken_languages();

-- ---------------------------------------------------------------------------
-- 6. The table goes
-- ---------------------------------------------------------------------------
--
-- Its two policies and its three grants are dropped with it. Nothing else
-- references it: the FK went in step 2 and the trigger's lookup went in step 5.

DROP TABLE public.spoken_languages;

-- ---------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_offend  text;
  v_count   bigint;
BEGIN
  -- --- The type exists, with exactly the four values in order ---------------
  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
    INTO v_offend
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname = 'spoken_language';
  IF v_offend IS DISTINCT FROM 'fi,sv,en,fr' THEN
    RAISE EXCEPTION 'public.spoken_language is %, not fi,sv,en,fr', COALESCE(v_offend, '(absent)');
  END IF;

  -- --- The reference table is gone -----------------------------------------
  IF to_regclass('public.spoken_languages') IS NOT NULL THEN
    RAISE EXCEPTION 'public.spoken_languages still exists';
  END IF;

  -- --- Both columns carry the enum, and neither lost NOT NULL --------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
     WHERE a.attrelid = 'public.products'::regclass
       AND a.attname = 'spoken_language_code'
       AND a.atttypid = 'public.spoken_language'::regtype
       AND a.attnotnull
  ) THEN
    RAISE EXCEPTION 'products.spoken_language_code is not a NOT NULL public.spoken_language';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
     WHERE a.attrelid = 'public.profiles'::regclass
       AND a.attname = 'spoken_languages'
       AND a.atttypid = 'public.spoken_language[]'::regtype
       AND a.attnotnull
  ) THEN
    RAISE EXCEPTION 'profiles.spoken_languages is not a NOT NULL public.spoken_language[]';
  END IF;

  -- --- No text-typed survivor of any of the three signatures ---------------
  -- A DROP that missed (a signature typed out slightly wrong drops nothing and
  -- raises, but a CREATE that landed beside a survivor would leave two
  -- overloads PostgREST cannot choose between).
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' ORDER BY p.proname)
    INTO v_offend
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_product', 'update_product', 'register_gedu')
     AND NOT (
       'public.spoken_language'::regtype = ANY (p.proargtypes::oid[])
       OR 'public.spoken_language[]'::regtype = ANY (p.proargtypes::oid[])
     );
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'these signatures do not take the enum: %', v_offend;
  END IF;

  SELECT count(*)
    INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_product', 'update_product', 'register_gedu');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'expected exactly one of each product/gedu writer, found % overloads', v_count;
  END IF;

  -- --- SECURITY mode survived the drop/recreate ----------------------------
  -- create_product is INVOKER so its assert_admin() runs as the caller;
  -- update_product and register_gedu are DEFINER because they write tables the
  -- caller holds no grant on.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_offend
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (
       (p.proname = 'create_product' AND p.prosecdef)
       OR (p.proname IN ('update_product', 'register_gedu') AND NOT p.prosecdef)
     );
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY mode changed on: %', v_offend;
  END IF;

  -- --- The ACLs the drop/recreate rebuilt ----------------------------------
  -- A recreated function comes back PUBLIC-executable, and register_gedu must
  -- not be reachable by authenticated at all.
  IF has_function_privilege('authenticated', 'public.register_gedu(uuid, text, text, text, text, public.spoken_language[], uuid[], text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'register_gedu is executable by authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.register_gedu(uuid, text, text, text, text, public.spoken_language[], uuid[], text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'register_gedu is not executable by service_role';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'create_product is not executable by authenticated';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'update_product is not executable by authenticated';
  END IF;

  -- --- The view came back the way it went ----------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'user_search_index'
      AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'user_search_index is missing or is not security_invoker=true';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.user_search_index', 'SELECT') THEN
    RAISE EXCEPTION 'user_search_index lost its SELECT grant to authenticated';
  END IF;

  -- --- The settings page's own write ---------------------------------------
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'spoken_languages', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated lost UPDATE on profiles.spoken_languages';
  END IF;

  -- --- The trigger is back on profiles -------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.profiles'::regclass
       AND tgname = 'trg_validate_profile_spoken_languages'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_validate_profile_spoken_languages is gone from profiles';
  END IF;
END
$assert$;
