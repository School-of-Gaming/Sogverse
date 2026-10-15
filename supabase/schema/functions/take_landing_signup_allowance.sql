--
-- Name: take_landing_signup_allowance(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.take_landing_signup_allowance(p_client_key text) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_count integer;
BEGIN
  -- Without the lock, two concurrent requests from one address both read the
  -- same count and both pass.
  PERFORM pg_advisory_xact_lock(hashtext('landing_signup:' || p_client_key));

  DELETE FROM public.landing_signup_attempts
  WHERE attempted_at <= now() - interval '1 hour';

  SELECT count(*) INTO v_count
  FROM public.landing_signup_attempts
  WHERE client_key = p_client_key;

  IF v_count >= 10 THEN
    RETURN false;
  END IF;

  INSERT INTO public.landing_signup_attempts (client_key)
  VALUES (p_client_key);

  RETURN true;
END;
$$;


--
-- Name: FUNCTION take_landing_signup_allowance(p_client_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.take_landing_signup_allowance(p_client_key text) IS 'The rate limit on landing page email sign-ups: records one attempt for the client key (a sha256 of the request''s origin address) and answers true, or answers false once the key has ten attempts in the trailing hour. Prunes every attempt older than the hour on the way past. Called by the sign-up route on the service-role client, which maps false to 429.';


--
-- Name: FUNCTION take_landing_signup_allowance(p_client_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.take_landing_signup_allowance(p_client_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.take_landing_signup_allowance(p_client_key text) TO service_role;


