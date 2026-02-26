-- Migration: Add auth.uid() validation to SECURITY DEFINER RPCs
--
-- These RPCs accept p_customer_id as a parameter but previously trusted it
-- blindly. Since they bypass RLS (SECURITY DEFINER) and are granted to
-- `authenticated`, any logged-in user could call them directly via
-- supabase.rpc() with another customer's ID.
--
-- The guard allows NULL auth.uid() (admin/service-role client used by API
-- routes) but blocks browser callers from impersonating other users.

-- =============================================================================
-- 1. enroll_gamer_in_group — add auth.uid() check
-- =============================================================================
CREATE OR REPLACE FUNCTION enroll_gamer_in_group(
  p_customer_id UUID,
  p_gamer_id UUID,
  p_group_id UUID,
  p_token_cost INTEGER,
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
  v_enrollment_id UUID;
  v_transaction_id UUID;
  v_new_balance INTEGER;
BEGIN
  -- Verify caller identity: browser callers must be the customer themselves
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_customer_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Verify group exists and get product info
  SELECT pg.product_id, p.name
    INTO v_product_id, v_product_name
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
      -p_token_cost,
      'enrollment',
      'Enrollment: ' || v_product_name
    ) atb;

  -- Insert enrollment
  INSERT INTO group_enrollments (group_id, gamer_id, enrolled_by, status, last_charged_at)
  VALUES (p_group_id, p_gamer_id, p_customer_id, 'active', NOW())
  RETURNING id INTO v_enrollment_id;

  -- Insert first charge record
  INSERT INTO enrollment_charges (enrollment_id, amount, transaction_id, session_date)
  VALUES (v_enrollment_id, p_token_cost, v_transaction_id, p_session_date);

  RETURN QUERY SELECT v_enrollment_id, v_transaction_id, v_new_balance;
END;
$$;

-- =============================================================================
-- 2. unenroll_gamer — add auth.uid() check
-- =============================================================================
CREATE OR REPLACE FUNCTION unenroll_gamer(
  p_customer_id UUID,
  p_enrollment_id UUID,
  p_refund_amount INTEGER
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
  v_new_balance INTEGER;
  v_refund_tx_id UUID;
  v_latest_charge_id UUID;
BEGIN
  -- Verify caller identity: browser callers must be the customer themselves
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_customer_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Verify enrollment exists and get details
  SELECT ge.enrolled_by, ge.status, p.name
    INTO v_enrolled_by, v_status, v_product_name
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
  IF p_refund_amount > 0 THEN
    SELECT atb.new_balance, atb.transaction_id
      INTO v_new_balance, v_refund_tx_id
      FROM adjust_token_balance(
        p_customer_id,
        p_refund_amount,
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

-- =============================================================================
-- 3. get_customer_enrollments — add auth.uid() check
-- =============================================================================
CREATE OR REPLACE FUNCTION get_customer_enrollments(p_customer_id UUID)
RETURNS TABLE(
  enrollment_id UUID,
  group_id UUID,
  gamer_id UUID,
  gamer_display_name TEXT,
  status TEXT,
  enrolled_at TIMESTAMPTZ,
  last_charged_at TIMESTAMPTZ,
  unenrolled_at TIMESTAMPTZ,
  product_id UUID,
  product_name TEXT,
  product_image_url TEXT,
  product_token_cost INTEGER,
  product_day_of_week SMALLINT,
  product_start_time TIME,
  product_timezone TEXT,
  product_duration_minutes INTEGER,
  gedu_display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Verify caller identity: browser callers must be the customer themselves
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_customer_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ge.id AS enrollment_id,
    ge.group_id,
    ge.gamer_id,
    gp.display_name AS gamer_display_name,
    ge.status,
    ge.created_at AS enrolled_at,
    ge.last_charged_at,
    ge.unenrolled_at,
    p.id AS product_id,
    p.name AS product_name,
    p.image_url AS product_image_url,
    p.token_cost AS product_token_cost,
    p.day_of_week AS product_day_of_week,
    p.start_time AS product_start_time,
    p.timezone AS product_timezone,
    p.duration_minutes AS product_duration_minutes,
    gedu.display_name AS gedu_display_name
  FROM group_enrollments ge
  JOIN product_groups pg ON pg.id = ge.group_id
  JOIN products p ON p.id = pg.product_id
  JOIN profiles gp ON gp.id = ge.gamer_id
  JOIN profiles gedu ON gedu.id = pg.gedu_id
  WHERE ge.enrolled_by = p_customer_id
  ORDER BY
    CASE ge.status WHEN 'active' THEN 0 ELSE 1 END,
    ge.created_at DESC;
END;
$$;
