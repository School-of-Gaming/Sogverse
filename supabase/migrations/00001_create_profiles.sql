-- Migration: Create profiles table and user role enum
-- Description: Core user profiles with role-based authentication support

-- Create user role enum
CREATE TYPE user_role AS ENUM ('admin', 'customer', 'gamer', 'gedu');

-- Create profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  username TEXT UNIQUE,
  role user_role NOT NULL DEFAULT 'customer',
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Gamers must have username, others must have email
  CONSTRAINT auth_identifier_check CHECK (
    (role = 'gamer' AND username IS NOT NULL) OR
    (role != 'gamer' AND email IS NOT NULL)
  )
);

-- Create unique index for username (only when not null)
CREATE UNIQUE INDEX idx_profiles_username ON profiles(username) WHERE username IS NOT NULL;

-- Create index for email lookups
CREATE INDEX idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;

-- Create index for role-based queries
CREATE INDEX idx_profiles_role ON profiles(role);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to profiles
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  user_username TEXT;
  user_role user_role;
  user_display_name TEXT;
BEGIN
  user_email := NEW.email;
  user_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));

  -- Check if this is a gamer account (synthetic email)
  IF user_email LIKE '%@gamer.sogverse.internal' THEN
    user_username := split_part(user_email, '@', 1);
    user_role := 'gamer';
    user_email := NULL; -- Gamers don't store email
    user_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', user_username);
  ELSE
    -- Check for role in metadata, default to customer
    user_role := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer');
    user_username := NEW.raw_user_meta_data->>'username';
  END IF;

  INSERT INTO public.profiles (id, email, username, role, display_name)
  VALUES (NEW.id, user_email, user_username, user_role, user_display_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
BEGIN
  RETURN (
    SELECT role FROM public.profiles WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON TABLE profiles IS 'User profiles extending Supabase auth.users with role-based access';
COMMENT ON COLUMN profiles.email IS 'Email address (NULL for gamer accounts)';
COMMENT ON COLUMN profiles.username IS 'Username (required for gamers, optional for others)';
COMMENT ON COLUMN profiles.role IS 'User role determining access permissions';
