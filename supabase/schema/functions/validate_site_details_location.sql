--
-- Name: validate_site_details_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_site_details_location() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  loc_type public.location_type;
BEGIN
  SELECT type INTO loc_type FROM public.locations WHERE id = NEW.location_id;
  IF loc_type IS NULL THEN
    RAISE EXCEPTION 'location_id % does not exist', NEW.location_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF loc_type <> 'site' THEN
    RAISE EXCEPTION 'site detail rows are only valid for type=site (got %)', loc_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_site_details_location(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_site_details_location() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_site_details_location() TO service_role;


