-- Every product names the date it starts.
--
-- WHAT THIS IS FOR
--
-- A product's lifecycle follows from two calendar dates and nothing else.
-- start_date becomes NOT NULL, so every product has a day it begins, and the
-- lifecycle a reader sees is pending, running or completed. There is no longer
-- a second way for a product to start: a count of signups it had to reach first
-- is gone from the table, from both product writers and from the derivation.
--
-- WHY THE FOURTH LIFECYCLE VALUE GOES WITH IT
--
-- `expired` meant "the end date passed on a product that never started". With
-- start_date NOT NULL and chk_products_date_range already refusing an end_date
-- earlier than the start, a product that has not started cannot have ended:
-- today < start_date <= end_date. The value is unreachable by construction, and
-- an unreachable enum member is one every reader has to write a branch for and
-- no writer can ever produce.
--
-- HOW THE TYPE IS REBUILT
--
-- Postgres cannot remove a value from an enum in place, so the type is rebuilt
-- exactly as 00256 rebuilt it: rename the old one aside, create the three-value
-- replacement, repoint the single object whose SIGNATURE depends on it
-- (effective_status — pg_depend was read and it is the only one), and drop the
-- old. The DROP is deliberately un-CASCADEd, so anything still depending on the
-- old type fails this migration loudly rather than being silently deleted.
--
-- create_participation names the type in a DECLARE (`v_eff_status`) and is NOT
-- rewritten here. A plpgsql local's type is resolved by name when the body is
-- compiled and is never recorded in pg_depend, so the variable binds to the
-- rebuilt type on its next compile, and the gate it feeds — refusing anything
-- outside ('pending', 'running') — is untouched by the disappearance of a value
-- neither arm names. Section 5 asserts that linkage against the live catalog
-- rather than leaving it to this paragraph's word, which is the cheaper half of
-- the trade: re-emitting a 200-line enrolment body to change nothing in it is
-- the one schema edit two branches cannot merge, where the last writer silently
-- wins.
--
-- NO BACKFILL
--
-- Staging and production were both read before this was written (2026-09-21,
-- 113 and 186 products): zero rows carry a signup threshold and zero are
-- missing a start date. SET NOT NULL therefore validates straight through and
-- the column drops with nothing to move first.

-- ---------------------------------------------------------------------------
-- 1. The threshold column goes, with the two constraints that name it.
-- ---------------------------------------------------------------------------
-- Dropping the column would take both CHECKs with it, but naming them is what
-- makes this statement readable as the whole of the removal: a constraint left
-- unnamed here is one a reader has to go and look for.

ALTER TABLE public.products
  DROP CONSTRAINT chk_products_threshold_within_seat_count,
  DROP CONSTRAINT products_signup_threshold_check,
  DROP COLUMN signup_threshold;

-- ---------------------------------------------------------------------------
-- 2. A product always has a start date.
-- ---------------------------------------------------------------------------
-- This is what makes `expired` unreachable in section 3 and what collapses the
-- derivation to a single date comparison. chk_products_date_range already keeps
-- end_date on or after start_date, so the two together fix the order of every
-- product's calendar: start, then end, then nothing.

ALTER TABLE public.products
  ALTER COLUMN start_date SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. The lifecycle enum holds only the states a product can reach.
-- ---------------------------------------------------------------------------

ALTER TYPE public.effective_product_status RENAME TO effective_product_status_old;

CREATE TYPE public.effective_product_status AS ENUM (
  'pending',
  'running',
  'completed'
);

COMMENT ON TYPE public.effective_product_status IS 'The lifecycle a reader sees, computed at read time and stored nowhere: pending (the start date has not arrived), running (it has, and the end date has not passed), completed (it has, and the end date has passed). Derived from start_date and end_date alone, each compared against today in the product''s own timezone. There is no state for a product whose end date passed while it was still pending: start_date is NOT NULL and chk_products_date_range keeps end_date on or after it, so a product that has not started cannot have ended.';

DROP FUNCTION public.effective_status(uuid);

CREATE FUNCTION public.effective_status(p_product_id uuid) RETURNS public.effective_product_status
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start_date  DATE;
  v_end_date    DATE;
  v_timezone    TEXT;
  v_now_local   DATE;
  v_end_passed  BOOLEAN;
BEGIN
  SELECT start_date, end_date, timezone
    INTO v_start_date, v_end_date, v_timezone
    FROM public.products
    WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- start_date and end_date are calendar dates in the product's OWN timezone
  -- rather than instants, so "today" has to be read in that zone too: a club in
  -- Helsinki starts on its start date in Helsinki, whatever the server thinks
  -- the date is.
  v_now_local := (NOW() AT TIME ZONE v_timezone)::DATE;
  v_end_passed := v_end_date IS NOT NULL AND v_end_date < v_now_local;

  -- A product with no end date never leaves running, which is the ordinary
  -- shape of an open-ended consumer club.
  IF v_start_date <= v_now_local THEN
    RETURN CASE WHEN v_end_passed THEN 'completed' ELSE 'running' END;
  END IF;

  RETURN 'pending';
