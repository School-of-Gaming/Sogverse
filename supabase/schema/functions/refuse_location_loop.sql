--
-- Name: refuse_location_loop(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refuse_location_loop() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.location_lineage(NEW.parent_id) AS lin
     WHERE lin.location_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'location % cannot move under %, which sits under it', NEW.id, NEW.parent_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION refuse_location_loop(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.refuse_location_loop() IS 'Trigger body of trg_locations_refuse_loop: refuses, with check_violation, a parent_id whose lineage reaches the row being written, so the location tree never holds a loop.';


--
-- Name: FUNCTION refuse_location_loop(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refuse_location_loop() FROM PUBLIC;


