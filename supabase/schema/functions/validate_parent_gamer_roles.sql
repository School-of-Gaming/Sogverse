--
-- Name: validate_parent_gamer_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_parent_gamer_roles() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  parent_role user_role;
  gamer_role user_role;
BEGIN
  SELECT role INTO parent_role FROM profiles WHERE id = NEW.parent_id;
  SELECT role INTO gamer_role FROM profiles WHERE id = NEW.gamer_id;

  IF parent_role != 'customer' THEN
    RAISE EXCEPTION 'Parent must be a customer account, got: %', parent_role;
  END IF;

  IF gamer_role != 'gamer' THEN
    RAISE EXCEPTION 'Child must be a gamer account, got: %', gamer_role;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_parent_gamer_roles(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_parent_gamer_roles() TO anon;
GRANT ALL ON FUNCTION public.validate_parent_gamer_roles() TO authenticated;
GRANT ALL ON FUNCTION public.validate_parent_gamer_roles() TO service_role;


