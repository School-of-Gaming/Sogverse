--
-- Name: stamp_testimonial_saver(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_testimonial_saver() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_by  uuid := auth.uid();
  v_via uuid;
BEGIN
  -- A client is recorded only beside a saver: with no signed-in caller there
  -- is no token whose claim could name one.
  IF v_by IS NOT NULL THEN
    v_via := (auth.jwt() ->> 'client_id')::uuid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at  := now();
    NEW.created_by  := v_by;
    NEW.created_via := v_via;
  ELSE
    NEW.created_at  := OLD.created_at;
    NEW.created_by  := OLD.created_by;
    NEW.created_via := OLD.created_via;
  END IF;

  NEW.updated_at     := now();
  NEW.last_saved_by  := v_by;
  NEW.last_saved_via := v_via;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION stamp_testimonial_saver(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.stamp_testimonial_saver() IS 'BEFORE INSERT, and BEFORE UPDATE OF updated_at, on testimonials: stamps who created the testimonial and when on the insert (and keeps them on every update), and who last saved it, when, and through which AI app (the token''s client_id claim) on both, overwriting whatever the statement said — so it is those columns'' only writer. Every testimonial writer names updated_at. The column list keeps a profile deletion''s SET NULL on created_by or last_saved_by from being re-stamped as a save by whoever deleted the account.';


--
-- Name: FUNCTION stamp_testimonial_saver(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.stamp_testimonial_saver() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stamp_testimonial_saver() TO service_role;


