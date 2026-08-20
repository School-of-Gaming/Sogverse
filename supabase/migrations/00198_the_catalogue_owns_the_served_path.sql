-- 00198: the catalogue's invariants move from application code into the schema.
--
-- WHY
--
-- 00196 built the catalogue and left its shape rules in application code alone:
-- that `sha256` holds a hash, and that `path` is that hash plus a stored
-- extension. Both were true the moment 00196 landed and both were true only
-- because every writer happened to behave. This migration moves them into the
-- schema, where a writer that misbehaves fails loudly instead of leaving a row
-- nobody notices — and it finishes the job on `products.image_path`, which
-- becomes unconditionally derived rather than derived-except-for-legacy-rows.
--
-- WHAT CHANGES
--
--   1. `p_image_path` is dropped from `create_product` and `update_product`.
--      Nothing supplies it: the routes stopped passing it when the catalogue
--      shipped, because the trigger overwrote whatever they sent. A parameter
--      no caller fills and no statement can honour is a trap for the next
--      person to read the signature.
--   2. `apply_product_image_path()` is tightened: `image_path` is now derived
--      on EVERY write, including the "no linked entry" case, which now blanks
--      the column instead of preserving whatever it held. The preservation
--      branch existed to keep pre-catalogue pictures alive between 00196 and
--      the fold-in; there are none left.
--   3. Two CHECKs on `product_images`: `sha256` is 64 lowercase hex characters,
--      and `path` is exactly that hash plus one of the stored extensions.
--
-- THE FOLD-IN, AS HISTORY
--
-- The legacy per-product objects were folded into the catalogue by a one-time
-- script on 2026-08-20: staging, 17 imaged products over 15 distinct paths
-- collapsing to 15 entries; production, 113 imaged products over 113 distinct
-- legacy paths collapsing to 44 entries (two municipality-club pictures alone
-- had been stored 24 and 22 times). The superseded legacy objects were deleted
-- the same day, after a verified backup. The script is retired with this
-- migration and its files are gone; the only audit it still had a use for — is
-- every catalogue path backed by an object, and is every object named by a
-- catalogue row — is a join of `product_images.path` against
-- `storage.objects.name` for the `product-images` bucket, which needs no
-- program.
--
-- WHY THE TRIGGER'S PRESERVATION BRANCH GOES
--
-- 00196 shipped ahead of the code that used it, so it had to be inert for the
-- ~110 products that carried a path and no entry. That is what the "leave
-- image_path alone" branch was for, and it was correct for exactly as long as
-- such a product existed. Now that none does, the branch is worse than dead:
-- it is the one path by which `image_path` could still hold something no entry
-- names. Making the column unconditionally derived means the two statements
-- "the product has no entry" and "the product has no picture" cannot come
-- apart — which is the whole invariant, and the reason the next section can
-- say the trigger carries it without a foreign key's help.
--
-- WHY THERE IS NO FOREIGN KEY ON `products.image_path` — DO NOT ADD ONE
--
-- The obvious next move after change 2 is an FK from `products.image_path` to
-- `product_images(path)`, so that Postgres and not a trigger owns "a served
-- path is a catalogue path". It was written, applied to staging, and reverted
-- the same hour, because it breaks every PostgREST embed between these two
-- tables.
--
-- PostgREST resolves `products?select=...,product_images(...)` by finding the
-- relationship between the pair. With one foreign key that is unambiguous;
-- with two — `image_id` and `image_path` — it refuses the whole request with
-- PGRST201, "Could not embed because more than one relationship was found",
-- and every caller has to name the FK it means
-- (`product_images!products_image_id_fkey(...)`). The admin product detail
-- query embeds this table, so the observed effect was every admin product page
-- answering "product not found" — from a migration alone, with no code change
-- and no way for the app to defend itself. Hinting the embeds would work, but
-- it couples this migration to a code release and taxes every embed anyone
-- writes afterwards.
--
-- And it buys nothing. The trigger below carries no column list, so it is the
-- ONLY writer of `image_path`: every statement that names the column is
-- overwritten before any constraint is consulted, with the linked entry's path
-- or with NULL. There is no reachable write for the FK to catch. The invariant
-- is real and enforced; it is enforced by the trigger.
--
-- The general rule, which outlives this column: **a second relationship
-- between `products` and `product_images` may not be added without hinting
-- every existing embed in the same change.**
--
-- THE SHAPE CHECK AND THE APPLICATION'S ACCEPT LIST MOVE TOGETHER
--
-- The extensions in the path CHECK are the extensions an object is STORED
-- under, which is `PRODUCT_IMAGE_MIME_BY_EXT` in
-- `src/services/product-images/product-images.contracts.ts` minus `jpeg` —
-- that key exists so a `.jpeg` upload is accepted, and it normalises to `jpg`
-- before anything is stored. Widening one list without the other breaks in one
-- of two directions: a new extension accepted by the route and refused by this
-- CHECK is an upload that 500s after the bytes are already in the bucket, and
-- one allowed here but not there is a rule that no longer says anything. They
-- are two halves of one decision and belong in one change.
--
-- The pre-existing `path <> ''` CHECK is left in place. It is subsumed by the
-- shape CHECK — an empty path cannot match a 64-character hash — and dropping
-- a constraint to save a redundant comparison on a table written a few times a
-- month is not a trade worth making.

