--
-- Name: record_attendance(uuid, date, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_starts_at  timestamptz;
  v_status     text := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_uid        uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Authorize the TARGET as well as the actor: the person must actually be on
  -- this group's roster. Without this, an assigned gedu could aim a mark at any
  -- profile id in the system. It binds an ADMIN identically — the privilege
  -- granted above is a gedu's, not a licence to write a record a gedu could
  -- not. The predicate has never cared who the participant is, which is why an
  -- adult seat is markable with no branch here.
  IF NOT EXISTS (
    SELECT 1
      FROM public.participations part
     WHERE part.group_id = p_group_id
       AND part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_session_id := public.ensure_group_session(p_group_id, p_session_date);

  SELECT starts_at INTO v_starts_at
    FROM public.group_sessions WHERE id = v_session_id;

  -- The roll-call boundary: marks open the moment the session's scheduled
  -- start passes. A session under way takes attendance — that is when the gedu
  -- can see who is in the room — while a session that has not started cannot,
  -- because there is nothing yet to have attended. An admin is bound by it too:
  -- it is a fact about the record, not about who is writing it.
  IF v_starts_at > now() THEN
    RAISE EXCEPTION 'Attendance can only be recorded once the session has started'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status IS NULL THEN
    DELETE FROM public.session_attendance
     WHERE session_id = v_session_id AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
      'session_id',     v_session_id,
      'participant_id', p_participant_id,
      'status',         NULL
    );
  END IF;

  INSERT INTO public.session_attendance (
    session_id, participant_id, status, recorded_by
  )
  VALUES (v_session_id, p_participant_id, v_status, v_uid)
  ON CONFLICT (session_id, participant_id) DO UPDATE
    SET status      = EXCLUDED.status,
        recorded_by = EXCLUDED.recorded_by,
        recorded_at = now();

  -- The session's audit trail follows the marks: recording attendance IS a
  -- write to the session, even when neither note changed.
  UPDATE public.group_sessions
     SET updated_by = v_uid, updated_at = now()
   WHERE id = v_session_id;

  RETURN jsonb_build_object(
    'session_id',     v_session_id,
    'participant_id', p_participant_id,
    'status',         v_status
  );
END;
$$;


--
-- Name: FUNCTION record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) IS 'Record (or, with a NULL status, clear) ONE participant''s attendance mark for one session. Per-mark so concurrent writers cannot clobber each other; marks open at the session''s scheduled start (roll call during the session is the standard pattern) and never before. Open to an ADMIN or to the gedu assigned to the group — the guard admits either role and only the assignment half of the gate is skipped for an admin. The TARGET check is not: both callers must aim the mark at somebody who actually holds an active seat in the group, and both are refused before the session starts. The target is whoever holds the seat — an adult is marked present exactly as a child is, with no branch for it.';


--
-- Name: FUNCTION record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) TO service_role;


