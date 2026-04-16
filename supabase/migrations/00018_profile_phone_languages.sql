-- Add phone number and spoken languages to user profiles

-- =============================================================================
-- Languages reference table
-- =============================================================================

-- Add new languages with a simple INSERT — no migration needed.
CREATE TABLE languages (
  code text PRIMARY KEY,           -- ISO 639-1 code, e.g. 'fi'
  name text NOT NULL               -- Display name, e.g. 'Finnish'
);

ALTER TABLE languages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_read_languages"
  ON languages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_manage_languages"
  ON languages FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

REVOKE ALL ON languages FROM authenticated;
GRANT SELECT ON languages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON languages TO authenticated;

INSERT INTO languages (code, name) VALUES
  ('fi', 'Finnish'),
  ('sv', 'Swedish'),
  ('en', 'English');

-- =============================================================================
-- New columns on profiles
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN phone text,
  ADD COLUMN languages text[] NOT NULL DEFAULT '{}';

-- E.164 digits without '+' prefix, e.g. '358401234567'
-- Matches the format used by whatsapp_contacts.phone
ALTER TABLE profiles
  ADD CONSTRAINT profiles_phone_e164 CHECK (phone ~ '^\d{7,15}$');

-- =============================================================================
-- Grants
-- =============================================================================

-- Column-level UPDATE grants are additive — this extends the existing
-- GRANT UPDATE (display_name) from 00002_profiles.sql
GRANT UPDATE (phone, languages) ON profiles TO authenticated;
