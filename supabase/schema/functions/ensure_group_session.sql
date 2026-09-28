--
-- Name: ensure_group_session(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_group_session(p_group_id uuid, p_session_date date) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_window     tstzrange;
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
BEGIN
  -- Cancellation: nothing is written on a cancelled date, whether or not it
  -- already holds a row — a record kept under a cancellation is frozen until
  -- the session is restored. Asked first, under the (group, date) lock
  -- cancel_session also takes, so a write cannot land past a cancellation
  -- committed beside it. Every session write that names a date (notes,
  -- attendance, a photo) reaches the table through here, which is what makes
  -- this the one refusal they share.
  PERFORM public.lock_group_session_key(p_group_id, p_session_date);

  IF EXISTS (
       SELECT 1
         FROM public.session_cancellations c
        WHERE c.group_id     = p_group_id
          AND c.session_date = p_session_date
     ) THEN
    RAISE EXCEPTION 'The session on % is cancelled', p_session_date
      USING ERRCODE = 'P0026';
  END IF;

  SELECT id INTO v_session_id
    FROM public.group_sessions
   WHERE group_id = p_group_id AND session_date = p_session_date;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  v_window := public.derive_group_session_window(p_group_id, p_session_date);
  IF v_window IS NULL THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.group_sessions (
    group_id, session_date, starts_at, ends_at, created_by, updated_by
  )
  VALUES (
    p_group_id, p_session_date, lower(v_window), upper(v_window), v_uid, v_uid
  )
  ON CONFLICT (group_id, session_date) DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    -- A concurrent writer materialized it between the SELECT and the INSERT.
    -- Theirs is the snapshot; take it rather than overwriting.
    SELECT id INTO v_session_id
      FROM public.group_sessions
     WHERE group_id = p_group_id AND session_date = p_session_date;
  END IF;

  RETURN v_session_id;
END;
$$;


--
-- Name: FUNCTION ensure_group_session(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ensure_group_session(p_group_id uuid, p_session_date date) IS 'Find-or-create the session row for a (group, date), snapshotting the schedule instants at first write and never re-deriving them afterwards. Refuses a CANCELLED date with SQLSTATE P0026 whether or not it already holds a row — a record kept under a cancellation is frozen until a restore — asked first, under the (group, date) advisory lock cancel_session also takes. That is the one refusal every dated session write (notes, attendance, a photo) shares, since each reaches the table through here.';


--
-- Name: FUNCTION ensure_group_session(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_group_session(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_group_session(p_group_id uuid, p_session_date date) TO service_role;


