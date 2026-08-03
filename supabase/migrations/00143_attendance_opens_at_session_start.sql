-- Attendance opens at the session's scheduled START, not its end.
--
-- 00138 shipped record_attendance refusing any mark until the session had
-- FINISHED (ends_at <= now()). That was an over-strict reading of "attendance
-- is past-only": the rule exists to stop marking children present for a
-- session that has not happened, but a session in progress IS happening — and
-- the standard pattern is the opposite of what the check allowed. A gedu
-- starts the club, does a roll call, and writes attendance down right there,
-- while they can still see who is in the room. Refusing until the end made the
-- most natural moment to record the one moment that failed.
--
-- It also made the UI and the server disagree: the feed derives an entry's
-- kind from the START instant, so a running session offers the record editor
-- while the server still refused its marks. Moving the boundary to the start
-- makes both sides derive from the same instant.
--
-- Future sessions stay refused — nothing has started, so there is nothing to
-- have attended. Notes were never gated and are unchanged.
--
-- Same signature, so CREATE OR REPLACE keeps the 00138 grants
-- (authenticated + service_role) and the spine classification.
CREATE OR REPLACE FUNCTION public.record_attendance(
  p_group_id uuid,
  p_session_date date,
  p_gamer_id uuid,
  p_status text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_starts_at  timestamptz;
  v_status     text := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_uid        uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  IF NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Authorize the TARGET as well as the actor: the child must actually be on
  -- this group's roster. Without this, an assigned gedu could aim a mark at any
  -- gamer id in the system.
  IF NOT EXISTS (
    SELECT 1
      FROM public.participations part
     WHERE part.group_id = p_group_id
       AND part.gamer_id = p_gamer_id
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
  -- because there is nothing yet to have attended.
  IF v_starts_at > now() THEN
    RAISE EXCEPTION 'Attendance can only be recorded once the session has started'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status IS NULL THEN
    DELETE FROM public.session_attendance
     WHERE session_id = v_session_id AND gamer_id = p_gamer_id;

    RETURN jsonb_build_object(
      'session_id', v_session_id,
      'gamer_id',   p_gamer_id,
      'status',     NULL
    );
  END IF;

  INSERT INTO public.session_attendance (
    session_id, gamer_id, status, recorded_by
  )
  VALUES (v_session_id, p_gamer_id, v_status, v_uid)
  ON CONFLICT (session_id, gamer_id) DO UPDATE
    SET status      = EXCLUDED.status,
        recorded_by = EXCLUDED.recorded_by,
        recorded_at = now();

  -- The session's audit trail follows the marks: recording attendance IS a
  -- write to the session, even when neither note changed.
  UPDATE public.group_sessions
     SET updated_by = v_uid, updated_at = now()
   WHERE id = v_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'gamer_id',   p_gamer_id,
    'status',     v_status
  );
END;
$$;

COMMENT ON FUNCTION public.record_attendance(uuid, date, uuid, text) IS
  'Record (or, with a NULL status, clear) ONE child''s attendance mark for one session. Per-mark so concurrent gedus cannot clobber each other; marks open at the session''s scheduled start (roll call during the session is the standard pattern) and never before; authorizes both the calling gedu and the target child.';
