-- Migration: Repair schema
-- Description: Ensures all types and tables exist (idempotent)

-- Create user_role enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'customer', 'gamer', 'gedu');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  username TEXT,
  role user_role NOT NULL DEFAULT 'customer',
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT auth_identifier_check CHECK (
    (role = 'gamer' AND username IS NOT NULL) OR
    (role != 'gamer' AND email IS NOT NULL)
  )
);

-- Create indexes if they don't exist
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$ BEGIN
  CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create or replace the handle_new_user function
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

  IF profile_email LIKE '%@gamer.sogverse.internal' THEN
    profile_username := split_part(profile_email, '@', 1);
    profile_role := 'gamer';
    profile_email := NULL;
    profile_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), profile_username);
  ELSE
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users if it doesn't exist
DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create helper functions
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create parent_gamer table if it doesn't exist
CREATE TABLE IF NOT EXISTS parent_gamer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gamer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'parent',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_parent_gamer UNIQUE (parent_id, gamer_id),
  CONSTRAINT no_self_link CHECK (parent_id != gamer_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_gamer_parent ON parent_gamer(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_gamer_gamer ON parent_gamer(gamer_id);

-- Create helper functions for parent-gamer relationships
CREATE OR REPLACE FUNCTION is_parent_of(gamer_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM parent_gamer
    WHERE parent_id = auth.uid() AND gamer_id = gamer_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_gamers()
RETURNS SETOF profiles AS $$
BEGIN
  RETURN QUERY
  SELECT p.* FROM profiles p
  INNER JOIN parent_gamer pg ON p.id = pg.gamer_id
  WHERE pg.parent_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_parents()
RETURNS SETOF profiles AS $$
BEGIN
  RETURN QUERY
  SELECT p.* FROM profiles p
  INNER JOIN parent_gamer pg ON p.id = pg.parent_id
  WHERE pg.gamer_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create products table if it doesn't exist
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  stripe_price_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_stripe ON products(stripe_price_id) WHERE stripe_price_id IS NOT NULL;

-- Create trigger for products updated_at
DO $$ BEGIN
  CREATE TRIGGER products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION get_active_products()
RETURNS SETOF products AS $$
BEGIN
  RETURN QUERY SELECT * FROM products WHERE is_active = true ORDER BY name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_gamer ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies (idempotent)
DROP POLICY IF EXISTS "admin_full_access_profiles" ON profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
DROP POLICY IF EXISTS "parents_view_linked_gamers" ON profiles;

CREATE POLICY "admin_full_access_profiles" ON profiles FOR ALL TO authenticated
  USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "users_view_own_profile" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

CREATE POLICY "parents_view_linked_gamers" ON profiles FOR SELECT TO authenticated
  USING (get_user_role() = 'customer' AND id IN (SELECT gamer_id FROM parent_gamer WHERE parent_id = auth.uid()));

DROP POLICY IF EXISTS "admin_full_access_parent_gamer" ON parent_gamer;
DROP POLICY IF EXISTS "customers_view_own_links" ON parent_gamer;
DROP POLICY IF EXISTS "customers_create_links" ON parent_gamer;
DROP POLICY IF EXISTS "customers_delete_own_links" ON parent_gamer;
DROP POLICY IF EXISTS "gamers_view_parent_links" ON parent_gamer;

CREATE POLICY "admin_full_access_parent_gamer" ON parent_gamer FOR ALL TO authenticated
  USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "customers_view_own_links" ON parent_gamer FOR SELECT TO authenticated
  USING (get_user_role() = 'customer' AND parent_id = auth.uid());

CREATE POLICY "customers_create_links" ON parent_gamer FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'customer' AND parent_id = auth.uid());

CREATE POLICY "customers_delete_own_links" ON parent_gamer FOR DELETE TO authenticated
  USING (get_user_role() = 'customer' AND parent_id = auth.uid());

CREATE POLICY "gamers_view_parent_links" ON parent_gamer FOR SELECT TO authenticated
  USING (get_user_role() = 'gamer' AND gamer_id = auth.uid());

DROP POLICY IF EXISTS "admin_full_access_products" ON products;
DROP POLICY IF EXISTS "public_view_active_products" ON products;

CREATE POLICY "admin_full_access_products" ON products FOR ALL TO authenticated
  USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "public_view_active_products" ON products FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url) ON profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON parent_gamer TO authenticated;
GRANT SELECT ON products TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_parent_of(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_gamers() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_parents() TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_products() TO anon, authenticated;
