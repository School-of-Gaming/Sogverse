--
-- Name: request_session_substitution(uuid, date, public.substitution_reason, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason DEFAULT NULL::public.substitution_reason, p_reason_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_timezone text;
  v_role     public.gedu_assignment_role;
  v_note     text;
  v_row      public.session_substitution_requests;
BEGIN
  PERFORM public.assert_role('gedu');

  -- The authorization IS the derivation: you may file an absence only for a
  -- session you are expected at. That admits an assigned gedu and an approved
  -- sub alike — which is the whole of "a sub can ask for a sub" — and refuses
  -- somebody who already has a live request, so filing twice is impossible
  -- before the unique index has to say so.
  IF NOT public.gedu_is_expected_at_session(v_caller, p_group_id, p_session_date) THEN
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
     AND a.gedu_id  = v_caller;

  IF v_role IS NULL THEN
    SELECT r.role INTO v_role
      FROM public.session_substitution_requests r
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.substitute_id   = v_caller
       AND r.status       = 'substituted'::public.substitution_request_status
     LIMIT 1;
  END IF;

  -- Unreachable while the derivation holds — being expected means one of the two
  -- reads above found something — and stated so the NOT NULL column cannot fail
  -- with a constraint name instead of a sentence.
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'no role to substitute for gedu % on group % (%)', v_caller, p_group_id, p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_reason_note, '')), '');

  INSERT INTO public.session_substitution_requests
    (group_id, session_date, requested_by, role, reason, reason_note)
  VALUES (p_group_id, p_session_date, v_caller, v_role, p_reason, v_note)
  RETURNING * INTO v_row;

  RETURN public.substitution_request_document(v_row, false, v_caller);
END;
$$;


--
-- Name: FUNCTION request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) IS '"I cannot make this session", filed by a gedu from a future session''s card. The AUTHORIZATION IS THE DERIVATION: the caller must be EXPECTED at that session, which admits an assigned gedu and an approved sub alike (that is the whole of "a sub can ask for a sub") and refuses anyone who already holds a live request. The reason category is required here and only here — an admin recording an off-platform substitution may not know it. The date must pass the ordinary writable-date check AND be today or later in the PRODUCT''s timezone; date granularity is deliberate, the handbook''s own norm being same-day filing, and it is deliberately looser than the card, which hides the action once the session''s end has passed. The role substituted is snapshotted from the caller''s assignment role, or from the role on the substitution they hold when the caller is themselves a sub. reason_note is trimmed, nulled when empty, and capped at 500 characters by the table''s own CHECK. Returns the request document without reason or reason_note: the filer''s own words come back from the form, and every other gedu-facing document keeps them off the wire.';


--
-- Name: FUNCTION request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) TO authenticated;
GRANT ALL ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) TO service_role;


