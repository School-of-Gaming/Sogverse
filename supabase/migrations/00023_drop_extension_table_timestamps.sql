-- Remove redundant created_at/updated_at from extension tables.
-- Timestamps live on the base profiles table; extension tables are 1:1.
-- Also tighten base profiles timestamps to NOT NULL.

-- Make base profiles timestamps NOT NULL (all existing rows already have values via DEFAULT)
ALTER TABLE profiles
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Drop triggers first
DROP TRIGGER IF EXISTS customer_profiles_updated_at ON customer_profiles;
DROP TRIGGER IF EXISTS gamer_profiles_updated_at ON gamer_profiles;

-- Drop columns
ALTER TABLE customer_profiles
  DROP COLUMN created_at,
  DROP COLUMN updated_at;

ALTER TABLE gamer_profiles
  DROP COLUMN created_at,
  DROP COLUMN updated_at;

-- Update adjust_token_balance() — remove the now-nonexistent updated_at SET
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
  UPDATE customer_profiles
  SET token_balance = token_balance + p_amount
  WHERE user_id = p_user_id
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
