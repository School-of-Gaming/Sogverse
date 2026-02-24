-- Migration: Split role-specific columns into extension tables
-- customer_profiles: token_balance, stripe_customer_id, stripe_subscription_id, subscription_status
-- gamer_profiles: date_of_birth, gender

-- 1. Create gender enum
CREATE TYPE gender_type AS ENUM ('boy', 'girl', 'non_binary');

-- 2. Create customer_profiles table
CREATE TABLE customer_profiles (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  token_balance INTEGER NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create gamer_profiles table
CREATE TABLE gamer_profiles (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  date_of_birth DATE,
  gender gender_type,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Add updated_at triggers (reuse existing function)
CREATE TRIGGER customer_profiles_updated_at
  BEFORE UPDATE ON customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER gamer_profiles_updated_at
  BEFORE UPDATE ON gamer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Migrate existing data
INSERT INTO customer_profiles (user_id, token_balance, stripe_customer_id, stripe_subscription_id, subscription_status)
SELECT id, token_balance, stripe_customer_id, stripe_subscription_id, subscription_status
FROM profiles
WHERE role = 'customer';

INSERT INTO gamer_profiles (user_id)
SELECT id
FROM profiles
WHERE role = 'gamer';

-- 6. Drop columns from profiles
ALTER TABLE profiles
  DROP COLUMN token_balance,
  DROP COLUMN stripe_customer_id,
  DROP COLUMN stripe_subscription_id,
  DROP COLUMN subscription_status;

-- 7. Update handle_new_user() to also insert into role extension tables
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  profile_email TEXT;
  profile_username TEXT;
  profile_role user_role;
  profile_display_name TEXT;
  role_from_meta TEXT;
BEGIN
  profile_email := NEW.email;
  profile_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), split_part(NEW.email, '@', 1));

  -- Check if this is a gamer account (synthetic email)
  IF profile_email LIKE '%@gamer.sogverse.internal' THEN
    profile_username := split_part(profile_email, '@', 1);
    profile_role := 'gamer';
    profile_email := NULL; -- Gamers don't store email
    profile_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), profile_username);
  ELSE
    -- Check for role in metadata, default to customer
    role_from_meta := NULLIF(NEW.raw_user_meta_data->>'role', '');
    IF role_from_meta IS NOT NULL AND role_from_meta IN ('admin', 'customer', 'gamer', 'gedu') THEN
      profile_role := role_from_meta::user_role;
    ELSE
      profile_role := 'customer';
    END IF;
    profile_username := NULLIF(NEW.raw_user_meta_data->>'username', '');
  END IF;

  INSERT INTO public.profiles (id, email, username, role, display_name)
  VALUES (NEW.id, profile_email, profile_username, profile_role, profile_display_name);

  -- Insert into role-specific extension table
  IF profile_role = 'customer' THEN
    INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);
  ELSIF profile_role = 'gamer' THEN
    INSERT INTO public.gamer_profiles (user_id) VALUES (NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 8. Update adjust_token_balance() to use customer_profiles
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
  SET token_balance = token_balance + p_amount,
      updated_at = now()
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

-- 9. RLS + GRANTs on customer_profiles
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on customer_profiles"
  ON customer_profiles
  FOR ALL
  TO authenticated
  USING (is_admin());

CREATE POLICY "Customers can read own customer_profile"
  ON customer_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON customer_profiles TO authenticated;

-- 10. RLS + GRANTs on gamer_profiles
ALTER TABLE gamer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on gamer_profiles"
  ON gamer_profiles
  FOR ALL
  TO authenticated
  USING (is_admin());

CREATE POLICY "Gamers can read own gamer_profile"
  ON gamer_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Gamers can update own gamer_profile"
  ON gamer_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Parents can read linked gamer profiles"
  ON gamer_profiles
  FOR SELECT
  TO authenticated
  USING (is_parent_of(user_id));

GRANT SELECT, UPDATE ON gamer_profiles TO authenticated;
