--
-- Name: set_location_depth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_location_depth() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_parent_depth smallint;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  SELECT l.depth INTO v_parent_depth
    FROM public.locations l
   WHERE l.id = NEW.parent_id;

  -- A BEFORE trigger runs ahead of the FK check, so a parent_id pointing at no
  -- row arrives here first. Raising the FK error ourselves is what the products
  -- location trigger does for the same case: without it the assignment below
  -- would write NULL into a NOT NULL column and report a constraint the caller
  -- did not violate.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'locations.parent_id % references no row', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.depth := v_parent_depth + 1;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION set_location_depth(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_location_depth() FROM PUBLIC;


