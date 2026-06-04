-- Drop the session-balance / session-credit concept and the bundle purchase
-- shapes that depended on it for enforcement.
--
-- The credit counter (`participations.credits_remaining`) was the only thing
-- that gave a bundle meaning — buy N sessions, decrement one per session via
-- the hourly cron. It was never read by the app (purely backend plumbing), so
-- we remove the whole apparatus:
--   * the hourly cron + its function `process_session_credits()`
--   * the helper `apply_credit_motion()` and its ledger `credit_deductions`
--   * the unused `session_cancellations` table (only ever in generated types)
--   * the `participations.credits_remaining` column
--   * the `bundle_1 / bundle_4 / bundle_10` purchase shapes
--
-- The participation RPCs that touched credits/bundles are recreated without
-- that logic. `confirm_reservation` loses its `p_credits_to_grant` parameter
-- (a signature change, so it is dropped and recreated). All of these functions
-- are admin-client-only (service role) and were REVOKEd from
-- authenticated/anon/public; the recreations re-assert that.

-- 1. Stop and drop the credit cron + its functions.
SELECT cron.unschedule('process-session-credits-v2');

DROP FUNCTION IF EXISTS public.process_session_credits();
DROP FUNCTION IF EXISTS public.apply_credit_motion(uuid, date, integer, text);

-- 2. Recreate participation RPCs without credit/bundle logic.

-- confirm_reservation: drop the p_credits_to_grant parameter (signature change).
DROP FUNCTION IF EXISTS public.confirm_reservation(uuid, integer);
CREATE OR REPLACE FUNCTION public.confirm_reservation(p_reservation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_product_id   UUID;
  v_gamer_id     UUID;
  v_customer_id  UUID;
  v_status       public.participation_status;
  v_conflict_id  UUID;
BEGIN
  SELECT product_id, gamer_id, customer_id, status
    INTO v_product_id, v_gamer_id, v_customer_id, v_status
    FROM public.participations
    WHERE id = p_reservation_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'orphan');
  END IF;

  -- Idempotent replay of the same reservation's webhook.
  IF v_status = 'active' THEN
    RETURN jsonb_build_object(
      'kind', 'confirmed',
      'participation_id', p_reservation_id,
      'product_id', v_product_id,
      'gamer_id', v_gamer_id,
      'customer_id', v_customer_id,
      'idempotent', TRUE
    );
  END IF;

  IF v_status <> 'reserving' THEN
    RETURN jsonb_build_object('kind', 'orphan');
  END IF;

  -- Pre-check the partial UNIQUE: is there another non-reserving row for
  -- this (product, gamer)? If so, the parent already has a confirmed seat
  -- (or waitlist position) from a different reservation, and this Stripe
  -- payment is a duplicate. Return early so the route layer can refund.
  SELECT id
    INTO v_conflict_id
    FROM public.participations
    WHERE product_id = v_product_id
      AND gamer_id   = v_gamer_id
      AND id        <> p_reservation_id
      AND status    IN ('active', 'waitlisted', 'completed')
    LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'kind', 'duplicate_payment',
      'reservation_id', p_reservation_id,
      'existing_participation_id', v_conflict_id,
      'product_id', v_product_id,
      'gamer_id', v_gamer_id,
      'customer_id', v_customer_id
    );
  END IF;

  UPDATE public.participations
     SET status = 'active',
         reserved_until = NULL
   WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'kind', 'confirmed',
    'participation_id', p_reservation_id,
    'product_id', v_product_id,
    'gamer_id', v_gamer_id,
    'customer_id', v_customer_id,
    'idempotent', FALSE
  );
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.confirm_reservation(uuid) FROM authenticated, anon, public;

-- cancel_participation: drop the forfeited_credits read + return field.
CREATE OR REPLACE FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_product_id                  UUID;
  v_status                      public.participation_status;
  v_stripe_subscription_item_id TEXT;
  v_family_subscription_id      UUID;
