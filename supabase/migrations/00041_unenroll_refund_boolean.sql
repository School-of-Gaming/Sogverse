-- Migration: Change unenroll_gamer to look up refund amount internally
--
-- Previously accepted p_refund_amount INTEGER — the caller controlled the
-- refund amount. Now accepts p_refund BOOLEAN and looks up products.token_cost
-- internally, consistent with how enroll_gamer_in_group was fixed in 00038.
-- The API route still decides *whether* to refund; the RPC decides *how much*.

-- Drop the old 3-parameter version (different signature = different function)
DROP FUNCTION IF EXISTS unenroll_gamer(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION unenroll_gamer(
  p_customer_id UUID,
  p_enrollment_id UUID,
  p_refund BOOLEAN
)
RETURNS TABLE(new_balance INTEGER, refund_transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrolled_by UUID;
  v_status TEXT;
  v_product_name TEXT;
  v_token_cost INTEGER;
  v_new_balance INTEGER;
  v_refund_tx_id UUID;
  v_latest_charge_id UUID;
BEGIN
  -- Verify caller identity: browser callers must be the customer themselves
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_customer_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Verify enrollment exists and get details (including authoritative token cost)
  SELECT ge.enrolled_by, ge.status, p.name, p.token_cost
    INTO v_enrolled_by, v_status, v_product_name, v_token_cost
    FROM group_enrollments ge
    JOIN product_groups pg ON pg.id = ge.group_id
    JOIN products p ON p.id = pg.product_id
   WHERE ge.id = p_enrollment_id;

  IF v_enrolled_by IS NULL THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  IF v_enrolled_by <> p_customer_id THEN
    RAISE EXCEPTION 'Not authorized to unenroll this gamer';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Enrollment is not active';
  END IF;

  -- Mark as unenrolled
  UPDATE group_enrollments
     SET status = 'unenrolled',
         unenrolled_at = NOW()
   WHERE id = p_enrollment_id;

  -- Process refund if applicable
  IF p_refund THEN
    SELECT atb.new_balance, atb.transaction_id
      INTO v_new_balance, v_refund_tx_id
      FROM adjust_token_balance(
        p_customer_id,
        v_token_cost,
        'enrollment_refund',
        'Unenrollment refund: ' || v_product_name
      ) atb;

    -- Mark the latest charge as refunded
    SELECT id INTO v_latest_charge_id
      FROM enrollment_charges
     WHERE enrollment_id = p_enrollment_id
       AND refunded_at IS NULL
     ORDER BY session_date DESC
     LIMIT 1;

    IF v_latest_charge_id IS NOT NULL THEN
      UPDATE enrollment_charges
         SET refunded_at = NOW(),
             refund_transaction_id = v_refund_tx_id
       WHERE id = v_latest_charge_id;
    END IF;
  ELSE
    -- No refund — just return current balance
    SELECT cp.token_balance INTO v_new_balance
      FROM customer_profiles cp
     WHERE cp.user_id = p_customer_id;

    v_refund_tx_id := NULL;
  END IF;

  RETURN QUERY SELECT v_new_balance, v_refund_tx_id;
END;
$$;

-- Do NOT grant to authenticated — this RPC is service-role only (called via API routes).
-- The old grant from 00032 was revoked in 00039; the new signature inherits no grants.
