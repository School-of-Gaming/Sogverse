-- Token transactions and balance adjustment

-- =============================================================================
-- Token transaction type enum
-- =============================================================================

-- 'enrollment' and 'enrollment_refund' are included from the start
CREATE TYPE token_transaction_type AS ENUM (
  'purchase', 'subscription', 'admin_adjustment', 'enrollment', 'enrollment_refund'
);

-- =============================================================================
-- Token transactions table
-- =============================================================================

CREATE TABLE token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type token_transaction_type NOT NULL,
  description TEXT,
  stripe_session_id TEXT,
  stripe_subscription_id TEXT,
  admin_id UUID REFERENCES profiles(id),
  balance_after INTEGER NOT NULL,
  currency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX idx_token_transactions_stripe_session_id ON token_transactions(stripe_session_id);
CREATE INDEX idx_token_transactions_created_at ON token_transactions(created_at);

-- PostgreSQL allows multiple NULLs in UNIQUE columns, so admin adjustments
-- (which have NULL stripe_session_id) are unaffected by this constraint.
-- This is the idempotency gate that prevents double-crediting via TOCTOU races.
ALTER TABLE token_transactions
  ADD CONSTRAINT unique_stripe_session_id UNIQUE (stripe_session_id);

ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- adjust_token_balance — the sole function for all balance changes
-- =============================================================================

-- Uses SELECT FOR UPDATE to lock the customer_profiles row before reading,
-- preventing concurrent requests from causing balance corruption or overdrafts.
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
  -- Lock the row to prevent concurrent balance modifications
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
