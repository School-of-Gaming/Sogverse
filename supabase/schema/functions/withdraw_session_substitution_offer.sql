--
-- Name: withdraw_session_substitution_offer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.withdraw_session_substitution_offer(p_request_id uuid) RETURNS jsonb
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
   WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Keyed on the REQUEST rather than the offer, because the pool list's button
  -- knows which request it is looking at and an offer id would be a second
  -- identifier for the caller's one row. Refused only when the caller is the
  -- approved substitute — taking back an offer somebody already staffed you on is a
  -- new absence, not an un-offer. Withdrawing a LOSING offer on a request
  -- substituted by somebody else is allowed and does nothing visible.
  IF v_row.status = 'substituted'::public.substitution_request_status
     AND v_row.substitute_id = v_caller THEN
    RAISE EXCEPTION 'you are the approved substitute for this session; file a substitution request instead'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.session_substitution_offers o
   WHERE o.request_id = p_request_id
     AND o.gedu_id    = v_caller;

  -- A withdraw that deletes nothing is not a withdraw: it is a READ of somebody
  -- else's absence wearing a write's clothes, and before this it was the
  -- cheapest one on the surface — any certified gedu could hand this function a
  -- request id they had never offered on and be told who was away. It is a
  -- write or it is a refusal, and 42501 is the same answer an unknown id gets,
  -- so it cannot be used to tell a real request from an invented one either.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- CONCEALED, explicitly: see offer_session_substitution above.
  RETURN public.substitution_request_document(v_row, false, v_caller, false);
END;
$$;


--
-- Name: FUNCTION withdraw_session_substitution_offer(p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.withdraw_session_substitution_offer(p_request_id uuid) IS 'Deletes the caller''s offer on one request — an offer nobody accepted is not a fact worth keeping, so there is no withdrawn state for one. Keyed on the REQUEST rather than the offer, because the button knows which request it is looking at and an offer id would be a second identifier for the caller''s one row. Refused only when the caller IS the approved substitute: taking back an offer somebody has already been staffed on is a new absence, which is request_session_substitution''s job. Withdrawing a LOSING offer on a request substituted by somebody else is allowed and changes nothing visible. A caller who holds no offer on the request is REFUSED (42501, the same answer an unknown id gets) rather than deleting nothing and being handed the document anyway: answering would make this the cheapest read on the surface, a lookup of who is away keyed by request id. The document it returns conceals the absent gedu, as offer_session_substitution''s does.';


--
-- Name: FUNCTION withdraw_session_substitution_offer(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.withdraw_session_substitution_offer(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.withdraw_session_substitution_offer(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.withdraw_session_substitution_offer(p_request_id uuid) TO service_role;


