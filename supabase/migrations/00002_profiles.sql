-- Enums, profiles, customer_profiles, gamer_profiles, auth helpers

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
  display_name TEXT NOT NULL,
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
  subscription_status TEXT
);

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Gamer Profiles (1:1 extension for gamers)
-- =============================================================================

CREATE TABLE gamer_profiles (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  date_of_birth DATE NOT NULL CHECK (date_of_birth <= CURRENT_DATE),
  gender gender_type NOT NULL,
  minecraft_username TEXT,
  minecraft_uuid TEXT
);

ALTER TABLE gamer_profiles ENABLE ROW LEVEL SECURITY;

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
