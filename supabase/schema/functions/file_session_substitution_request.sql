--
-- Name: file_session_substitution_request(uuid, uuid, date, public.substitution_reason, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.file_session_substitution_request(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_timezone text;
  v_role     public.gedu_assignment_role;
  v_note     text;
  v_row      public.session_substitution_requests;
BEGIN
  -- The authorization IS the derivation: you may file an absence only for a
  -- session you are expected at. That admits an assigned gedu and an approved
  -- sub alike — which is the whole of "a sub can ask for a sub" — and refuses
  -- somebody who already has a live request, so filing twice is impossible
  -- before the unique index has to say so.
  IF NOT public.gedu_is_expected_at_session(p_gedu_id, p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL THEN
    RAISE EXCEPTION 'a substitution request needs a reason category'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cancellation: nobody needs cover for a session that is not happening.
  IF public.group_session_is_cancelled(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', p_session_date
      USING ERRCODE = 'P0026';
  END IF;

  SELECT p.timezone INTO v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- Today or later in the PRODUCT's timezone. Date granularity on purpose: the
  -- handbook's own norm is same-day filing, and a date comparison needs no
  -- schedule expansion. This is deliberately LOOSER than the card, which hides
  -- the action once the session's end has passed — same posture as every other
  -- write validator here.
  IF p_session_date < (now() AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'a substitution request cannot be filed for a past session (%)', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- The role being substituted: the filer's assignment role, or — when the filer is
  -- themselves a sub — the role stored on the substitution they hold.
  SELECT a.role INTO v_role
    FROM public.gedu_group_assignments a
   WHERE a.group_id = p_group_id
     AND a.gedu_id  = p_gedu_id;

  IF v_role IS NULL THEN
    SELECT r.role INTO v_role
      FROM public.session_substitution_requests r
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.substitute_id   = p_gedu_id
       AND r.status       = 'substituted'::public.substitution_request_status
     LIMIT 1;
  END IF;

  -- Unreachable while the derivation holds — being expected means one of the two
  -- reads above found something — and stated so the NOT NULL column cannot fail
  -- with a constraint name instead of a sentence.
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'no role to substitute for gedu % on group % (%)', p_gedu_id, p_group_id, p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_reason_note, '')), '');

  INSERT INTO public.session_substitution_requests
    (group_id, session_date, requested_by, role, reason, reason_note)
  VALUES (p_group_id, p_session_date, p_gedu_id, v_role, p_reason, v_note)
  RETURNING * INTO v_row;

  RETURN public.substitution_request_document(v_row, false, p_gedu_id);
END;
$$;


--
-- Name: FUNCTION file_session_substitution_request(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.file_session_substitution_request(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) IS '"I cannot make this session", filed for the given gedu: the one body of that write, behind request_session_substitution (the web, for auth.uid()) and request_session_substitution_for_discord_user (the Discord bot, for the linked gedu). Makes no role test of its own: each caller has already established that the gedu is a gedu. The AUTHORIZATION IS THE DERIVATION: the gedu must be EXPECTED at that session, which admits an assigned gedu and an approved sub alike (that is the whole of "a sub can ask for a sub") and refuses anyone who already holds a live request, with 42501. The reason category is required here and only here — an admin recording an off-platform substitution may not know it. The date must pass the ordinary writable-date check, must not be a cancelled session (P0026), AND must be today or later in the PRODUCT''s timezone; date granularity is deliberate, the handbook''s own norm being same-day filing, and it is deliberately looser than the card, which hides the action once the session''s end has passed. The role substituted is snapshotted from the gedu''s assignment role, or from the role on the substitution they hold when the gedu is themselves a sub. reason_note is trimmed, nulled when empty, and capped at 500 characters by the table''s own CHECK. Returns the request document as the filer reads it, without reason or reason_note: the filer''s own words come back from the form, and every other gedu-facing document keeps them off the wire. Granted to nobody: reachable only through its two wrappers.';


--
-- Name: FUNCTION file_session_substitution_request(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.file_session_substitution_request(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) FROM PUBLIC;


