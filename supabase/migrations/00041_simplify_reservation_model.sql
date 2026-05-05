-- Simplify the v2 reservation model: status holds the seat, not the timer.
--
-- Before: count_seats_taken_v2 counted active + reserving-with-reserved_until-in-future.
-- That created a race window at the 30-min boundary — Stripe could accept payment
-- at T=29:59 (session still alive) while another customer's create_participation_v2
-- grabbed the seat at T=30:01 (our reserved_until lapsed). The webhook then arrived
-- with a completed payment but no seat available, hitting the lost_seat refund path.
--
-- After: count_seats_taken_v2 counts active + reserving (no time check). The seat
-- is held by status='reserving' until either confirm_reservation_v2 (Stripe payment
-- completed) or expire_reservation_v2 (Stripe session expired) fires. These two
-- Stripe events are mutually exclusive, so the seat is never simultaneously released
-- and confirmed. The race window is gone.
--
-- Stripe owns the timer too. The route sets `expires_at` on the Checkout Session
-- itself (RESERVATION_LIFETIME_MINUTES, currently 30). At that timestamp Stripe:
--   (a) refuses any further payment attempts on the session, AND
--   (b) fires checkout.session.expired, which our webhook turns into
--       expire_reservation_v2 (deletes the reserving row → seat freed).
-- Stripe retries failed webhook deliveries for up to 3 days. So a stuck
-- reserving row requires Stripe's webhook system to fail for 3 straight days,
-- which is well below our threshold for building a janitor cron. If it ever
-- happens, an admin can DELETE the row by hand.

-- count_seats_taken_v2 — drop the reserved_until check.
CREATE OR REPLACE FUNCTION count_seats_taken_v2(p_product_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)::INTEGER
    FROM public.participations_v2
    WHERE product_id = p_product_id
      AND status IN ('active', 'reserving');
$$;

REVOKE EXECUTE ON FUNCTION count_seats_taken_v2(UUID) FROM authenticated, anon, public;

-- confirm_reservation_v2 — drop the seat-recount race branch.
--
-- Status alone determines the outcome:
--   reserving → flip to active (success)
--   active    → idempotent (the same reservation already confirmed; second
--               webhook from a pay-twice race — the route layer refunds the
--               duplicate payment_intent)
--   anything else (or row missing) → return kind='orphan'. Should not happen
--               under normal Stripe operation; webhook logs but does not refund.
--               Charge sits in Stripe; admin reconciles.
CREATE OR REPLACE FUNCTION confirm_reservation_v2(
  p_reservation_id    UUID,
  p_credits_to_grant  INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id   UUID;
  v_gamer_id     UUID;
  v_customer_id  UUID;
  v_status       public.participation_status_v2;
BEGIN
  -- Lock the row (not the product) — we no longer need to gate the product
  -- because we no longer recount seats.
  SELECT product_id, gamer_id, customer_id, status
    INTO v_product_id, v_gamer_id, v_customer_id, v_status
    FROM public.participations_v2
    WHERE id = p_reservation_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'orphan');
  END IF;

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

  UPDATE public.participations_v2
     SET status = 'active',
         reserved_until = NULL,
         credits_remaining = p_credits_to_grant
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
$$;

REVOKE EXECUTE ON FUNCTION confirm_reservation_v2(UUID, INTEGER) FROM authenticated, anon, public;

-- Rename the lost_seat refund reason to duplicate_payment. The reason it now
-- denotes is "second Stripe payment landed on an already-confirmed reservation
-- (parent paid the original tab and a retry tab)." The seat-race scenario the
-- old name described no longer exists.
ALTER TYPE refund_reason_v2 RENAME VALUE 'lost_seat_after_payment' TO 'duplicate_payment';
