-- Allow unauthenticated clients to read the languages reference table.
-- Fixes a race condition in setup-account-form where the session hasn't
-- been established yet when the languages query fires.

DROP POLICY "anyone_can_read_languages" ON languages;
CREATE POLICY "anyone_can_read_languages"
  ON languages FOR SELECT TO authenticated, anon
  USING (true);

GRANT SELECT ON languages TO anon;
