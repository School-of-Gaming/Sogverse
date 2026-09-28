--
-- Name: withdraw_session_substitution_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.withdraw_session_substitution_request(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.session_substitution_requests;
BEGIN
  PERFORM public.assert_role('gedu');

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id
     FOR UPDATE;

  -- A request that is not there and a request that is somebody else's are
  -- refused identically, so this cannot be used as an oracle for real ids.
  IF NOT FOUND OR v_row.requested_by IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- `open` only. The requester cannot withdraw after approval — once an admin
  -- has staffed the session, changing it back is the admin's call, which is what
  -- the session-card editor is for.
  IF v_row.status <> 'open'::public.substitution_request_status THEN
    RAISE EXCEPTION 'this substitution request is % and can no longer be withdrawn by its requester', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.session_substitution_requests
     SET status = 'withdrawn'::public.substitution_request_status
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN public.substitution_request_document(v_row, false, v_caller);
END;
$$;


--
-- Name: FUNCTION withdraw_session_substitution_request(p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.withdraw_session_substitution_request(p_request_id uuid) IS '"I can make it after all", while the request is still `open`. Caller must be the requester, and a request that is somebody else''s is refused exactly as one that does not exist is, so this cannot be used as an oracle for real ids. Refused once an admin has approved a substitution: after that, unwinding it is the admin''s call through clear_session_substitution or withdraw_session_substitution_request_as_admin, because somebody has been told they are working. A withdrawn row is history and does not block a fresh request for the same seat — the live-seat unique index is partial on exactly that.';


--
-- Name: FUNCTION withdraw_session_substitution_request(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.withdraw_session_substitution_request(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.withdraw_session_substitution_request(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.withdraw_session_substitution_request(p_request_id uuid) TO service_role;


