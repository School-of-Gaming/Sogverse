--
-- Name: validate_participations_group(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_participations_group() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_group_product_id UUID;
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT product_id INTO v_group_product_id
    FROM public.product_groups
    WHERE id = NEW.group_id;

  IF v_group_product_id IS NULL THEN
    RAISE EXCEPTION 'group_id % does not exist', NEW.group_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_group_product_id <> NEW.product_id THEN
    RAISE EXCEPTION 'group_id % belongs to a different product', NEW.group_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_participations_group(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_participations_group() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_participations_group() TO service_role;


