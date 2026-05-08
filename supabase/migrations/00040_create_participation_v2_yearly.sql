-- Allow yearly subscriptions through create_participation_v2.
--
-- Plan §"Explicit out-of-scope" originally listed yearly as deferred, but
-- the rate is already wired (SUBSCRIPTION_DISCOUNTS.yearly = 0.30, the
-- subscription_frequency_v2 enum includes 'yearly', and the parent pricing
-- UI surfaces it). Closing the loop on the RPC validation.

CREATE OR REPLACE FUNCTION create_participation_v2(
  p_product_id      UUID,
  p_gamer_id        UUID,
  p_customer_id     UUID,
  p_purchase_shape  TEXT,
  p_currency        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product               public.products_v2;
  v_eff_status            public.effective_product_status_v2;
  v_seats_taken           INTEGER;
  v_existing_id           UUID;
  v_existing_status       public.participation_status_v2;
  v_participation_id      UUID;
  v_reserved_until        TIMESTAMPTZ;
  v_is_parent             BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products_v2 WHERE id = p_product_id FOR UPDATE;
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

  v_eff_status := public.effective_status_v2(p_product_id);
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
    'bundle_1', 'bundle_4', 'bundle_10',
    'subscription_monthly', 'subscription_quarterly', 'subscription_yearly',
    'single_payment', 'free'
  ) THEN
    RAISE EXCEPTION 'unsupported purchase shape: %', p_purchase_shape
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations_v2
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
      AND status IN ('active', 'waitlisted')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a % participation on this product', p_gamer_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations_v2 (
      product_id, gamer_id, customer_id, status, credits_remaining
    ) VALUES (
      p_product_id, p_gamer_id, p_customer_id, 'active', 0
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'free_active',
      'participation_id', v_participation_id
    );
  END IF;

  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_seats_taken_v2(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  v_reserved_until := NOW() + INTERVAL '30 minutes';
  INSERT INTO public.participations_v2 (
    product_id, gamer_id, customer_id, status, reserved_until, credits_remaining
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'reserving', v_reserved_until, 0
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'kind', 'reserving',
    'participation_id', v_participation_id,
    'reserved_until', v_reserved_until
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_participation_v2(UUID, UUID, UUID, TEXT, TEXT) FROM authenticated, anon, public;
