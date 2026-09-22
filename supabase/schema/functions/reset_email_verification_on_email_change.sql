--
-- Name: reset_email_verification_on_email_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_email_verification_on_email_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- A no-op rewrite of the same address is not a change and must not cost the
  -- family their verified state; only a different string does.
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION reset_email_verification_on_email_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_email_verification_on_email_change() FROM PUBLIC;


