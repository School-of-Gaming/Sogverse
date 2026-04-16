-- Validate profiles.languages: reject invalid codes and duplicates.
-- Combined with the UNIQUE PK on languages.code, this also caps the
-- array length at the number of rows in the languages table.

CREATE FUNCTION validate_profile_languages()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF array_length(NEW.languages, 1) IS NOT NULL THEN
    -- Reject codes not in the languages table
    IF NOT (NEW.languages <@ ARRAY(SELECT code FROM public.languages)) THEN
      RAISE EXCEPTION 'Invalid language code in languages array'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Reject duplicate codes
    IF (SELECT count(DISTINCT v) FROM unnest(NEW.languages) v)
       < array_length(NEW.languages, 1) THEN
      RAISE EXCEPTION 'Duplicate language codes are not allowed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_profile_languages() FROM authenticated, anon, public;

CREATE TRIGGER trg_validate_profile_languages
  BEFORE INSERT OR UPDATE OF languages ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION validate_profile_languages();
