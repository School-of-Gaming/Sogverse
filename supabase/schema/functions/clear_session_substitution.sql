--
-- Name: clear_session_substitution(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_session_substitution(p_request_id uuid) RETURNS jsonb
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

  -- Group first, then the row: one lock order across all four admin writes.
  PERFORM 1 FROM public.product_groups g WHERE g.id = v_group_id FOR UPDATE;

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id
     FOR UPDATE;

  IF v_row.status <> 'substituted'::public.substitution_request_status THEN
    RAISE EXCEPTION 'this substitution request is % and has no substitute to clear', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Back to `open`, so the session returns to the pool and to the admin queue.
  -- The offers are left alone: they are still people who said they could come.
  UPDATE public.session_substitution_requests
     SET status      = 'open'::public.substitution_request_status,
         substitute_id  = NULL,
         approved_by = NULL,
         approved_at = NULL
   WHERE id = p_request_id
  RETURNING * INTO v_row;

  PERFORM public.cascade_withdraw_orphaned_substitution_requests(v_group_id, v_session_date);

  -- Re-read: the sweep can have withdrawn THIS row too, when its own requester
  -- was themselves a sub who has just been unseated.
  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id;

  RETURN public.substitution_request_document(v_row, true, v_caller);
END;
$$;


--
-- Name: FUNCTION clear_session_substitution(p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.clear_session_substitution(p_request_id uuid) IS '"That sub is not coming": `substituted` -> `open`, blanking substitute_id, approved_by and approved_at, so the session returns to the pool list and to the admin queue. The offers are left alone — they are still people who said they could come. Then the fixpoint cascade runs over that (group, date), which is what withdraws the cleared sub''s OWN request if they had filed one: they no longer hold a seat there to be absent from. The cascade can also withdraw THIS row, when its requester was themselves a sub who has just been unseated, which is why the document is re-read before it is returned.';


--
-- Name: FUNCTION clear_session_substitution(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clear_session_substitution(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clear_session_substitution(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.clear_session_substitution(p_request_id uuid) TO service_role;


