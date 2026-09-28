--
-- Name: validate_gedu_assignment_product(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_gedu_assignment_product() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_group_product_id UUID;
BEGIN
  SELECT product_id INTO v_group_product_id
    FROM public.product_groups
    WHERE id = NEW.group_id;

  IF v_group_product_id IS NULL THEN
    RAISE EXCEPTION 'group_id % does not exist', NEW.group_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.product_id IS NULL THEN
    NEW.product_id := v_group_product_id;
  ELSIF NEW.product_id <> v_group_product_id THEN
    RAISE EXCEPTION 'gedu_group_assignments.product_id % does not match group %''s product_id %',
      NEW.product_id, NEW.group_id, v_group_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_gedu_assignment_product(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_gedu_assignment_product() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_gedu_assignment_product() TO service_role;


