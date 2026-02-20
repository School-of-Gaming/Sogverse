-- Add currency preference to profiles (nullable — null means not yet set)
ALTER TABLE profiles
  ADD COLUMN currency TEXT CHECK (currency IN ('usd', 'gbp', 'eur'));

-- Add currency to token_transactions for audit (nullable for backwards compat)
ALTER TABLE token_transactions
  ADD COLUMN currency TEXT CHECK (currency IN ('usd', 'gbp', 'eur'));

-- Recreate adjust_token_balance with new p_currency parameter
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
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Atomically update balance
  UPDATE profiles
  SET token_balance = token_balance + p_amount,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING token_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Insert transaction record
  INSERT INTO token_transactions (user_id, amount, type, description, stripe_session_id, stripe_subscription_id, admin_id, balance_after, currency)
  VALUES (p_user_id, p_amount, p_type, p_description, p_stripe_session_id, p_stripe_subscription_id, p_admin_id, v_new_balance, p_currency)
  RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT v_new_balance, v_transaction_id;
END;
$$;
