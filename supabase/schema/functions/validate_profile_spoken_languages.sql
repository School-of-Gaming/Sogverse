--
-- Name: validate_profile_spoken_languages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_profile_spoken_languages() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF array_length(NEW.spoken_languages, 1) IS NOT NULL THEN
    -- Membership is the column type's job. Uniqueness is not:
    -- public.spoken_language[] is perfectly happy to hold ARRAY['fi','fi'],
    -- and every reader of this column treats it as a set.
    IF (SELECT count(DISTINCT v) FROM unnest(NEW.spoken_languages) v)
       < array_length(NEW.spoken_languages, 1) THEN
      RAISE EXCEPTION 'Duplicate language codes are not allowed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_profile_spoken_languages(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_profile_spoken_languages() IS 'BEFORE INSERT OR UPDATE OF profiles.spoken_languages. Its only rule is that no language appears twice — public.spoken_language, the column''s own type, decides which values are legal. It stays a trigger rather than a CHECK on purpose: EXECUTE on a trigger function is checked when the trigger is created, so this never needs a grant to authenticated, and therefore never needs a classification in the authorization spine, for a rule no caller has any business invoking.';


--
-- Name: FUNCTION validate_profile_spoken_languages(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_profile_spoken_languages() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_profile_spoken_languages() TO service_role;