-- ---------------------------------------------------------------------------
-- 1. The RPCs lose p_image_path
-- ---------------------------------------------------------------------------
--
-- A signature change, so both are dropped and recreated — which rebuilds their
-- ACLs from scratch, hence the REVOKE/GRANT block after each. Bodies are
-- otherwise carried over verbatim from the current definitions; the only edits
-- are the parameter and the assignment it fed.

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_status public.product_status DEFAULT 'pending'::public.product_status, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text) RETURNS uuid
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

REVOKE EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO service_role;

COMMENT ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, holiday calendars and the staff-only material link. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag (00178) IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country (00193) is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. This function does NOT take a picture: 00198 dropped p_image_path, because a product''s picture is the product_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path.';

DROP FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text);

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text) RETURNS uuid
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

REVOKE EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) TO service_role;

COMMENT ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, text, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text) IS 'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, holiday calendars and the staff-only material link, under the product gate lock. Since 00171 it also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so it also heals a queue stranded before the rule existed. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'', 00170''s predicate) is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER since 00171 — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. Since 00173 it assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. Since 00178 it also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. Since 00193 it assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested. Since 00198 it does NOT assign image_path and takes no p_image_path: that column is derived from image_id by trg_products_apply_image_path on this very UPDATE, so the assignment was always overwritten a moment later.';

-- ---------------------------------------------------------------------------
-- 2. image_path is derived on every write, with no exceptions left
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_product_image_path()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $$
DECLARE
  v_path text;
BEGIN
  IF NEW.image_id IS NOT NULL THEN
    SELECT path INTO v_path
      FROM public.product_images
     WHERE id = NEW.image_id;

    -- This runs BEFORE the FK — which is an AFTER-row constraint trigger fired
    -- at statement end — so it pre-empts the FK's own check rather than relying
    -- on it. The reachable cause of an empty lookup is that the row is gone
    -- (another admin removed the entry between this admin loading the form and
    -- saving it); RLS hiding it is the other half of the message and the half
    -- 00196's header argues cannot happen. Blanking the picture silently would
    -- be the worst possible answer to either; raise instead, with the SQLSTATE
    -- the FK itself would have used, because it is the same claim made earlier.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'product_images row % does not exist or is not visible to this writer', NEW.image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.image_path := v_path;
  ELSE
    -- No entry, no picture — on UPDATE and INSERT alike, and whatever the
    -- statement said about image_path. 00196 preserved an app-supplied path
    -- here so that the ~110 products carrying a pre-catalogue path survived a
    -- migration released ahead of the code that linked them. That fold-in is
    -- done (00198), so the branch now has only one honest meaning: a product
    -- with no entry has no picture. With no column list on the trigger, this
    -- function is the only writer of image_path — which is why no foreign key
    -- on that column is needed, and why one must not be added (see the header).
    NEW.image_path := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_product_image_path() IS
  'BEFORE INSERT OR UPDATE on products: image_path is derived from the linked '
  'product_images entry, and is NULL whenever image_id is. Since 00198 there '
  'is no branch that preserves an app-supplied path, so this function is the '
  'column''s ONLY writer — which is what carries the invariant that a served '
  'path is a catalogue path, and why there is deliberately no foreign key on '
  'image_path (a second relationship between products and product_images makes '
  'every PostgREST embed ambiguous; see 00198''s header). Carries no column '
  'list on the trigger deliberately, so no statement can name image_path and '
  'win.';

