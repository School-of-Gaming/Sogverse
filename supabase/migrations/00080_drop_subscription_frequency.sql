-- Collapse subscriptions to monthly-only and drop the "frequency" concept.
--
-- Product model is now one purchase option per type:
--   consumer_club → monthly subscription   (the only subscription cadence)
--   camp          → single upfront payment
--   event         → single upfront payment OR free (unchanged)
--   municipality  → external contract       (unchanged)
--
-- Quarterly / yearly subscriptions are gone, so the `subscription_frequency`
-- enum and the `frequency` columns it backed are dead. We drop them.
--
-- Data note: there are no real subscriptions anywhere (prod has none; staging
-- has only fake rows). Any non-monthly rows are now meaningless AND would
-- collide with the new frequency-free unique keys, so we delete them first.
-- Deleting a family_subscriptions row CASCADEs to its family_subscription_items
-- (the participation rows survive — only the sub linkage drops).

-- 1. Purge now-invalid non-monthly rows before reshaping the keys.
DELETE FROM public.family_subscriptions       WHERE frequency <> 'monthly';
DELETE FROM public.product_subscription_prices WHERE frequency <> 'monthly';

-- 2. family_subscriptions: (customer_id, frequency, currency) → (customer_id, currency).
ALTER TABLE public.family_subscriptions
  DROP CONSTRAINT family_subscriptions_customer_id_frequency_currency_key;
ALTER TABLE public.family_subscriptions DROP COLUMN frequency;
ALTER TABLE public.family_subscriptions
  ADD CONSTRAINT family_subscriptions_customer_id_currency_key
  UNIQUE (customer_id, currency);

-- 3. product_subscription_prices: PK (product_id, frequency, currency) → (product_id, currency).
ALTER TABLE public.product_subscription_prices
  DROP CONSTRAINT product_subscription_prices_pkey;
ALTER TABLE public.product_subscription_prices DROP COLUMN frequency;
ALTER TABLE public.product_subscription_prices
  ADD CONSTRAINT product_subscription_prices_pkey
  PRIMARY KEY (product_id, currency);

-- 4. Drop the now-unused enum.
DROP TYPE public.subscription_frequency;

-- 5. Tighten create_participation: subscription_monthly is the only sub shape.
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
    'subscription_monthly', 'single_payment', 'free'
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
