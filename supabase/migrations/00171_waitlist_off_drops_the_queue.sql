-- 00171: turning a product's waitlist off deletes the queue behind it.
--
-- WHY. `waitlist_enabled` is the flag the admin groups panel keys its waitlist
-- column to, and the admin form derives it from the cap
-- (`waitlist = uncapped ? false : checkbox`) — so an admin can turn it off two
-- ways: by unticking the box, or by choosing Unlimited seats. Until now neither
-- edit touched the rows already queued. They stayed in `participations` with
-- status 'waitlisted', still counted by the parent-facing "you're #N" read,
-- still occupying the product's uniqueness index — and reachable by no admin
-- affordance at all, because the column that promotes or removes them is drawn
-- only for a waitlist-enabled product. Stranded on both sides, silently.
--
-- THE DECISION (owner's, Aug 2026): the rows are DELETED. Uniformly, on every
-- product type. The two alternatives were weighed and rejected:
--
--   * Keeping them is the status quo — a queue nobody can see, work, or leave
--     by any route the panel offers.
--   * Promoting them instead would hand out seats: on a subscription-billed
--     club that means an active participation with no subscription behind it,
--     i.e. a free seat created by an edit to a checkbox.
--
-- Deletion is clean precisely because of what the triggering edit did to the
-- product: turning the waitlist off means the product now has seats open (it
-- was uncapped, or the queue behind its cap was abandoned), so every family
-- dropped here can come back through the FRONT DOOR and end up in a better
-- state than the queue they were in — a free product re-enrolls instantly, a
-- paid one goes through checkout, which is the step that creates the
-- subscription the promote path could never have created for them.
--
-- KNOWN, ACCEPTED IMPACT: this drops families out of a queue and tells them
-- nothing. No confirmation on the way out, no warning, no email — all three
-- were explicitly declined. The judgement behind that: an edit that turns off a
-- waitlist holding people is far more likely to be an accident (an admin
-- flipping seats to Unlimited without thinking about the queue) than a
-- considered eviction, and a dialog in front of an accident is a dialog the
-- admin clicks through. What the families lose is a place in a line for a
-- product that, as of this edit, is no longer full.
--
-- THE ONE CARVE-OUT — a waitlisted row carrying a LIVE subscription is never
-- deleted. `family_subscriptions.participation_id` is ON DELETE CASCADE, so
-- deleting such a row would drop our only record of a subscription Stripe keeps
-- billing: exactly the hazard `demote_to_waitlist` and
-- `admin_remove_participation` refuse for, and this statement is the third
-- caller that must not walk into it. "Live" is 00170's predicate — a
-- family_subscriptions row with status <> 'cancelled' — so a dunning-dead
-- subscription does NOT protect a row from being dropped here, for the same
-- reason it does not block the other two: it will never bill again.
--
-- Such a row is a webhook-race ghost and is effectively unreachable: joining a
-- waitlist creates no subscription, and demotion refuses a subscribed row, so
-- the only way in is a demote landing inside the window between a Checkout
-- Session completing and the webhook writing family_subscriptions (or the
-- manual sub-adoption process writing one directly). It is skipped silently —
-- there is no admin surface here to report it on, and refusing the whole edit
-- over a ghost row would block the product form on a state nobody can see.
--
-- HEAL-ON-WRITE. The delete is keyed to the flag's value AFTER the update, not
-- to the flag changing, so it runs on every save of a waitlist-off product.
-- That is deliberate: any queue stranded by an edit made before this migration
-- is cleared by the next save of anything at all on that product, which is the
-- same shape the form already uses for the seat/waitlist pairing itself.
--
-- TWO THINGS THIS MIGRATION HAD TO CHANGE TO MAKE THAT STATEMENT LEGAL:
--
--   1. THE PRODUCT LOCK. update_product did NOT take one — it opened with an
--      `IF NOT EXISTS (SELECT 1 FROM products …)` existence probe, which reads
--      nothing and blocks nobody. Every participation RPC that mutates a
--      product's roster serializes on `SELECT … FROM products WHERE id = …
--      FOR UPDATE`, and this function now deletes from that roster, so it takes
--      the same gate. Without it a `join_waitlist` running concurrently could
--      insert a queue row after this delete has scanned past it and leave the
--      queue non-empty on a product whose waitlist is off. The probe is
--      replaced by the locking read rather than added beside it — same
--      no_data_found error, same position, one statement.
--
--   2. SECURITY DEFINER. update_product was SECURITY INVOKER: its guard ran as
--      the caller and every write went through the admin's own RLS. That works
--      for the tables it writes (`products`, translations, slots, prices,
--      calendars, staff details — all of which grant the admin's role the
--      commands they need) and it does NOT work for `participations`, which
--      grants `authenticated` nothing but SELECT by design: every write to that
--      table goes through a SECURITY DEFINER RPC. An invoker-rights DELETE
--      there fails with "permission denied for table participations".
--
--      This is the same elevation 00119 made to promote_from_waitlist and
--      demote_to_waitlist, for the identical reason, and it is safe on the
--      identical grounds: the function's FIRST statement is
--      `PERFORM public.assert_admin();`, it already carries `SET search_path TO
--      ''` and schema-qualifies every reference, and CREATE OR REPLACE leaves
--      its grants (authenticated + service_role) untouched. What is given up is
--      one layer of defence in depth — RLS was a second opinion behind the
--      guard on the other tables — which is why the DO block below asserts the
--      guard is present AND that it precedes the delete.
--
--      The alternative considered and rejected: a separate SECURITY DEFINER
--      helper holding just the delete. It would have had to be granted to
--      `authenticated` to be callable from an invoker-rights update_product,
--      which is a new public RPC with exactly one caller — more exposed surface
--      than the elevation it was meant to avoid.
--
-- Everything else in the body is copied verbatim from the live function
-- (verified byte-identical against pg_proc.prosrc before editing).

CREATE OR REPLACE FUNCTION public.update_product(
  p_id uuid,
  p_billing_mode public.billing_mode,
  p_translations jsonb,
  p_topic public.product_topic,
  p_min_age integer,
  p_max_age integer,
  p_spoken_language_code text,
  p_is_remote boolean,
  p_timezone text,
  p_registration_opens_at timestamp with time zone,
  p_is_visible boolean DEFAULT false,
  p_waitlist_enabled boolean DEFAULT true,
  p_image_path text DEFAULT NULL::text,
  p_location_id uuid DEFAULT NULL::uuid,
  p_signup_threshold integer DEFAULT NULL::integer,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date,
  p_seat_count integer DEFAULT NULL::integer,
  p_schedule_slots jsonb DEFAULT NULL::jsonb,
  p_prices jsonb DEFAULT NULL::jsonb,
  p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[],
  p_primary_gedu_fee_cents integer DEFAULT NULL::integer,
  p_assistant_gedu_fee_cents integer DEFAULT NULL::integer,
  p_municipality_fee_cents integer DEFAULT NULL::integer,
  p_material_url text DEFAULT NULL::text
) RETURNS uuid
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

  UPDATE public.products SET
    billing_mode             = p_billing_mode,
    topic                    = p_topic,
    min_age                  = p_min_age,
    max_age                  = p_max_age,
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

COMMENT ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, integer, integer, text, boolean, text, timestamp with time zone, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text) IS
  'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, holiday calendars and the staff-only material link, under the product gate lock. Since 00171 it also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so it also heals a queue stranded before the rule existed. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'', 00170''s predicate) is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER since 00171 — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function.';

-- ---------------------------------------------------------------------------
-- Grants — restated exactly as they stood.
-- ---------------------------------------------------------------------------
--
-- CREATE OR REPLACE keeps the ACL (and the REVOKE from PUBLIC that goes with
-- it), but a migration says out loud who may execute what it wrote. Unchanged
-- by this migration: the admin form calls this from the browser as
-- `authenticated`, and service_role holds it for the admin-client routes.

GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, integer, integer, text, boolean, text, timestamp with time zone, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, integer, integer, text, boolean, text, timestamp with time zone, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Assert the end state
-- ---------------------------------------------------------------------------
--
-- Source-level, as in 00166/00167/00170: a migration runs against a schema with
-- no rows, so there is no queued participation here to delete and a behavioural
-- probe would pass on the un-migrated function as readily as on this one. The
-- behaviour is pinned where fixtures exist — tests/db/update-product.test.ts.
-- What is worth asserting here is what a long-body replace can silently get
-- wrong: pasting the pre-branch body back (losing the delete), losing the
-- carve-out (which would cascade a live subscription away), losing the lock the
-- delete needs, or losing the guard that is now the function's only gate.

DO $$
DECLARE
  v_sig TEXT := 'public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, integer, integer, text, boolean, text, timestamptz, boolean, boolean, text, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text)';
  v_src TEXT;
BEGIN
  SELECT prosrc INTO v_src FROM pg_catalog.pg_proc WHERE oid = v_sig::regprocedure;

  -- The deletion clause itself.
  IF v_src NOT LIKE '%DELETE FROM public.participations%' THEN
    RAISE EXCEPTION 'update_product no longer deletes the waitlist when the flag goes off';
  END IF;
  IF v_src NOT LIKE '%IF NOT p_waitlist_enabled THEN%' THEN
    RAISE EXCEPTION 'update_product deletes participations without keying the delete to waitlist_enabled';
  END IF;
  IF v_src NOT LIKE '%status = ''waitlisted''%' THEN
    RAISE EXCEPTION 'update_product''s delete is not confined to waitlisted rows';
  END IF;

  -- The carve-out. Losing this is the dangerous failure, not a cosmetic one:
  -- family_subscriptions cascades, so an unguarded delete drops the only record
  -- of a subscription Stripe keeps billing.
  IF v_src NOT LIKE '%family_subscriptions%'
     OR v_src NOT LIKE '%status <> ''cancelled''%' THEN
    RAISE EXCEPTION 'update_product''s waitlist delete lost its live-subscription carve-out';
  END IF;
  IF strpos(v_src, 'NOT EXISTS') = 0 THEN
    RAISE EXCEPTION 'update_product''s waitlist delete no longer excludes the live-subscription rows';
  END IF;

  -- The lock the delete needs to be safe against a concurrent join.
  IF v_src NOT LIKE '%FROM public.products WHERE id = p_id FOR UPDATE%' THEN
    RAISE EXCEPTION 'update_product lost the product gate lock';
  END IF;

  -- Guard-first, and demonstrably ahead of the delete — the authorization
  -- spine reads the first statement, and SECURITY DEFINER makes it the only
  -- thing between a caller and this write.
  IF v_src NOT LIKE '%PERFORM public.assert_admin();%' THEN
    RAISE EXCEPTION 'update_product lost its admin guard across the replace';
  END IF;
  IF strpos(v_src, 'PERFORM public.assert_admin();')
       > strpos(v_src, 'DELETE FROM public.participations') THEN
    RAISE EXCEPTION 'update_product deletes participations before it checks the caller is an admin';
  END IF;

  -- The elevation, without which the delete is a permission error.
  IF NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = v_sig::regprocedure) THEN
    RAISE EXCEPTION 'update_product is not SECURITY DEFINER — its participations delete cannot run as the caller';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc
     WHERE oid = v_sig::regprocedure
       AND 'search_path=""' = ANY (proconfig)
  ) THEN
    RAISE EXCEPTION 'update_product is SECURITY DEFINER without a pinned empty search_path';
  END IF;

  -- Grants intact, and no wider than they were.
  IF NOT pg_catalog.has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute update_product';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute update_product';
  END IF;
  IF pg_catalog.has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'update_product is reachable by anon';
  END IF;
END;
$$;