END;
$$;

COMMENT ON FUNCTION public.effective_status(p_product_id uuid) IS 'The lifecycle of one product, derived from its own two dates. Nothing about the answer is stored, so nothing can be stale: a product is pending until its start date arrives, running from then on, and completed once its end date has passed; one with no end date never leaves running. Every comparison is against today in the product''s OWN timezone, because start_date and end_date are calendar dates in that zone rather than instants. There is deliberately no answer for "ended without ever starting": start_date is NOT NULL and chk_products_date_range keeps end_date on or after it, so today < start_date <= end_date and the state cannot arise. SECURITY DEFINER with search_path pinned, and granted to service_role alone — the browser never asks this question, and a policy that needs it answered asks the date comparison inline rather than dragging a DEFINER function into the authorization spine to decide what two columns already decide (see can_read_product).';

REVOKE EXECUTE ON FUNCTION public.effective_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_status(uuid) TO service_role;

DROP TYPE public.effective_product_status_old;

-- ---------------------------------------------------------------------------
-- 4. Neither product writer takes a threshold.
-- ---------------------------------------------------------------------------
-- Losing a parameter is a new signature, so each function is DROPped by its
-- full old argument list and recreated rather than replaced — a CREATE OR
-- REPLACE cannot change the arity, and leaving the old one standing would make
-- every existing call ambiguous. Both bodies below are the ones in
-- supabase/schema.sql, with the argument and its column removed from the INSERT
-- and the UPDATE respectively and nothing else changed: create_product is still
-- SECURITY INVOKER with assert_admin() as its first statement, update_product
-- is still SECURITY DEFINER taking the product gate lock.
--
-- p_start_date keeps its DEFAULT. The column behind it is now NOT NULL, so an
-- omitting caller is refused loudly by the column rather than creating — or
-- silently blanking — a product with no day it begins. That is the same shape
-- p_requires_gamer_creations has, where the column refuses the explicit null a
-- defaulted argument would otherwise wave through.

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false, p_invoice_customer_id uuid DEFAULT NULL::uuid) RETURNS uuid
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
    location_id, is_remote,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents,
    for_gamers, for_parents, tag, region_lock_country,
    requires_gamer_creations, invoice_customer_id
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
    -- The Fennoa customer (00268). Null is the ordinary state and the CHECK
    -- refuses one on any product that is not a municipality club.
    p_invoice_customer_id
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

  -- The enrolment conditions (00210). Delegated rather than written inline
  -- because this function is SECURITY INVOKER and product_required_consents
  -- carries no write grant for `authenticated` — the guarded DEFINER writer is
  -- what makes that possible. Unconditional: NULL means "requires nothing",
  -- which on a create is the same as doing nothing, and calling it anyway keeps
  -- this function and update_product reading identically.
  PERFORM public.set_product_required_consents(v_product_id, p_required_consent_slugs);

  RETURN v_product_id;
END;
$$;

COMMENT ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, the staff-only material link and, since 00210, the consent documents enrolling on it requires. Since 00256 it takes NO status: a product''s lifecycle is derived from its dates, so there is nothing for a creating caller to choose and nothing stored for a later reader to mistake for a fact. p_start_date is defaulted like every other optional argument, but since 00279 the column behind it is NOT NULL — an omitting caller is refused by the column rather than creating a product with no day it begins. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag (00178) IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country (00193) is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. p_required_consent_slugs (00210) is defaulted on the same argument and is NOT written inline: this function is SECURITY INVOKER and product_required_consents carries no write grant, so the row goes through set_product_required_consents, the join table''s single guarded writer. p_requires_gamer_creations (00227) is defaulted to FALSE rather than to null, because the column is NOT NULL and false is the resting state of that whole feature — so an omitting caller creates an unflagged product, which is what omission should mean, and an explicit null is refused loudly by the column rather than silently becoming false. p_invoice_customer_id (00268) is defaulted on the same argument as p_tag — null is legal, nothing backstops its absence, and codegen cannot express an explicit null — and names the FENNOA CUSTOMER a municipality club is invoiced to; it is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type. This function does NOT take a picture: 00198 dropped p_image_path, because a product''s picture is the product_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone.';

REVOKE EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) TO service_role;

DROP FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid);

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

COMMENT ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) IS 'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, the staff-only material link and — since 00210 — the set of consent documents enrolling on it requires, under the product gate lock. Since 00171 it also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so it also heals a queue stranded before the rule existed. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'', 00170''s predicate) is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER since 00171 — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. Since 00173 it assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. Since 00178 it also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. Since 00193 it assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested. start_date is the one editable column omission CANNOT clear: since 00279 it is NOT NULL, so an omitting caller is refused by the column rather than quietly blanking the date on a live product. Since 00198 it does NOT assign image_path and takes no p_image_path: that column is derived from image_id by trg_products_apply_image_path on this very UPDATE, so the assignment was always overwritten a moment later. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone. Since 00210 p_required_consent_slugs replaces the requirement set through set_product_required_consents — NULL clears it, and past acceptances are never touched, because dropping a requirement changes what future enrolments must agree to and says nothing about what past ones did. Since 00227 it assigns requires_gamer_creations, whose parameter defaults FALSE rather than null because the column is NOT NULL — so an omitting caller unflags the product, the same "omission clears it" semantics tag has, kept deliberate by the required wire field. Since 00268 it assigns invoice_customer_id, the FENNOA CUSTOMER a municipality club is invoiced to — tag''s shape exactly, a defaulted parameter whose omission clears the link, kept deliberate by a required-nullable wire field, and editable for the club''s whole life because who buys a club can change between terms. It is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type.';

