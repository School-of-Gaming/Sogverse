-- Migration: Fix schema path issues
-- Description: Ensure type exists and function uses explicit schema references

-- First, let's check and recreate the enum type in public schema explicitly
DO $$
BEGIN
  -- Drop if exists and recreate to ensure it's in public schema
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.user_role AS ENUM ('admin', 'customer', 'gamer', 'gedu');
  END IF;
END $$;

-- Recreate the handle_new_user function with explicit schema references and search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  profile_email TEXT;
  profile_username TEXT;
  profile_role public.user_role;
  profile_display_name TEXT;
  role_from_meta TEXT;
BEGIN
  profile_email := NEW.email;
  profile_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), split_part(NEW.email, '@', 1));

  IF profile_email LIKE '%@gamer.sogverse.internal' THEN
    profile_username := split_part(profile_email, '@', 1);
    profile_role := 'gamer'::public.user_role;
    profile_email := NULL;
    profile_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), profile_username);
  ELSE
    role_from_meta := NULLIF(NEW.raw_user_meta_data->>'role', '');
    IF role_from_meta IS NOT NULL AND role_from_meta IN ('admin', 'customer', 'gamer', 'gedu') THEN
      profile_role := role_from_meta::public.user_role;
    ELSE
      profile_role := 'customer'::public.user_role;
    END IF;
    profile_username := NULLIF(NEW.raw_user_meta_data->>'username', '');
  END IF;

  INSERT INTO public.profiles (id, email, username, role, display_name)
  VALUES (NEW.id, profile_email, profile_username, profile_role, profile_display_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the trigger to ensure it points to the right function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
