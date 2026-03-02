-- Fix: Prevent role escalation via raw_user_meta_data.
--
-- Previously, handle_new_user() trusted raw_user_meta_data->>'role' to assign
-- any role including admin/gedu. An attacker could call the Supabase Auth
-- signup API with {"data": {"role": "admin"}} to self-escalate.
--
-- raw_app_meta_data would be the ideal source (only settable server-side),
-- but GoTrue populates it via a separate UPDATE after the INSERT, so it is
-- not available when this trigger fires. Instead:
--   - Gamer: detected by @gamer.sogverse.internal email domain (only the
--     admin API client creates these accounts in practice).
--   - Admin/Gedu: the trigger always assigns customer. The create-gedu API
--     route promotes the profile to gedu after creation. Admins are created
--     manually on the Supabase dashboard.
--   - Customer: default for all other signups.
-- raw_user_meta_data->>'role' is ignored entirely.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  profile_email TEXT;
  profile_username TEXT;
  profile_role user_role;
  profile_display_name TEXT;
BEGIN
  profile_email := NEW.email;
  -- Never derive display_name from email — use a generic fallback instead
  profile_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), 'New User');

  -- Gamer accounts: detected by synthetic email domain.
  -- Only the admin API client (service role) creates users with this domain.
  IF profile_email LIKE '%@gamer.sogverse.internal' THEN
    profile_username := split_part(profile_email, '@', 1);
    profile_role := 'gamer';
    profile_email := NULL; -- Gamers don't store email
    profile_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), profile_username);
  ELSE
    -- Default to customer. raw_user_meta_data->>'role' is intentionally
    -- ignored to prevent role escalation via the public signup API.
    -- Privileged roles (admin, gedu) are assigned by API routes after
    -- user creation, not by this trigger.
    profile_role := 'customer';
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
