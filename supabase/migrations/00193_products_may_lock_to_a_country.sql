-- 00193: a product may be LOCKED to one country.
--
-- Some products are only meant for families in one country — a cohort a
-- national partner paid for, a camp whose venue only makes sense to reach from
-- inside its own borders. Today nothing says so, and a parent anywhere in the
-- catalogue can enrol.
--
-- WHAT CHANGES
--
--   1. `products` gains a NULLABLE `region_lock_country` column holding an ISO
--      3166-1 alpha-2 code. NULL — the state every existing row is in — means
--      not locked.
--   2. A CHECK on the SHAPE of the value (two uppercase letters) and nothing
--      more. See "why the CHECK stops there" below.
--   3. `create_product` / `update_product` carry it, following `tag` (00178)
--      exactly: appended to the DEFAULT tail, with the wire schema made
--      required-nullable so an omission cannot clear a lock by accident.
--
-- ENFORCEMENT IS UI-ONLY, BY DESIGN — THE ONE THING TO KNOW ABOUT THIS COLUMN
--
-- Nothing in this database refuses a participation on a locked product, and
-- nothing should be read into that absence: it is a decision, not a gap. A
-- family's location is SELF-ATTESTED and editable from their own settings at
-- any time, so a server-side block would be a check against a value the person
-- it blocks can rewrite in ten seconds. It would cost real machinery (a join
-- from participation to the customer's location chain, inside the product gate
-- lock) and buy an obstacle rather than a guarantee.
--
-- So the lock is what it honestly is: a signal the shop's signup panel reads to
-- tell a parent this product is not for their country. Two consequences are
-- accepted rather than defended against — a determined parent can change their
-- stated location and enrol, and a parent who legitimately moves after enroling
-- KEEPS their seat, because the lock gates the enrolment decision and never
-- re-runs against an existing one.
--
-- WHY THE CHECK STOPS AT THE SHAPE
--
-- The countries the lock may point at are the *seeded* entries of
-- SUPPORTED_COUNTRIES (src/lib/constants/location-hierarchies.ts) — locking to
-- a country whose municipalities have no rows would produce a product no
-- location on file could ever match. That list is application configuration
-- which changes when rows are seeded, so encoding it here as an enum or an FK
-- would mean a migration every time a country is added, and would turn an
-- already-stored lock into a constraint violation the day a country is
-- un-seeded. The narrowing to seeded countries therefore lives in the wire
-- contract and in the admin picker, which are the two places that can read the
-- config; the database holds the invariant that outlives any config — that the
-- value is an alpha-2 country code and not free text.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--
--   * No grant. The column rides `products`' existing table grants, as `tag`
--     did: a lock is public information (the shop tells a parent about it), and
--     the row's read surface does not move.
--   * No RLS policy. Same reason.
--   * No backfill. Every product that exists is legitimately unlocked.
--   * NOT the municipality-club `countryBound` mechanism. That is a different
--     dimension entirely — it binds a muni club's *location pickers* to Finland
--     because a kunta funds it, and it says nothing about who may enrol. The two
--     are kept apart on purpose, and the admin form hides this field for
--     municipality clubs precisely so nobody has to reconcile them.
--   * NOT `spoken_language_code` either. A club delivered in English is not a
--     club for one country.
--
-- Adding a parameter changes the argument list, so `CREATE OR REPLACE` would
-- leave a second overload behind and break PostgREST's candidate resolution.
-- Both functions are therefore DROPped with their full old signatures and
-- recreated — which rebuilds their ACLs from scratch, hence the REVOKE/GRANT
-- pair re-issued for both roles, the re-COMMENT, and the assertion block at the
-- foot of this file (00172 proved on staging that a recreated function can come
-- back PUBLIC-executable regardless of 00099's default-privilege entry).
--
-- The bodies below are the LIVE ones from supabase/schema.sql, not from 00178:
-- 00183 changed how `long_description` is read out of the translations payload,
-- and copying from the migration that first defined these functions would
-- silently revert it.

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN region_lock_country text
    CONSTRAINT chk_products_region_lock_country_shape
    CHECK (region_lock_country IS NULL OR region_lock_country ~ '^[A-Z]{2}$');

COMMENT ON COLUMN public.products.region_lock_country IS
  'Optional ISO 3166-1 alpha-2 country code this product is locked to; NULL '
  '(the state of every row before 00193) means not locked, and is the ordinary '
  'case. ENFORCEMENT IS UI-ONLY BY DESIGN: nothing in this database refuses a '
  'participation on a locked product. A family''s location is self-attested and '
  'editable by them at any time, so a server-side block would check a value the '
  'blocked party can rewrite — an obstacle, never a guarantee. The shop''s '
  'signup panel reads this column and tells a parent outside the country that '
  'the product is not for them; that is the whole mechanism. Two accepted '
  'consequences: a determined parent can restate their location and enrol, and a '
  'parent who moves after enroling keeps their seat, because the lock gates the '
  'enrolment decision and is never re-run against an existing one. The CHECK '
  'constrains the shape only (two uppercase letters). WHICH countries may be '
  'chosen is the seeded half of SUPPORTED_COUNTRIES in the application config, '
  'enforced by the write contract and the admin picker, because that list '
  'changes as location rows are seeded and an enum here would both need a '
  'migration per country and turn an already-stored lock into a violation the '
  'day one is un-seeded. Unrelated to the municipality-club country binding, '
  'which constrains a muni club''s location pickers and says nothing about who '
  'may enrol.';

-- ---------------------------------------------------------------------------
-- 2. The product writers carry the lock.
--
-- Bodies are the live ones from schema.sql, with one INSERT column, one UPDATE
-- assignment and one parameter added to each. `p_region_lock_country` goes on
-- the end of the DEFAULT tail: callers name their arguments, so position
-- carries no meaning beyond "it must sit among the defaulted ones".
--
-- Defaulted for the same reason `p_tag` is: NULL is a legal value, no CHECK
-- backstops it, and codegen types a non-defaulted argument as required AND
-- non-nullable — so "pass NULL explicitly" would not be expressible from the
-- application at all and clearing a lock would have no wire shape. The risk of
-- an accidental clear is closed one step earlier, at the wire: the body schema
-- makes the field required-nullable, and the route maps null → undefined →
-- DEFAULT NULL → cleared.
-- ---------------------------------------------------------------------------

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_status public.product_status DEFAULT 'pending'::public.product_status, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_image_path text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text) RETURNS uuid
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
    min_age, max_age, spoken_language_code, image_path,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents,
    for_gamers, for_parents, tag, region_lock_country
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path,
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

