-- Migration: Make display_name NOT NULL
-- Description: Backfill NULLs, add NOT NULL constraint, update trigger and RPC to stop leaking private data

-- =============================================================================
-- 1. Backfill existing NULLs (never use email — it's private)
-- =============================================================================
UPDATE profiles SET display_name = username WHERE display_name IS NULL AND username IS NOT NULL;
UPDATE profiles SET display_name = 'User' WHERE display_name IS NULL;

-- =============================================================================
-- 2. Add NOT NULL constraint
-- =============================================================================
ALTER TABLE profiles ALTER COLUMN display_name SET NOT NULL;

-- =============================================================================
-- 3. Update handle_new_user() trigger
--    Non-gamer fallback: 'New User' instead of email prefix
--    Gamer fallback: username is fine (it's not exposed publicly)
-- =============================================================================
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
  -- Never derive display_name from email — use a generic fallback instead
  profile_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), 'New User');

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

-- =============================================================================
-- 4. Simplify get_open_voice_rooms() — display_name is never NULL now
-- =============================================================================
CREATE OR REPLACE FUNCTION get_open_voice_rooms()
RETURNS TABLE (
  id UUID,
  creator_id UUID,
  name TEXT,
  daily_room_name TEXT,
  status voice_room_status,
  opened_at TIMESTAMPTZ,
  creator_display_name TEXT,
  creator_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      vr.id,
      vr.creator_id,
      vr.name,
      vr.daily_room_name,
      vr.status,
      vr.opened_at,
      p.display_name AS creator_display_name,
      p.role::TEXT AS creator_role
    FROM voice_rooms vr
    JOIN profiles p ON p.id = vr.creator_id
    WHERE vr.status = 'open'
    ORDER BY vr.opened_at DESC;
END;
$$;
