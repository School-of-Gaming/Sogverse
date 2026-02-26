-- Migration: Remove p_token_cost parameter from enroll_gamer_in_group
--
-- The RPC previously trusted the caller-supplied token cost. A direct RPC
-- caller could pass 0 (free enrollment) or a negative value (gain tokens).
-- The RPC now looks up products.token_cost internally via the group's
-- product_id, which it already fetches.

-- Drop the old 5-parameter overload first (different signature = different function)
DROP FUNCTION IF EXISTS enroll_gamer_in_group(UUID, UUID, UUID, INTEGER, DATE);

CREATE OR REPLACE FUNCTION enroll_gamer_in_group(
  p_customer_id UUID,
  p_gamer_id UUID,
  p_group_id UUID,
  p_session_date DATE
)
RETURNS TABLE(enrollment_id UUID, transaction_id UUID, new_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_product_name TEXT;
  v_token_cost INTEGER;
  v_enrollment_id UUID;
  v_transaction_id UUID;
  v_new_balance INTEGER;
BEGIN
  -- Verify caller identity: browser callers must be the customer themselves
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_customer_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Verify group exists and get product info (including authoritative token cost)
  SELECT pg.product_id, p.name, p.token_cost
    INTO v_product_id, v_product_name, v_token_cost
    FROM product_groups pg
    JOIN products p ON p.id = pg.product_id
   WHERE pg.id = p_group_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Verify customer is parent of gamer
  IF NOT EXISTS (
    SELECT 1 FROM parent_gamer
     WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to enroll this gamer';
  END IF;

  -- Verify gamer not already actively enrolled in this product
  IF EXISTS (
    SELECT 1
      FROM group_enrollments ge
      JOIN product_groups pg ON pg.id = ge.group_id
     WHERE ge.gamer_id = p_gamer_id
       AND pg.product_id = v_product_id
       AND ge.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Gamer is already enrolled in this product'
      USING ERRCODE = '23505';
  END IF;

  -- Deduct tokens (CHECK constraint on customer_profiles prevents overdraft)
  SELECT atb.new_balance, atb.transaction_id
    INTO v_new_balance, v_transaction_id
    FROM adjust_token_balance(
      p_customer_id,
      -v_token_cost,
      'enrollment',
      'Enrollment: ' || v_product_name
    ) atb;

  -- Insert enrollment
  INSERT INTO group_enrollments (group_id, gamer_id, enrolled_by, status, last_charged_at)
  VALUES (p_group_id, p_gamer_id, p_customer_id, 'active', NOW())
  RETURNING id INTO v_enrollment_id;

  -- Insert first charge record
  INSERT INTO enrollment_charges (enrollment_id, amount, transaction_id, session_date)
  VALUES (v_enrollment_id, v_token_cost, v_transaction_id, p_session_date);

  RETURN QUERY SELECT v_enrollment_id, v_transaction_id, v_new_balance;
END;
$$;

-- No GRANT — access is revoked in 00039 (service-role only via API routes).
