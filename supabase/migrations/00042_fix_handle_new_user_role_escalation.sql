-- Fix: Prevent role escalation via raw_user_meta_data.
--
-- Previously, handle_new_user() trusted raw_user_meta_data->>'role' to assign
-- any role including admin/gedu. An attacker could call the Supabase Auth
-- signup API with {"data": {"role": "admin"}} to self-escalate.
--
-- raw_app_meta_data would be the ideal source (only settable server-side),
-- but GoTrue populates it via a separate UPDATE after the INSERT, so it is
-- not available when this trigger fires.
--
-- Fix: the trigger now ALWAYS assigns customer. All other roles (admin,
-- gedu, gamer) are promoted by server-side API routes after user creation.
-- raw_user_meta_data->>'role' is ignored entirely.

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