REVOKE EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. End-state assertions.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_labels  TEXT[];
  v_count   INTEGER;
  v_src     TEXT;
BEGIN
  -- --- (a) The threshold is gone from the table. --------------------------
  IF EXISTS (
    SELECT 1
      FROM pg_attribute a
     WHERE a.attrelid = 'public.products'::regclass
       AND a.attname = 'signup_threshold'
       AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'products.signup_threshold still exists — a second way for a product to start would survive the derivation that no longer reads it';
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_constraint c
   WHERE c.conrelid = 'public.products'::regclass
     AND c.conname IN ('chk_products_threshold_within_seat_count', 'products_signup_threshold_check');
  IF v_count <> 0 THEN
    RAISE EXCEPTION '% threshold constraint(s) still on products — the column drop should have taken them', v_count;
  END IF;

  -- --- (b) Every product names the date it starts. ------------------------
  IF NOT EXISTS (
    SELECT 1
      FROM pg_attribute a
     WHERE a.attrelid = 'public.products'::regclass
       AND a.attname = 'start_date'
       AND a.attnotnull
  ) THEN
    RAISE EXCEPTION 'products.start_date is still nullable — a product nothing could start is still writable, and `expired` was dropped on the promise that it is not';
  END IF;

  -- --- (c) The enum holds the three reachable states and nothing else. ----
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO v_labels
    FROM pg_enum e
   WHERE e.enumtypid = 'public.effective_product_status'::regtype;
  IF v_labels IS DISTINCT FROM ARRAY['pending', 'running', 'completed'] THEN
    RAISE EXCEPTION 'effective_product_status is % — expected exactly (pending, running, completed)', v_labels;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typname = 'effective_product_status_old'
  ) THEN
    RAISE EXCEPTION 'effective_product_status_old is still here — the rebuilt type has a twin, and a later reader cannot tell which one an object points at';
  END IF;

  -- --- (d) The one signature-level dependent points at the new type. ------
  IF (SELECT p.prorettype FROM pg_proc p WHERE p.oid = 'public.effective_status(uuid)'::regprocedure)
       <> 'public.effective_product_status'::regtype THEN
    RAISE EXCEPTION 'effective_status does not return public.effective_product_status — it was recreated against something else';
  END IF;

  -- --- (e) create_participation's gate still binds to that type. ----------
  -- Its body was deliberately left alone, on the reasoning that a plpgsql
  -- local resolves its type by name at compile time. That reasoning is only
  -- worth anything while the body still names the type and still gates on two
  -- labels the type still has, so it is checked here rather than asserted in
  -- the header.
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
   WHERE p.oid = 'public.create_participation(uuid, uuid, uuid, text, text, text[])'::regprocedure;
  IF v_src !~ 'public\.effective_product_status' THEN
    RAISE EXCEPTION 'create_participation no longer declares a public.effective_product_status local — the enrolment gate is reading something this migration did not rebuild';
  END IF;
  IF v_src !~ 'NOT IN\s*\(\s*''pending''\s*,\s*''running''\s*\)' THEN
    RAISE EXCEPTION 'create_participation no longer gates on (pending, running) — this migration left its body alone on the understanding that it does';
  END IF;

  -- --- (f) One arity each of the product writers, neither taking a --------
  -- --- threshold. A dropped parameter that left the old overload behind ---
  -- --- makes every call ambiguous rather than failing loudly. -------------
  SELECT count(*) INTO v_count
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('create_product', 'update_product');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'found % create_product/update_product functions, expected 2 — an old arity is still standing beside the new one', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p, unnest(p.proargnames) AS n
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('create_product', 'update_product')
       AND n = 'p_signup_threshold'
  ) THEN
    RAISE EXCEPTION 'a product writer still takes p_signup_threshold — there is no column left for it to write';
  END IF;

  -- --- (g) Everything dropped and recreated got its grants back. ----------
  -- A recreated function comes back PUBLIC-executable; the REVOKEs above are
  -- what take that away, and this is what proves they ran.
  IF has_function_privilege('anon', 'public.effective_status(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.effective_status(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'effective_status is executable by a browser role — it is SECURITY DEFINER and service_role only';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.effective_status(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'effective_status is not executable by service_role — every admin surface that asks for a lifecycle would fail closed';
  END IF;

  IF has_function_privilege('anon', 'public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a product writer is executable by anon — the recreate left it PUBLIC-executable';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a product writer lost a grant in the recreate — the admin product form would fail closed';
  END IF;
END;
$assert$;
