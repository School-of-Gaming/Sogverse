-- Rename for naming-convention clarity (locale vs. spoken language).
--
-- "language" was overloaded across two distinct concepts:
--   1. UI locale  - which translation of the web app the user sees
--   2. Spoken language  - human languages a person speaks / a club is delivered in
--
-- This migration renames everything on the database side so the two systems
-- have visibly different names. See docs/i18n-architecture.md and the rule in
-- CLAUDE.md ("Locale vs Spoken Language").
--
-- All renames are metadata-only - no data is rewritten.

-- =============================================================================
-- 1. Table rename: languages -> spoken_languages
-- =============================================================================

ALTER TABLE public.languages RENAME TO spoken_languages;

-- Rename the existing RLS policies on the table so they don't carry the old name.
ALTER POLICY "anyone_can_read_languages" ON public.spoken_languages
  RENAME TO "anyone_can_read_spoken_languages";
ALTER POLICY "admin_manage_languages" ON public.spoken_languages
  RENAME TO "admin_manage_spoken_languages";

-- =============================================================================
-- 2. Column renames on profiles
-- =============================================================================

-- Spoken-language array (which human languages the user speaks)
ALTER TABLE public.profiles RENAME COLUMN languages TO spoken_languages;

-- UI locale preference (which translation of the app the user sees)
ALTER TABLE public.profiles RENAME COLUMN language_preference TO locale;

COMMENT ON COLUMN public.profiles.locale IS
  'BCP-47-style UI locale code (en, fi, sv, ...). Null = auto-detect from cookie/Accept-Language. Distinct from spoken_languages, which is the user''s human-language fluency.';

COMMENT ON COLUMN public.profiles.spoken_languages IS
  'Human languages the user speaks (codes from public.spoken_languages). Used for matching gamers/gedus to clubs. Distinct from locale, which controls UI translation.';

-- =============================================================================
-- 3. Validation trigger: rebind to the renamed column and update names
-- =============================================================================

-- The old trigger fires on UPDATE OF languages and calls validate_profile_languages().
-- Drop and recreate against the renamed column + renamed function.
DROP TRIGGER IF EXISTS trg_validate_profile_languages ON public.profiles;
DROP FUNCTION IF EXISTS public.validate_profile_languages();

CREATE FUNCTION public.validate_profile_spoken_languages()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF array_length(NEW.spoken_languages, 1) IS NOT NULL THEN
    -- Reject codes not in the spoken_languages reference table
    IF NOT (NEW.spoken_languages <@ ARRAY(SELECT code FROM public.spoken_languages)) THEN
      RAISE EXCEPTION 'Invalid language code in spoken_languages array'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Reject duplicate codes
    IF (SELECT count(DISTINCT v) FROM unnest(NEW.spoken_languages) v)
       < array_length(NEW.spoken_languages, 1) THEN
      RAISE EXCEPTION 'Duplicate language codes are not allowed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_profile_spoken_languages() FROM authenticated, anon, public;

CREATE TRIGGER trg_validate_profile_spoken_languages
  BEFORE INSERT OR UPDATE OF spoken_languages ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_profile_spoken_languages();

-- =============================================================================
-- 4. Grants: re-issue the column-level UPDATE grant under the new column name
-- =============================================================================

-- Postgres rewrites grants automatically when columns are renamed within the
-- same table (the underlying attnum doesn't change), so the GRANT UPDATE
-- (phone, languages) from migration 00018 already covers the renamed
-- spoken_languages column without any further action. No re-grant needed.

-- Same applies to the table-level GRANT SELECT on the renamed spoken_languages
-- table (formerly languages) - the grant follows the OID, not the name.
