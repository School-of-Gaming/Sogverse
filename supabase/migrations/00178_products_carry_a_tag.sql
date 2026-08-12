-- 00178: a product may carry a TAG — who it was designed for.
--
-- The audience (00173) says who may hold a seat. A tag says who the thing was
-- BUILT for, which is a different question and the one a parent scanning a grid
-- is actually asking: a club for children who have never played, one for
-- advanced builders, and one designed around neurodivergent kids look identical
-- today behind an age range.
--
-- WHAT CHANGES
--
--   1. A `product_tag` enum with exactly three values: neuroinclusive,
--      beginner, advanced.
--   2. `products` gains a NULLABLE `tag` column. No backfill — every product
--      that exists is legitimately untagged, and null renders nothing.
--   3. `create_product` / `update_product` carry it.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--
--   * No grant. The column rides `products`' existing table grants; a column is
--     not a grantable object here and nothing about the table's read surface
--     moves — a tag is public information, printed on the shop card.
--   * No RLS policy. Same reason: the row's visibility is unchanged.
--   * No CHECK. NULL is a legal, expected value — "untagged" is the common case
--     and the one every existing row is in. That absence is what decides the
--     parameter shape below, so it is worth naming rather than leaving implied.
--
-- ONE TAG, NOT MANY. A join table was considered and rejected by the product
-- owner for v1: the card has a single chip slot and "Beginner + Advanced" is
-- incoherent. The single nullable enum column IS the design. If a second axis
-- ever appears — skill level vs. support need, the fault line running through
-- the current three — it arrives as a second column, not as N tags.
--
-- WHY `p_tag` IS DEFAULTED, WHERE THE AUDIENCE FLAGS ARE NOT
--
-- 00173 made `p_for_gamers` / `p_for_parents` non-defaulted so an omitting
-- caller would fail loudly rather than silently reset a product's audience, and
-- it could afford to: an omitted age is caught by
-- chk_products_ages_iff_for_gamers, so the defaulted ages beside them cannot go
-- quiet. `tag` has no analogous CHECK — NULL is legal — so the same trick is
-- unavailable, and a non-defaulted parameter would be worse than useless here:
-- codegen types a non-defaulted argument as required AND non-nullable, so
-- "pass NULL explicitly" is not expressible from the application at all, and
-- clearing a tag would have no wire shape.
--
-- So the risk is closed one step earlier, at the wire: the update body schema
-- makes the field REQUIRED-NULLABLE, so the one write path cannot omit it by
-- accident, and the route maps null → undefined → DEFAULT NULL → cleared. That
-- chain is the intended meaning of null, and it is the established shape every
-- other nullable product column already uses.
--
-- Adding a parameter changes the argument list, so `CREATE OR REPLACE` would
-- leave a second overload behind and break PostgREST's candidate resolution.
-- Both functions are therefore DROPped with their full old signatures and
-- recreated, which rebuilds their ACLs from scratch — hence the REVOKE/GRANT
-- pair re-issued for both roles, the re-COMMENT, and the assertion block at the
-- foot of this file (00172 proved on staging that a recreated function can come
-- back PUBLIC-executable regardless of 00099's default-privilege entry).

-- ---------------------------------------------------------------------------
-- 1. The vocabulary.
-- ---------------------------------------------------------------------------

CREATE TYPE public.product_tag AS ENUM (
  'neuroinclusive',
  'beginner',
  'advanced'
);

COMMENT ON TYPE public.product_tag IS
  'Who a product was DESIGNED for, as opposed to who may hold a seat on it '
  '(that is the audience — for_gamers/for_parents). Exactly one per product or '
  'none at all. The label copy lives in messages/, not here: this enum stores '
  'the value and nothing else, the same arrangement product_topic has. '
  '''neuroinclusive'' is deliberately not ''neurodivergent-friendly'' — the '
  '-friendly suffix implies every unlabelled club is unfriendly, where this '
  'states a design property without ranking the rest of the catalogue.';

-- ---------------------------------------------------------------------------
-- 2. The column.
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN tag public.product_tag;

COMMENT ON COLUMN public.products.tag IS
  'Optional design tag, NULL meaning untagged. Untagged is the ordinary state '
  'and renders nothing anywhere — no chip on the card, no chip on the detail '
  'hero, no explanation block — exactly as a gamers-only audience renders no '
  'badge. There is no default and no backfill: every product authored before '
  '00178 is untagged because nobody has said otherwise.';

-- ---------------------------------------------------------------------------
-- 3. The product writers carry the tag.
--
-- Bodies are the live ones from 00173, with one INSERT column, one UPDATE
-- assignment and one parameter added to each. `p_tag` goes on the end of the
-- DEFAULT tail: callers name their arguments, so position carries no meaning
-- beyond "it must sit among the defaulted ones".
-- ---------------------------------------------------------------------------

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_status public.product_status DEFAULT 'pending'::public.product_status, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_image_path text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag) RETURNS uuid
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
    for_gamers, for_parents, tag
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents,
    p_for_gamers, p_for_parents, p_tag
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

REVOKE EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag) TO service_role;

COMMENT ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, holiday calendars and the staff-only material link. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag (00178) IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream.';


DROP FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text);

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_image_path text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag) RETURNS uuid
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
  UPDATE public.products SET
    billing_mode             = p_billing_mode,
    topic                    = p_topic,
    min_age                  = p_min_age,
    max_age                  = p_max_age,
    for_gamers               = p_for_gamers,
    for_parents              = p_for_parents,
    tag                      = p_tag,
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

REVOKE EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag) TO service_role;

COMMENT ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag) IS 'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, holiday calendars and the staff-only material link, under the product gate lock. Since 00171 it also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so it also heals a queue stranded before the rule existed. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'', 00170''s predicate) is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER since 00171 — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. Since 00173 it assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. Since 00178 it also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate.';

-- ---------------------------------------------------------------------------
-- 4. End-state assertions.
--
-- Four things this migration could get wrong silently:
--
--   (a) An enum with the wrong members, or in an order a later reader would
--       take for the display order. Asserted exactly, including order.
--   (b) A column that exists but is NOT NULL, or carries the wrong type —
--       either of which would make "untagged" unrepresentable. Proved against
--       real rows in a TEMP copy of `products` built with
--       `LIKE ... INCLUDING CONSTRAINTS`, which carries the CHECKs but neither
--       the foreign keys nor the triggers, so the probe writes nothing to
--       `public.products` and needs no `created_by` profile to exist.
--   (c) A leftover overload. `CREATE OR REPLACE` on a changed argument list is
--       exactly the mistake this migration's DROP/CREATE exists to avoid, and
--       it fails PostgREST at runtime rather than here — so the count is
--       asserted, and so is the p_tag parameter being among the DEFAULTED ones
--       (a non-defaulted one would break every existing caller).
--   (d) A recreated function coming back PUBLIC-executable, or losing the
--       authenticated grant it is supposed to have. Asserted here rather than
--       left to the access-control test, because that test runs only in CI and
--       this migration also runs against hosted databases.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _tag_probe (LIKE public.products INCLUDING CONSTRAINTS INCLUDING DEFAULTS);

DO $assert$
DECLARE
  v_labels  text[];
  v_ok      boolean;
  v_offend  text;
BEGIN
  -- --- (a) The vocabulary is exactly the three settled values. -------------
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO v_labels
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e      ON e.enumtypid = t.oid
   WHERE n.nspname = 'public' AND t.typname = 'product_tag';
  IF v_labels IS DISTINCT FROM ARRAY['neuroinclusive', 'beginner', 'advanced'] THEN
    RAISE EXCEPTION 'product_tag is % rather than the three settled values', v_labels;
  END IF;

  -- --- (b) The column exists, is nullable, and admits only those values. ---
  SELECT NOT a.attnotnull
    INTO v_ok
    FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type ty     ON ty.oid = a.atttypid
   WHERE n.nspname = 'public'
     AND c.relname = 'products'
     AND a.attname = 'tag'
     AND ty.typname = 'product_tag'
     AND a.attnum > 0
     AND NOT a.attisdropped;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'products.tag is not a nullable product_tag column';
  END IF;

  -- The four shapes that must be accepted: untagged, and each of the three.
  INSERT INTO _tag_probe (
    product_type, billing_mode, topic, spoken_language_code, is_remote,
    timezone, registration_opens_at, created_by,
    for_gamers, for_parents, min_age, max_age, tag
  )
  SELECT
    'consumer_club', 'free', 'minecraft_java', 'en', true,
    'Europe/Helsinki', now(), gen_random_uuid(),
    true, false, 7, 12, probe.tag_value
  FROM unnest(ARRAY[
    NULL::public.product_tag, 'neuroinclusive', 'beginner', 'advanced'
  ]) AS probe(tag_value);

  SELECT count(*) = 4 AND count(tag) = 3 INTO v_ok FROM _tag_probe;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'the probe did not accept an untagged row plus each of the three tags';
  END IF;

  -- And one that must not be. A value outside the enum fails as
  -- invalid_text_representation at the cast, which is the enum constraining
  -- the column rather than a CHECK doing it.
  BEGIN
    INSERT INTO _tag_probe (
      product_type, billing_mode, topic, spoken_language_code, is_remote,
      timezone, registration_opens_at, created_by,
      for_gamers, for_parents, min_age, max_age, tag
    ) VALUES (
      'consumer_club', 'free', 'minecraft_java', 'en', true,
      'Europe/Helsinki', now(), gen_random_uuid(),
      true, false, 7, 12, 'popular'
    );
    RAISE EXCEPTION 'products.tag accepted a value outside product_tag';
  EXCEPTION WHEN invalid_text_representation THEN
    NULL;
  END;

  -- --- (c) One function each, and p_tag among the defaulted parameters. ----
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
       'p_tag' = ANY (p.proargnames)
       -- 1-based position; a parameter is defaulted iff it sits in the tail.
       AND array_position(p.proargnames, 'p_tag') > p.pronargs - p.pronargdefaults
     );
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'p_tag is missing or non-defaulted on: %', v_offend;
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

DROP TABLE _tag_probe;