REVOKE EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO service_role;

COMMENT ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, holiday calendars and the staff-only material link. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag (00178) IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country (00193) is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment.';


DROP FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag);

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_image_path text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text) RETURNS uuid
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
    image_path               = p_image_path,
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

REVOKE EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO service_role;

COMMENT ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) IS 'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, holiday calendars and the staff-only material link, under the product gate lock. Since 00171 it also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so it also heals a queue stranded before the rule existed. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'', 00170''s predicate) is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER since 00171 — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. Since 00173 it assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. Since 00178 it also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. Since 00193 it assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested.';

-- ---------------------------------------------------------------------------
-- 3. End-state assertions.
--
-- Four things this migration could get wrong silently:
--
--   (a) A column that exists but is NOT NULL, or carries the wrong type —
--       either of which would make "not locked" unrepresentable.
--   (b) A CHECK that admits free text (or one that refuses a legitimate code).
--       Proved against real rows in a TEMP copy of `products` built with
--       `LIKE ... INCLUDING CONSTRAINTS`, which carries the CHECKs but neither
--       the foreign keys nor the triggers, so the probe writes nothing to
--       `public.products` and needs no `created_by` profile to exist.
--   (c) A leftover overload. `CREATE OR REPLACE` on a changed argument list is
--       exactly the mistake this migration's DROP/CREATE exists to avoid, and
--       it fails PostgREST at runtime rather than here — so the count is
--       asserted, and so is p_region_lock_country being among the DEFAULTED
--       ones (a non-defaulted one would break every existing caller).
--   (d) A recreated function coming back PUBLIC-executable, or losing the
--       authenticated grant it is supposed to have. Asserted here rather than
--       left to the access-control test, because that test runs only in CI and
--       this migration also runs against hosted databases.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _region_lock_probe (LIKE public.products INCLUDING CONSTRAINTS INCLUDING DEFAULTS);

