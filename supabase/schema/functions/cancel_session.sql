--
-- Name: cancel_session(uuid, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_session(p_group_id uuid, p_session_date date, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_row    public.session_cancellations;
BEGIN
  PERFORM public.assert_admin();

  IF p_group_id IS NULL OR p_session_date IS NULL THEN
    RAISE EXCEPTION 'cancel_session needs a group and a date'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.product_groups g WHERE g.id = p_group_id) THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  -- The schedule must project the date, but there is deliberately no visible
  -- horizon: an admin calling off a session months ahead inside the term (a
  -- holiday, a closed venue) is the ordinary case, and a past session is
  -- cancellable too.
  IF NOT public.group_session_date_is_scheduled(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- The lock every session write takes, so a write in flight either lands
  -- before this cancellation or is refused after it. A stored record on the
  -- date is no bar: the admin's word wins, and the record is kept, frozen and
  -- hidden until a restore.
  PERFORM public.lock_group_session_key(p_group_id, p_session_date);

  -- Cancelling a cancelled session re-words it: the reason is replaced and the
  -- stamp moves to this admin, so the record names who wrote the reason shown.
  INSERT INTO public.session_cancellations
    (group_id, session_date, reason, cancelled_by)
  VALUES (p_group_id, p_session_date, v_reason, v_caller)
  ON CONFLICT (group_id, session_date) DO UPDATE
    SET reason       = EXCLUDED.reason,
        cancelled_by = EXCLUDED.cancelled_by,
        cancelled_at = now()
  RETURNING * INTO v_row;

  RETURN public.session_cancellation_document(v_row, true)
         || jsonb_build_object('group_id', v_row.group_id);
END;
$$;


--
-- Name: FUNCTION cancel_session(p_group_id uuid, p_session_date date, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cancel_session(p_group_id uuid, p_session_date date, p_reason text) IS 'An admin cancels one session — a (group, date) the current schedule projects, past or future, with no visible-horizon bound. The optional reason is trimmed and nulled when blank. A date that already holds a record (report, note, photo or attendance) is cancelled all the same: the admin''s word wins, nothing is deleted, and the record stays frozen and hidden until a restore. Taken under the (group, date) advisory lock every session write also takes. Cancelling an already-cancelled session is an UPSERT: the reason is replaced and cancelled_by / cancelled_at move to the caller. Returns the cancellation document with every admin field, plus group_id. Admin-only, guard-first.';


--
-- Name: FUNCTION cancel_session(p_group_id uuid, p_session_date date, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_session(p_group_id uuid, p_session_date date, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_session(p_group_id uuid, p_session_date date, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_session(p_group_id uuid, p_session_date date, p_reason text) TO service_role;