BEGIN
  SELECT product_id, status
    INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Pull linked Stripe item before delete (CASCADE removes the row).
  SELECT stripe_subscription_item_id, family_subscription_id
    INTO v_stripe_subscription_item_id, v_family_subscription_id
    FROM public.family_subscription_items
    WHERE participation_id = p_participation_id
    LIMIT 1;

  DELETE FROM public.participations WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'cancelled',
    'product_id', v_product_id,
    'previous_status', v_status::text,
    'stripe_subscription_item_id', v_stripe_subscription_item_id,
    'family_subscription_id', v_family_subscription_id,
    'reason', p_reason
  );
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.cancel_participation(uuid, text) FROM authenticated, anon, public;

-- create_participation: drop bundle shapes from the CHECK; stop seeding credits.
CREATE OR REPLACE FUNCTION public.create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_product               public.products;
  v_eff_status            public.effective_product_status;
  v_seats_taken           INTEGER;
  v_existing_id           UUID;
  v_existing_status       public.participation_status;
  v_participation_id      UUID;
  v_reserved_until        TIMESTAMPTZ;
  v_is_parent             BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_gamer_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_eff_status := public.effective_status(p_product_id);
  IF v_eff_status NOT IN ('pending', 'running') THEN
    RAISE EXCEPTION 'product is not accepting signups (effective status: %)', v_eff_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_product.registration_opens_at IS NOT NULL
     AND v_product.registration_opens_at > NOW() THEN
    RAISE EXCEPTION 'registration has not yet opened'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_currency NOT IN ('eur', 'gbp', 'usd') THEN
    RAISE EXCEPTION 'unsupported currency: %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_purchase_shape NOT IN (
    'subscription_monthly', 'subscription_quarterly', 'subscription_yearly',
    'single_payment', 'free'
  ) THEN
    RAISE EXCEPTION 'unsupported purchase shape: %', p_purchase_shape
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
      AND status IN ('active', 'waitlisted')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a % participation on this product', p_gamer_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Seat-count gate. Sits above the free branch so an explicit cap on a
  -- free product (the schema permits it) is honored — earlier versions
  -- only checked the cap on paid signups, so a free product with
  -- seat_count=20 silently accepted the 21st signup.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_seats_taken(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations (
      product_id, gamer_id, customer_id, status
    ) VALUES (
      p_product_id, p_gamer_id, p_customer_id, 'active'
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'free_active',
      'participation_id', v_participation_id
    );
  END IF;

  v_reserved_until := NOW() + INTERVAL '30 minutes';
  INSERT INTO public.participations (
    product_id, gamer_id, customer_id, status, reserved_until
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'reserving', v_reserved_until
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'kind', 'reserving',
    'participation_id', v_participation_id,
    'reserved_until', v_reserved_until
  );
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text) FROM authenticated, anon, public;

-- join_waitlist: stop seeding credits.
CREATE OR REPLACE FUNCTION public.join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_product           public.products;
  v_existing_id       UUID;
  v_existing_pos      INTEGER;
  v_existing_status   public.participation_status;
  v_next_position     INTEGER;
  v_participation_id  UUID;
  v_is_parent         BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_gamer_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_product.waitlist_enabled THEN
    RAISE EXCEPTION 'waitlist is not enabled for this product'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency: existing waitlisted/reserving/active row → return it as-is.
  SELECT id, waitlist_position, status
    INTO v_existing_id, v_existing_pos, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
      AND status IN ('waitlisted', 'reserving', 'active')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'participation_id', v_existing_id,
      'waitlist_position', v_existing_pos,
      'status', v_existing_status::text
    );
  END IF;

  -- Compute next waitlist position.
  SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted';

  INSERT INTO public.participations (
    product_id, gamer_id, customer_id, status, waitlist_position
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'waitlisted', v_next_position
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_next_position,
    'status', 'waitlisted'
  );
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.join_waitlist(uuid, uuid, uuid) FROM authenticated, anon, public;

-- 3. Drop the credit ledger + the unused session_cancellations table.
--    CASCADE clears their RLS policies and any dependent grants.
DROP TABLE IF EXISTS public.credit_deductions CASCADE;
DROP TABLE IF EXISTS public.session_cancellations CASCADE;

-- 4. Drop the credit counter column (its non-negative CHECK goes with it).
ALTER TABLE public.participations DROP COLUMN IF EXISTS credits_remaining;
