-- Migration: Revoke public access to adjust_token_balance + add row locking
--
-- Fixes Security Report Finding #10 (public RPC access — CRITICAL) and
-- Finding #4 (race condition — HIGH).
--
-- adjust_token_balance() is SECURITY DEFINER and was granted to
-- `authenticated` in migration 00013. Any logged-in user could call it
-- directly via supabase.rpc() to mint unlimited tokens or drain any
-- user's balance. The function is only legitimately called from:
--   1. Server-side API routes using the service-role client (bypasses grants)
--   2. Other SECURITY DEFINER RPCs (execute as function owner)
-- Neither needs the authenticated grant.

-- =============================================================================
-- 1. Revoke public execute grants (Finding #10)
-- =============================================================================
REVOKE EXECUTE ON FUNCTION adjust_token_balance(UUID, INTEGER, token_transaction_type, TEXT, TEXT, TEXT, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION adjust_token_balance(UUID, INTEGER, token_transaction_type, TEXT, TEXT, TEXT, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION adjust_token_balance(UUID, INTEGER, token_transaction_type, TEXT, TEXT, TEXT, UUID, TEXT) FROM public;

-- =============================================================================
-- 2. Recreate with SELECT FOR UPDATE row locking (Finding #4)
-- =============================================================================
CREATE OR REPLACE FUNCTION adjust_token_balance(
  p_user_id UUID,
  p_amount INTEGER,
  p_type token_transaction_type,
  p_description TEXT DEFAULT NULL,
  p_stripe_session_id TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL,
  p_currency TEXT DEFAULT NULL
)
RETURNS TABLE(new_balance INTEGER, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Lock the row to prevent concurrent balance modifications (Finding #4)
  SELECT cp.token_balance INTO v_current_balance
  FROM customer_profiles cp
  WHERE cp.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Update balance
  UPDATE customer_profiles
  SET token_balance = token_balance + p_amount
  WHERE user_id = p_user_id
  RETURNING token_balance INTO v_new_balance;

  -- Insert transaction record
  INSERT INTO token_transactions (user_id, amount, type, description, stripe_session_id, stripe_subscription_id, admin_id, balance_after, currency)
  VALUES (p_user_id, p_amount, p_type, p_description, p_stripe_session_id, p_stripe_subscription_id, p_admin_id, v_new_balance, p_currency)
  RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT v_new_balance, v_transaction_id;
END;
$$;
