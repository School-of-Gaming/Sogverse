--
-- Name: claim_group_session_report_email(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.group_sessions;
BEGIN
  -- The same two-part gate every write on this surface opens with: the role
  -- first, then the assignment. Guard-first is what the authorization spine
  -- reads, and the assignment half is what makes a NULL group a refusal rather
  -- than a lookup — for a gedu. An admin passes the second half by role.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The assignment half is spelled out INLINE here rather than through
  -- gedu_teaches_group, and that is the whole point of this migration's edit to
  -- this function. gedu_teaches_group now admits a live substitution on ANY of the
  -- group's dates; the family report mail is at-most-once and has no resend, so
  -- a sub must not be able to send the mail for a session they did not run.
  -- The substitution arm is therefore DATE-SCOPED to the session being claimed.
  IF NOT public.is_admin()
     AND NOT EXISTS (
           SELECT 1
             FROM public.gedu_group_assignments ga
            WHERE ga.group_id = p_group_id
              AND ga.gedu_id  = (SELECT auth.uid())
         )
     AND NOT public.gedu_substitutes_session(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE is the whole of the concurrency argument. Two writers (or one
  -- writer with two tabs) serialize here; the second reads the marker the first
  -- committed and is refused below rather than claiming a second time.
  SELECT * INTO v_row
    FROM public.group_sessions s
   WHERE s.group_id     = p_group_id
     AND s.session_date = p_session_date
     FOR UPDATE;

  -- A session row is lazily materialized, so "no row" and "a row with a blank
  -- report" are the same answer to the only question that matters: there is
  -- nothing here to send. The character list matches the summaries SQL exactly
  -- — bare btrim() strips spaces only, and a report of one newline is not a
  -- report.
  IF NOT FOUND
     OR btrim(COALESCE(v_row.report, ''), E' \t\r\n\v\f') = '' THEN
    RAISE EXCEPTION 'No report to email for group % on %', p_group_id, p_session_date
      USING ERRCODE = 'P0021';
  END IF;

  IF v_row.report_emailed_at IS NOT NULL THEN
    RAISE EXCEPTION 'The report for group % on % was already emailed at %',
                    p_group_id, p_session_date, v_row.report_emailed_at
      USING ERRCODE = 'P0022';
  END IF;

  -- `updated_by` is deliberately NOT stamped: claiming the send is not an edit
  -- of the write-up, and moving the author chip onto whoever pressed the button
  -- would misattribute somebody else's report. The updated_at trigger still
  -- fires, which is the honest record that the row changed.
  UPDATE public.group_sessions
     SET report_emailed_at = now(),
         report_emailed_by = (SELECT auth.uid())
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  -- The report travels back so the route composes the mail from what the claim
  -- committed, not from what the client believed was saved.
  RETURN jsonb_build_object(
    'id',                v_row.id,
    'group_id',          v_row.group_id,
    'session_date',      v_row.session_date,
    'starts_at',         v_row.starts_at,
    'ends_at',           v_row.ends_at,
    'report',            v_row.report,
    'report_emailed_at', v_row.report_emailed_at
  );
END;
$$;


--
-- Name: FUNCTION claim_group_session_report_email(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) IS 'Claim the one send of a session report to the group''s families, and hand back the row it claimed. Open to an ADMIN or to the gedu assigned to the group (00200), exactly as the session-notes writer is. Takes the row''s lock, then refuses with SQLSTATE P0021 when there is no report to send (no row, or a report that is empty after the same whitespace trim the summaries SQL applies) and with P0022 when report_emailed_at is already set — both bind an admin identically; otherwise stamps report_emailed_at = now() and report_emailed_by = auth.uid(). The claim is the FIRST write of the send and is also its authorization: succeeding proves the caller may send for this group, which is what lets the route resolve recipients with the service role afterwards. Releasing a claim is the route''s job and happens only when every single mail failed. Since 00272 the assignment half is spelled out INLINE here instead of calling gedu_teaches_group, and that is a security decision rather than a refactor: gedu_teaches_group now admits a live substitution on ANY of the group''s dates, while this mail is at-most-once with no resend, so a sub must not be able to send the families a write-up of a session they did not run. The substitution arm here is therefore DATE-SCOPED to the session being claimed — one of exactly two places on this surface that is, the other being the voice room.';


--
-- Name: FUNCTION claim_group_session_report_email(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) TO authenticated;
GRANT ALL ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) TO service_role;


