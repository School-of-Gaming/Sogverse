-- Handle the rare "double-paid reservation" race in confirm_reservation_v2.
--
-- The "already signed up" guard in create_participation_v2 only blocks
-- statuses ('active', 'waitlisted') — 'reserving' is intentionally excluded
-- so a click-abandon-click-again parent can create a fresh reservation.
-- That means a parent can have TWO live reserving rows for the same
-- (product, gamer). If both Stripe Checkout sessions complete (e.g., the
-- parent paid on the original tab and a retry tab), both webhooks fire
-- confirm_reservation_v2.
--
-- Without this fix: the first call flips reservation A → active. The second
-- call then tries to flip reservation B → active and trips the partial
-- UNIQUE on (product_id, gamer_id) WHERE status IN ('active', 'waitlisted',
-- 'completed') → 23505 → RPC throws → webhook returns 500 → Stripe retries
-- forever.
--
-- With this fix: confirm_reservation_v2 detects the conflict before it
-- happens and returns kind='duplicate_payment'. The webhook layer:
--   * logs a structured error so it surfaces in monitoring,
--   * records the payment in payments_v2 with purpose='reservation_duplicate'
--     so admin can find it during refund triage,
--   * deletes the orphan reserving row to free the seat hold,
--   * returns 200 so Stripe stops retrying.
--
-- Refunds are NOT issued automatically — the customer notices the duplicate
-- charge, contacts support, and an admin issues the refund manually via the
-- Stripe dashboard. This is rare enough (requires both checkouts to complete)
-- that automation isn't worth the extra failure modes.

-- Add the new payment purpose. ALTER TYPE ADD VALUE works in a transaction
-- as long as the new value isn't referenced from the same migration.
ALTER TYPE payment_purpose_v2 ADD VALUE IF NOT EXISTS 'reservation_duplicate';

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
  v_conflict_id  UUID;
BEGIN
  SELECT product_id, gamer_id, customer_id, status
    INTO v_product_id, v_gamer_id, v_customer_id, v_status
    FROM public.participations_v2
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
    FROM public.participations_v2
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
