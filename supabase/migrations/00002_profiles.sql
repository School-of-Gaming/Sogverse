-- Enums, profiles (base + customer + gamer + minecraft), auth helpers, policies, and grants

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'customer', 'gamer', 'gedu');
CREATE TYPE gender_type AS ENUM ('boy', 'girl', 'non_binary');

-- =============================================================================
-- Profiles (extends auth.users)
-- =============================================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  username TEXT UNIQUE,
  role user_role NOT NULL DEFAULT 'customer',
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 32),
  currency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT auth_identifier_check CHECK (
    (role = 'gamer' AND username IS NOT NULL) OR
    (role != 'gamer' AND email IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_profiles_username ON profiles(username) WHERE username IS NOT NULL;
CREATE INDEX idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;
CREATE INDEX idx_profiles_role ON profiles(role);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Customer Profiles (1:1 extension for customers)
-- =============================================================================

CREATE TABLE customer_profiles (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  token_balance INTEGER NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  subscription_tier TEXT  -- Stripe Product ID of the active subscription tier
);

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Gamer Profiles (1:1 extension for gamers)
-- =============================================================================

CREATE TABLE gamer_profiles (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  date_of_birth DATE NOT NULL CHECK (date_of_birth <= CURRENT_DATE),
  gender gender_type NOT NULL
);

ALTER TABLE gamer_profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Minecraft Accounts (cross-role, 1:1 per user)
-- =============================================================================

CREATE TABLE minecraft_accounts (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  minecraft_username TEXT,
  minecraft_uuid TEXT,
  CONSTRAINT minecraft_accounts_uuid_unique UNIQUE (minecraft_uuid)
);

ALTER TABLE minecraft_accounts ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- handle_new_user trigger
-- =============================================================================

-- ALWAYS assigns 'customer' role. All other roles (admin, gedu, gamer) are
-- promoted by server-side API routes after user creation.
-- raw_user_meta_data->>'role' is deliberately ignored — GoTrue populates
-- raw_app_meta_data via a separate UPDATE after the INSERT, so it is not
-- available when this trigger fires. Trusting raw_user_meta_data would allow
-- role escalation via the signup API.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  profile_display_name TEXT;
BEGIN
  profile_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), 'New User');

  INSERT INTO public.profiles (id, email, role, display_name)
  VALUES (NEW.id, NEW.email, 'customer', profile_display_name);

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- Auth helper functions
-- =============================================================================

-- Uses SECURITY DEFINER to bypass RLS — avoids infinite recursion (PostgreSQL
-- error 42P17) when called from RLS policies on the profiles table.
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================================================
-- RLS policies
-- =============================================================================

CREATE POLICY "admin_full_access_profiles"
  ON profiles FOR ALL TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Wrap auth.uid() / get_user_role() in (select ...) for RLS initplan optimization:
-- evaluated once per query instead of once per row.
CREATE POLICY "users_view_own_profile"
  ON profiles FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

-- Uses get_user_role() instead of a subquery on profiles to avoid PostgreSQL
-- error 42P17 (infinite recursion in policy for relation).
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (
    id = (select auth.uid()) AND
    role = (select get_user_role())
  );

CREATE POLICY "admin_full_access_customer_profiles"
  ON customer_profiles FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY "customers_read_own_customer_profile"
  ON customer_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admin_full_access_gamer_profiles"
  ON gamer_profiles FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY "gamers_read_own_gamer_profile"
  ON gamer_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "gamers_update_own_gamer_profile"
  ON gamer_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin_full_access_minecraft_accounts"
  ON minecraft_accounts FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "users_read_own_minecraft_account"
  ON minecraft_accounts FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================================================
-- Table grants
-- =============================================================================

-- Supabase local Docker bootstraps default ALL grants on public tables.
-- Explicit REVOKE ALL ensures only the selective GRANTs below are in effect.
REVOKE ALL ON profiles FROM authenticated;
REVOKE ALL ON customer_profiles FROM authenticated;
REVOKE ALL ON gamer_profiles FROM authenticated;
REVOKE ALL ON minecraft_accounts FROM authenticated;

GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (display_name) ON profiles TO authenticated;

GRANT SELECT ON customer_profiles TO authenticated;

GRANT SELECT, UPDATE ON gamer_profiles TO authenticated;

GRANT SELECT ON minecraft_accounts TO authenticated;

-- =============================================================================
-- Function grants
-- =============================================================================

REVOKE EXECUTE ON FUNCTION get_user_role() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_admin() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
