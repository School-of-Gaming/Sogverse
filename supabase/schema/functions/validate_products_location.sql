--
-- Name: validate_products_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_products_location() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  loc_type public.location_type;
BEGIN
  IF NEW.location_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT type INTO loc_type FROM public.locations WHERE id = NEW.location_id;
  IF loc_type IS NULL THEN
    RAISE EXCEPTION 'location_id % does not exist', NEW.location_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.is_remote = false THEN
    IF loc_type <> 'site' THEN
      RAISE EXCEPTION 'In-person product location must be a site (got %)', loc_type
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.product_type = 'municipality_club' THEN
    IF loc_type NOT IN ('country', 'region', 'municipality') THEN
      RAISE EXCEPTION 'Online municipality club location must be country/region/municipality (got %)', loc_type
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_products_location(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_products_location() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_products_location() TO service_role;


