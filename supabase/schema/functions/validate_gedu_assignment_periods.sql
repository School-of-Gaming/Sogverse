--
-- Name: validate_gedu_assignment_periods(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_gedu_assignment_periods() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'an assignment period''s start does not move (period %)', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at THEN
      RAISE EXCEPTION 'an assignment period ends once (period % ended at %)', OLD.id, OLD.ended_at
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A missing start and an end at or before the start are the NOT NULL's and
  -- the CHECK's to refuse, under their own names; a range cannot be built from
  -- either.
  IF NEW.started_at IS NULL OR NEW.ended_at <= NEW.started_at THEN
    RETURN NEW;
  END IF;

  -- The key validate_one_gedu_seat_per_product takes, so every write about one
  -- gedu's seats on one product queues behind the others.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('gedu_seat:' || NEW.gedu_id::text || ':' || NEW.product_id::text, 0)
  );

  -- Two LIVE periods overlap as well, and are left to the partial unique
  -- index, which refuses them with the unique_violation an admin assigning one
  -- gedu to two groups of a product has always met.
  IF EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments a
     WHERE a.gedu_id    = NEW.gedu_id
       AND a.product_id = NEW.product_id
       AND a.id        <> NEW.id
       AND NOT (a.ended_at IS NULL AND NEW.ended_at IS NULL)
       AND tstzrange(a.started_at, a.ended_at, '[)')
           && tstzrange(NEW.started_at, NEW.ended_at, '[)')
  ) THEN
    RAISE EXCEPTION 'gedu % already holds an assignment period on product % overlapping [%, %)',
      NEW.gedu_id, NEW.product_id, NEW.started_at, NEW.ended_at
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_gedu_assignment_periods(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_gedu_assignment_periods() IS 'Trigger on gedu_group_assignments: no two periods of one (gedu, product) overlap, closed ones included, refused with exclusion_violation — the constraint btree_gist would otherwise express. Two live periods are left to the partial unique index and its unique_violation. Also refuses moving a period''s start and moving an end once set (check_violation): a period ends once. Takes the same transaction-scoped advisory lock on the (gedu, product) pair as validate_one_gedu_seat_per_product, so racing writers queue rather than each finding the other absent.';


--
-- Name: FUNCTION validate_gedu_assignment_periods(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_gedu_assignment_periods() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_gedu_assignment_periods() TO service_role;


