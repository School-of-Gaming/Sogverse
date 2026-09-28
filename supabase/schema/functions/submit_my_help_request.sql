--
-- Name: submit_my_help_request(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_my_help_request(p_message text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  -- Not reachable through PostgREST as `authenticated` (that role's JWT always
  -- carries a subject), but an unattributable help request is worse than a
  -- refused one, so this fails closed rather than inserting NULL.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_message IS NULL OR length(p_message) < 10 OR length(p_message) > 2000 THEN
    RAISE EXCEPTION 'help request message must be between 10 and 2000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Returns false (not an error) when the per-hour rate limit is hit; the route
  -- maps that to 429.
  RETURN public.submit_help_request(v_user_id, p_message);
END;
$$;


--
-- Name: FUNCTION submit_my_help_request(p_message text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.submit_my_help_request(p_message text) IS 'Self-scoping help request: writes a help_requests row for auth.uid(), rate-limited and length-bounded. Returns false when rate-limited.';


--
-- Name: FUNCTION submit_my_help_request(p_message text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_my_help_request(p_message text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_my_help_request(p_message text) TO authenticated;
GRANT ALL ON FUNCTION public.submit_my_help_request(p_message text) TO service_role;


