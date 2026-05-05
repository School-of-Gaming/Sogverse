-- Two follow-ups from the v2 audit pass after the DB tests landed:
--
-- 1. Free products with an explicit seat_count were silently over-fillable.
--    The schema constraint (chk_products_v2_seat_count_null_requires_free)
--    only required seat_count to be NOT NULL when billing_mode<>'free' —
--    free products may set a cap. But create_participation_v2's free path
--    INSERTed an 'active' row before any seat-count check, ignoring the cap.
--    Fix: move the seat-count gate above the free branch so it applies to
--    every paid AND free signup.
--
-- 2. process_session_credits_v2's branch on cancelled-but-late was
--    misleading. The ELSE branch covered both "attended/no-show" and
--    "cancelled but past the 24h window" with the same reason string —
--    a parent disputing a charge couldn't tell the two apart in the audit
--    trail. Split into a dedicated 'bundle_late_cancel_charged' branch.
--    Same delta (-1) — only the reason text changes. Also drop a redundant
--    AND in the bundle_cancel_no_charge branch (v_cancelled_in_window
--    already implies v_was_cancelled).

-- 1. create_participation_v2 — seat-count gate applies to free signups too
-- ----------------------------------------------------------------------------
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

  -- Seat-count gate. Sits above the free branch so an explicit cap on a
  -- free product (the schema permits it) is honored — earlier versions
  -- only checked the cap on paid signups, so a free product with
  -- seat_count=20 silently accepted the 21st signup.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_seats_taken_v2(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
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

-- 2. process_session_credits_v2 — split late-cancel out of the no-show branch
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_session_credits_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_granted   INTEGER := 0;
  v_deducted  INTEGER := 0;
  v_errors    INTEGER := 0;
  v_rec       RECORD;
  v_session_start  TIMESTAMPTZ;
  v_session_date   DATE;
  v_was_cancelled  BOOLEAN;
  v_cancelled_in_window BOOLEAN;
  v_charge_window_hours CONSTANT INTEGER := 24;
  v_is_sub_covered BOOLEAN;
  v_applied        BOOLEAN;
  v_window_start   TIMESTAMPTZ;
  v_window_end     TIMESTAMPTZ;
BEGIN
  v_window_start := NOW() - INTERVAL '1 hour';
  v_window_end   := NOW();

  FOR v_rec IN
    SELECT
      pa.id           AS participation_id,
      pa.product_id,
      pa.gamer_id,
      p.timezone,
      ss.weekday,
      ss.start_time
      FROM public.participations_v2 pa
      JOIN public.products_v2 p ON p.id = pa.product_id
      JOIN public.schedule_slots_v2 ss ON ss.product_id = p.id
      WHERE pa.status = 'active'
        AND p.product_type = 'consumer_club'
        AND p.billing_mode = 'paid'
  LOOP
    BEGIN
      DECLARE
        v_now_local        TIMESTAMP;
        v_today_local      DATE;
        v_today_dow        INTEGER;
        v_days_back        INTEGER;
        v_candidate_date   DATE;
        v_candidate_ts     TIMESTAMPTZ;
      BEGIN
        v_now_local   := NOW() AT TIME ZONE v_rec.timezone;
        v_today_local := v_now_local::DATE;
        v_today_dow   := EXTRACT(ISODOW FROM v_now_local)::INTEGER - 1;

        v_days_back := (v_today_dow - v_rec.weekday + 7) % 7;
        v_candidate_date := v_today_local - v_days_back;
        v_candidate_ts := (v_candidate_date + v_rec.start_time) AT TIME ZONE v_rec.timezone;

        IF v_candidate_ts > NOW() THEN
          v_candidate_date := v_candidate_date - 7;
          v_candidate_ts := (v_candidate_date + v_rec.start_time) AT TIME ZONE v_rec.timezone;
        END IF;

        v_session_start := v_candidate_ts;
        v_session_date  := v_candidate_date;
      END;

      IF v_session_start < v_window_start OR v_session_start > v_window_end THEN
        CONTINUE;
      END IF;

      IF NOT public.product_has_session_v2(v_rec.product_id, v_session_date) THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.credit_deductions_v2
        WHERE participation_id = v_rec.participation_id
          AND session_date = v_session_date
      ) THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.session_cancellations_v2
        WHERE participation_id = v_rec.participation_id
          AND session_date = v_session_date
          AND cancelled_at <= v_session_start - (v_charge_window_hours || ' hours')::INTERVAL
      ) INTO v_cancelled_in_window;

      SELECT EXISTS (
        SELECT 1 FROM public.session_cancellations_v2
        WHERE participation_id = v_rec.participation_id
          AND session_date = v_session_date
      ) INTO v_was_cancelled;

      SELECT EXISTS (
        SELECT 1 FROM public.family_subscription_items_v2 i
        JOIN public.family_subscriptions_v2 fs ON fs.id = i.family_subscription_id
        WHERE i.participation_id = v_rec.participation_id
          AND fs.status IN ('active', 'past_due', 'canceling')
      ) INTO v_is_sub_covered;

      -- Branch order matters: sub-covered cases first (always 0 or +1 motion),
      -- then bundle cases (-1 for attended/late-cancel, 0 for in-window cancel).
      IF v_is_sub_covered AND v_cancelled_in_window THEN
        v_applied := public.apply_credit_motion_v2(
          v_rec.participation_id, v_session_date, 1, 'sub_cancel_credit'
        );
        IF v_applied THEN v_granted := v_granted + 1; v_processed := v_processed + 1; END IF;
      ELSIF v_is_sub_covered THEN
        v_applied := public.apply_credit_motion_v2(
          v_rec.participation_id, v_session_date, 0, 'sub_covered'
        );
        IF v_applied THEN v_processed := v_processed + 1; END IF;
      ELSIF v_cancelled_in_window THEN
        -- v_cancelled_in_window already implies v_was_cancelled, so the
        -- `AND v_was_cancelled` we used to have was dead code. Bundle +
        -- cancelled-on-time = no charge.
        v_applied := public.apply_credit_motion_v2(
          v_rec.participation_id, v_session_date, 0, 'bundle_cancel_no_charge'
        );
        IF v_applied THEN v_processed := v_processed + 1; END IF;
      ELSIF v_was_cancelled THEN
        -- Cancellation row exists but past the 24h window — still charge.
        -- Distinct reason from a no-show so the audit trail captures the
        -- actual decision (parent disputing a charge can see the cancel
        -- happened but landed too late).
        v_applied := public.apply_credit_motion_v2(
          v_rec.participation_id, v_session_date, -1, 'bundle_late_cancel_charged'
        );
        IF v_applied THEN v_deducted := v_deducted + 1; v_processed := v_processed + 1; END IF;
      ELSE
        v_applied := public.apply_credit_motion_v2(
          v_rec.participation_id, v_session_date, -1, 'bundle_attended_or_no_show'
        );
        IF v_applied THEN v_deducted := v_deducted + 1; v_processed := v_processed + 1; END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'process_session_credits_v2 failed for participation %: %',
        v_rec.participation_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'granted',   v_granted,
    'deducted',  v_deducted,
    'errors',    v_errors,
    'processed_at', NOW()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION process_session_credits_v2() FROM authenticated, anon, public;