COMMENT ON COLUMN public.products.image_path IS
  'The object key every reader paints. DERIVED, with no exceptions: '
  'trg_products_apply_image_path writes the linked entry''s path on every '
  'products write and NULLs the column whenever image_id is NULL, so an '
  'app-supplied value is always inert and this column has exactly one writer. '
  'It deliberately carries NO foreign key into product_images(path): a second '
  'relationship between these two tables makes every PostgREST embed of '
  'product_images ambiguous (PGRST201) unless every caller hints it, and the '
  'trigger already guarantees what such a key would check. See 00198''s '
  'header before adding one.';

-- CREATE OR REPLACE keeps the existing ACL rather than rebuilding it, so this
-- pair is belt-and-braces rather than load-bearing — but a function whose
-- grants are restated next to its body is a function whose grants get read.
REVOKE ALL ON FUNCTION public.apply_product_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_product_image_path() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The catalogue's own shape
-- ---------------------------------------------------------------------------
--
-- NOT VALID then VALIDATE: adding it in two steps takes the exclusive lock for
-- the DDL only and scans under a weaker one. The table holds tens of rows, so
-- this is form rather than necessity — but the DO block at the foot asserts
-- both constraints came out validated, which is the half that matters, because
-- a NOT VALID constraint left unvalidated silently exempts every existing row.

