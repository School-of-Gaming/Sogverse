--
-- Name: submit_help_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_help_request(p_user_id uuid, p_message text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  -- Advisory lock keyed to user prevents concurrent rate-limit bypass
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT count(*) INTO v_count
  FROM help_requests
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 hour';

  IF v_count >= 6 THEN
    RETURN false;
  END IF;

  INSERT INTO help_requests (user_id, message)
  VALUES (p_user_id, p_message);

  RETURN true;
END;
$$;


--
-- Name: FUNCTION submit_help_request(p_user_id uuid, p_message text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_help_request(p_user_id uuid, p_message text) FROM PUBLIC;


