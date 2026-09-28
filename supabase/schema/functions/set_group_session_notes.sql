--
-- Name: set_group_session_notes(uuid, date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
  v_row        public.group_sessions;
BEGIN
  -- An admin, or a gedu. Written as one guard call rather than a branch around
  -- one so the authorization spine can read it — see the migration header.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The assignment half of the gate, which is what an admin is exempt from.
  -- Everything below it applies to both callers identically.
  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_session_id := public.ensure_group_session(p_group_id, p_session_date);

  UPDATE public.group_sessions
     SET report     = NULLIF(btrim(COALESCE(p_report, '')), ''),
         gedu_note  = NULLIF(btrim(COALESCE(p_gedu_note, '')), ''),
         updated_by = v_uid
   WHERE id = v_session_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',           v_row.id,
    'group_id',     v_row.group_id,
    'session_date', v_row.session_date,
    'starts_at',    v_row.starts_at,
    'ends_at',      v_row.ends_at,
    'report',       v_row.report,
    'gedu_note',    v_row.gedu_note
  );
END;
$$;


--
-- Name: FUNCTION set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) IS 'Write the family-facing report and the gedu note for one session, materializing the row if needed. Open to an ADMIN or to the gedu assigned to the group: the guard admits either role, and the assignment half of the gate is skipped for an admin only. Everything else binds both alike — an unscheduled date is refused with check_violation, and updated_by is stamped with the caller, so an admin''s edit is attributed to the admin. Last-write-wins.';


--
-- Name: FUNCTION set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) TO service_role;