ALTER TABLE public.product_images
  ADD CONSTRAINT chk_product_images_sha256_is_a_hash
    CHECK (sha256 ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE public.product_images
  ADD CONSTRAINT chk_product_images_path_matches_sha256
    CHECK (path ~ ('^' || sha256 || '\.(jpg|png|webp|avif|svg)$')) NOT VALID;

ALTER TABLE public.product_images VALIDATE CONSTRAINT chk_product_images_sha256_is_a_hash;
ALTER TABLE public.product_images VALIDATE CONSTRAINT chk_product_images_path_matches_sha256;

COMMENT ON CONSTRAINT chk_product_images_sha256_is_a_hash ON public.product_images IS
  'Lowercase hex, exactly 64 characters. The column IS the identity of a '
  'picture, so a value that is not a hash is a row that can never be found '
  'again by the bytes it claims to name.';

COMMENT ON CONSTRAINT chk_product_images_path_matches_sha256 ON public.product_images IS
  'The object key is the hash plus a stored extension and nothing else. The '
  'extension list is the accept list in '
  'src/services/product-images/product-images.contracts.ts minus jpeg, which '
  'is accepted on upload and normalised to jpg before anything is stored — the '
  'two lists must be widened in the same change or an upload the route accepts '
  'is a row this constraint refuses after the bytes are already in the bucket.';

-- ---------------------------------------------------------------------------
-- End state
-- ---------------------------------------------------------------------------
--
-- Assert what is true now rather than trusting the statements above took the
-- branch they look like they took. Apply-time protection: it says what was true
-- when 00198 ran, and nothing about later migrations.

DO $assert$
DECLARE
  v_offend text;
  v_src    text;
  v_count  bigint;
BEGIN
  -- --- The RPCs -------------------------------------------------------------
  -- Exactly one of each: counting the total catches a DROP that took the wrong
  -- signature (leaving none) as well as an overload PostgREST could not
  -- resolve.
  SELECT count(*)
    INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_product', 'update_product');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'the product writers are not exactly one function each (found %)', v_count;
  END IF;

  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_offend
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_product', 'update_product')
     AND 'p_image_path' = ANY (p.proargnames);
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'p_image_path survived on: %', v_offend;
  END IF;

  -- SECURITY mode is not decoration on these two: create_product is INVOKER so
  -- its assert_admin() runs as the caller, update_product is DEFINER because
  -- authenticated holds no write grant on participations. A drop/recreate is
  -- exactly where one could be lost.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_product' AND NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION 'create_product is no longer SECURITY INVOKER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'update_product' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'update_product is no longer SECURITY DEFINER';
  END IF;

  -- A recreated function comes back PUBLIC-executable. Both halves are checked:
  -- that the REVOKE took, and that the GRANTs the admin UI needs came back.
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
     AND NOT (
       has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND has_function_privilege('service_role', p.oid, 'EXECUTE')
     );
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'a product writer lost a role grant it needs: %', v_offend;
  END IF;

  -- --- The trigger function -------------------------------------------------
  SELECT p.prosrc
    INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'apply_product_image_path';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'apply_product_image_path is missing';
  END IF;

  -- The tightened shape: an ELSE that nulls the column, and no TG_OP branch —
  -- the guard the old preservation case needed and the tightened one cannot
  -- have, so its absence is the sharpest evidence the replace took.
  IF v_src NOT LIKE '%ELSE%NEW.image_path := NULL;%END IF;%' THEN
    RAISE EXCEPTION 'apply_product_image_path does not blank image_path when image_id is NULL';
  END IF;
  IF v_src LIKE '%TG_OP%' THEN
    RAISE EXCEPTION 'apply_product_image_path still branches on TG_OP — the preservation case survived';
  END IF;

  IF has_function_privilege('authenticated', 'public.apply_product_image_path()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_product_image_path()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'apply_product_image_path is executable by a Data API role';
  END IF;

  -- The trigger's missing column list is still what makes every writer of
  -- image_path lose; re-asserted here because this migration is the one that
  -- makes the column unconditionally derived.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.products'::regclass
       AND tgname = 'trg_products_apply_image_path'
       AND NOT tgisinternal
       AND COALESCE(array_length(tgattr::int2[], 1), 0) = 0
  ) THEN
    RAISE EXCEPTION 'trg_products_apply_image_path is missing or carries a column list';
  END IF;

  -- --- The CHECKs -----------------------------------------------------------
  FOR v_offend IN
    SELECT c FROM unnest(ARRAY[
      'chk_product_images_sha256_is_a_hash',
      'chk_product_images_path_matches_sha256'
    ]) AS c
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.product_images'::regclass
         AND conname = v_offend
         AND contype = 'c'
         AND convalidated
    ) THEN
      RAISE EXCEPTION '% is missing or was never validated — an unvalidated CHECK exempts every existing row', v_offend;
    END IF;
  END LOOP;

  -- --- products and product_images are related exactly once -----------------
  -- The FK on image_id is the only relationship these two tables may have.
  -- A second one — an FK on the derived image_path column is the tempting one —
  -- makes every PostgREST embed between them ambiguous and answers PGRST201
  -- instead of rows, which the admin product page shows as "product not found".
  SELECT count(*)
    INTO v_count
    FROM pg_constraint
   WHERE conrelid = 'public.products'::regclass
     AND contype = 'f'
     AND confrelid = 'public.product_images'::regclass;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'products has % foreign keys into product_images; exactly one (image_id) is what keeps PostgREST embeds unambiguous', v_count;
  END IF;

  -- --- The invariant that has no constraint behind it -----------------------
  -- With the trigger as image_path's only writer, this is the claim the schema
  -- makes and nothing else checks — so it is checked here, at apply time.
  SELECT count(*)
    INTO v_count
    FROM public.products p
   WHERE p.image_path IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.product_images pi WHERE pi.path = p.image_path
     );
  IF v_count <> 0 THEN
    RAISE EXCEPTION '% products carry an image_path no catalogue entry names', v_count;
  END IF;
END
$assert$;
