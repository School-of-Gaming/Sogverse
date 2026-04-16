-- Add UI language preference column to profiles.
-- Distinct from the existing `profiles.languages` array: this column controls
-- which language the user sees the web app and receives Sogverse communication
-- in, while `languages` is the user's set of preferred club/product languages
-- (used when matching gamers to gedus and displayed on gedu profiles).
ALTER TABLE public.profiles
  ADD COLUMN language_preference text;

COMMENT ON COLUMN public.profiles.language_preference IS
  'ISO 639-1 UI language preference (en, fi, sv). Null = auto-detect.';
