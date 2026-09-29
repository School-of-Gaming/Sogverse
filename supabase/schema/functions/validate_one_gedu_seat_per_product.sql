--
-- Name: validate_one_gedu_seat_per_product(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_one_gedu_seat_per_product() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- Two transactions writing one pair into the two tables would each find the
  -- other table empty. The lock is keyed on the pair, so they queue instead.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('gedu_seat:' || NEW.gedu_id::text || ':' || NEW.product_id::text, 0)
  );

  IF TG_TABLE_NAME = 'gedu_group_trainees' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles pr
       WHERE pr.id = NEW.gedu_id
         AND pr.role = 'gedu'::public.user_role
    ) THEN
      RAISE EXCEPTION 'a trainee seat is held by a gedu, and profile % is not one', NEW.gedu_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.gedu_group_assignments a
       WHERE a.gedu_id = NEW.gedu_id
         AND a.product_id = NEW.product_id
    ) THEN
      RAISE EXCEPTION 'gedu % is assigned on product % and cannot also be a trainee there',
        NEW.gedu_id, NEW.product_id
        USING ERRCODE = 'unique_violation';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.gedu_group_trainees t
       WHERE t.gedu_id = NEW.gedu_id
         AND t.product_id = NEW.product_id
    ) THEN
      RAISE EXCEPTION 'gedu % is a trainee on product % and cannot also be assigned there',
        NEW.gedu_id, NEW.product_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_one_gedu_seat_per_product(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_one_gedu_seat_per_product() IS 'Trigger on gedu_group_assignments and gedu_group_trainees: a gedu holds an assignment or a trainee seat on a product, never both, refused from whichever side is written second with unique_violation — the SQLSTATE each table''s own (gedu_id, product_id) UNIQUE raises for the same kind of clash. On the trainee table it also refuses a seat-holder who is not a gedu. Takes a transaction-scoped advisory lock on the (gedu, product) pair, so two writes racing into the two tables queue rather than each finding the other empty. A promotion is a remove and an add in one apply_group_changes batch, which removes before it adds.';


--
-- Name: FUNCTION validate_one_gedu_seat_per_product(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_one_gedu_seat_per_product() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_one_gedu_seat_per_product() TO service_role;


