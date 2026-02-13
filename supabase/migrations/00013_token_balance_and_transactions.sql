-- Add token-related columns to profiles
ALTER TABLE profiles
  ADD COLUMN token_balance INTEGER NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
  ADD COLUMN stripe_customer_id TEXT,
  ADD COLUMN stripe_subscription_id TEXT,
  ADD COLUMN subscription_status TEXT;

-- Create transaction type enum
CREATE TYPE token_transaction_type AS ENUM ('purchase', 'subscription', 'admin_adjustment');

-- Create token transactions table
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX idx_token_transactions_stripe_session_id ON token_transactions(stripe_session_id);
CREATE INDEX idx_token_transactions_created_at ON token_transactions(created_at);

-- Atomic balance adjustment function (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION adjust_token_balance(
  p_user_id UUID,
  p_amount INTEGER,
  p_type token_transaction_type,
  p_description TEXT DEFAULT NULL,
  p_stripe_session_id TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
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
  INSERT INTO token_transactions (user_id, amount, type, description, stripe_session_id, stripe_subscription_id, admin_id, balance_after)
  VALUES (p_user_id, p_amount, p_type, p_description, p_stripe_session_id, p_stripe_subscription_id, p_admin_id, v_new_balance)
  RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT v_new_balance, v_transaction_id;
END;
$$;

-- RLS policies for token_transactions
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins can do everything on token_transactions"
  ON token_transactions
  FOR ALL
  TO authenticated
  USING (is_admin());

-- Users can read their own transactions
CREATE POLICY "Users can read own transactions"
  ON token_transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Grant necessary permissions
GRANT SELECT ON token_transactions TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_token_balance TO authenticated;
