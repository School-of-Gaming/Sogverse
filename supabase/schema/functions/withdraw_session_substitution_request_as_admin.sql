--
-- Name: withdraw_session_substitution_request_as_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.withdraw_session_substitution_request_as_admin(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller       uuid := (SELECT auth.uid());
  v_group_id     uuid;
  v_session_date date;
  v_row          public.session_substitution_requests;
BEGIN
  PERFORM public.assert_admin();

  SELECT r.group_id, r.session_date INTO v_group_id, v_session_date
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Substitution request not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.product_groups g WHERE g.id = v_group_id FOR UPDATE;

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id
     FOR UPDATE;

  IF v_row.status = 'withdrawn'::public.substitution_request_status THEN
    RAISE EXCEPTION 'this substitution request is already withdrawn'
      USING ERRCODE = 'check_violation';
  END IF;

  -- "The absent gedu is attending after all." The three substitution columns are
  -- blanked with the status because chk_substitution_state forbids a withdrawn row from
  -- carrying a sub — so withdrawing a SUBSTITUTED request unwinds the substitution
  -- rather than freezing it, and the cascade then cleans up after the sub.
  UPDATE public.session_substitution_requests
     SET status      = 'withdrawn'::public.substitution_request_status,
         substitute_id  = NULL,
         approved_by = NULL,
         approved_at = NULL
   WHERE id = p_request_id
  RETURNING * INTO v_row;

  PERFORM public.cascade_withdraw_orphaned_substitution_requests(v_group_id, v_session_date);

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id;

  RETURN public.substitution_request_document(v_row, true, v_caller);
END;
$$;


--
-- Name: FUNCTION withdraw_session_substitution_request_as_admin(p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.withdraw_session_substitution_request_as_admin(p_request_id uuid) IS '"The absent gedu is attending after all": any non-withdrawn request -> `withdrawn`, from the admin session-card editor. The three substitution columns are blanked with the status, because chk_substitution_state forbids a withdrawn row from carrying a sub — so withdrawing a SUBSTITUTED request unwinds the substitution rather than freezing it, and the same fixpoint cascade as clear_session_substitution then cleans up after the displaced sub. Distinct from withdraw_session_substitution_request, which is the gedu''s own and works on an `open` request only.';


--
-- Name: FUNCTION withdraw_session_substitution_request_as_admin(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.withdraw_session_substitution_request_as_admin(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.withdraw_session_substitution_request_as_admin(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.withdraw_session_substitution_request_as_admin(p_request_id uuid) TO service_role;