DO $assert$
DECLARE
  v_ok      boolean;
  v_offend  text;
  v_bad     text;
BEGIN
  -- --- (a) The column exists, is nullable text. ----------------------------
  SELECT NOT a.attnotnull
    INTO v_ok
    FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type ty     ON ty.oid = a.atttypid
   WHERE n.nspname = 'public'
     AND c.relname = 'products'
     AND a.attname = 'region_lock_country'
     AND ty.typname = 'text'
     AND a.attnum > 0
     AND NOT a.attisdropped;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'products.region_lock_country is not a nullable text column';
  END IF;

  -- --- (b) The shapes that must be accepted: unlocked, and a real code. ----
  INSERT INTO _region_lock_probe (
    product_type, billing_mode, topic, spoken_language_code, is_remote,
    timezone, registration_opens_at, created_by,
    for_gamers, for_parents, min_age, max_age, region_lock_country
  )
  SELECT
    'consumer_club', 'free', 'minecraft_java', 'en', true,
    'Europe/Helsinki', now(), gen_random_uuid(),
    true, false, 7, 12, probe.code
  FROM unnest(ARRAY[NULL, 'FI', 'GB']) AS probe(code);

  SELECT count(*) = 3 AND count(region_lock_country) = 2
    INTO v_ok FROM _region_lock_probe;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'the probe did not accept an unlocked row plus two country codes';
  END IF;

  -- And the ones that must not be. Lower case, the wrong length and free text
  -- each have to fail: the column is the place a typo becomes a lock nothing
  -- can ever match, and a shape CHECK that admitted 'fi' would let the admin
  -- picker and the shop compare values that never converge.
  FOREACH v_bad IN ARRAY ARRAY['fi', 'FIN', 'F', 'F1', 'Finland', '']
  LOOP
    BEGIN
      INSERT INTO _region_lock_probe (
        product_type, billing_mode, topic, spoken_language_code, is_remote,
        timezone, registration_opens_at, created_by,
        for_gamers, for_parents, min_age, max_age, region_lock_country
      ) VALUES (
        'consumer_club', 'free', 'minecraft_java', 'en', true,
        'Europe/Helsinki', now(), gen_random_uuid(),
        true, false, 7, 12, v_bad
      );
      RAISE EXCEPTION 'products.region_lock_country accepted %, which is not an alpha-2 code', quote_literal(v_bad);
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
  END LOOP;

  -- --- (c) One function each, and the parameter among the defaulted ones. --
  -- Exactly two rows: one create_product, one update_product. Counting the
  -- total rather than grouping catches the missing case as well as the
  -- duplicate one — a DROP that took the wrong signature leaves neither.
  SELECT count(*) = 2 INTO v_ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_product', 'update_product');
  IF NOT v_ok THEN
    RAISE EXCEPTION 'the product writers are not exactly one function each — an overload PostgREST cannot resolve, or a missing function';
  END IF;

  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_offend
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_product', 'update_product')
     AND NOT (
       'p_region_lock_country' = ANY (p.proargnames)
       -- 1-based position; a parameter is defaulted iff it sits in the tail.
       AND array_position(p.proargnames, 'p_region_lock_country') > p.pronargs - p.pronargdefaults
     );
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'p_region_lock_country is missing or non-defaulted on: %', v_offend;
  END IF;

  -- --- (d) The rebuilt ACLs are what they were. ----------------------------
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_offend
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_product', 'update_product')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'a product writer came back executable by anon: %', v_offend;
  END IF;

  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_offend
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_product', 'update_product')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'a product writer lost its authenticated EXECUTE grant: %', v_offend;
  END IF;
END
$assert$;

DROP TABLE _region_lock_probe;
