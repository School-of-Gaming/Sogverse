-- Add UI language preference column to profiles.
-- Distinct from the existing `languages` array which stores
-- languages a user speaks (for gedu/gamer matching).
ALTER TABLE public.profiles
  ADD COLUMN language_preference text;

COMMENT ON COLUMN public.profiles.language_preference IS
  'ISO 639-1 UI language preference (en, fi, sv). Null = auto-detect.';
