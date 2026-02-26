-- The handle_new_user trigger inserts into gamer_profiles(user_id) but
-- date_of_birth and gender are now NOT NULL (from migration 00032).
-- Update the trigger to read these from user_metadata so the insert succeeds.

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
    INSERT INTO public.gamer_profiles (user_id, date_of_birth, gender)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::DATE, '2000-01-01'),
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'gender', '')::gender_type, 'boy')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
