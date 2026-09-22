--
-- Name: set_session_substitution(uuid, date, uuid, uuid, public.substitution_reason, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_session_substitution(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.substitution_reason DEFAULT NULL::public.substitution_reason, p_reason_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.session_substitution_requests;
  v_exists boolean;
  v_role   public.gedu_assignment_role;
  v_note   text;
BEGIN
  PERFORM public.assert_admin();

  IF p_group_id IS NULL OR p_session_date IS NULL
     OR p_absent_gedu_id IS NULL OR p_sub_gedu_id IS NULL THEN
    RAISE EXCEPTION 'set_session_substitution needs a group, a date, an absent gedu and a sub'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.product_groups g WHERE g.id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  -- The ordinary writable-date check and NOTHING MORE: there is deliberately no
  -- today-or-later requirement here. This is the retroactive path — an
  -- off-platform substitution that has already happened has to be recordable, because
  -- gedu invoicing reads these rows.
  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_reason_note, '')), '');

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.group_id     = p_group_id
     AND r.session_date = p_session_date
     AND r.requested_by = p_absent_gedu_id
     AND r.status <> 'withdrawn'::public.substitution_request_status
     FOR UPDATE;
  v_exists := FOUND;

  IF NOT v_exists THEN
    -- No request: the admin is filing one on the absent gedu's behalf, so the
    -- absent gedu has to actually be expected at the session.
    IF NOT public.gedu_is_expected_at_session(
             p_absent_gedu_id, p_group_id, p_session_date
           ) THEN
      RAISE EXCEPTION 'gedu % is not expected at group % on %',
                      p_absent_gedu_id, p_group_id, p_session_date
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT a.role INTO v_role
      FROM public.gedu_group_assignments a
     WHERE a.group_id = p_group_id
       AND a.gedu_id  = p_absent_gedu_id;

    IF v_role IS NULL THEN
      SELECT r2.role INTO v_role
        FROM public.session_substitution_requests r2
       WHERE r2.group_id     = p_group_id
         AND r2.session_date = p_session_date
         AND r2.substitute_id   = p_absent_gedu_id
         AND r2.status       = 'substituted'::public.substitution_request_status
       LIMIT 1;
    END IF;

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'no role to substitute for gedu % on group % (%)',
                      p_absent_gedu_id, p_group_id, p_session_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT public.gedu_may_substitute_session(
           p_sub_gedu_id, p_group_id, p_session_date, p_absent_gedu_id
         ) THEN
    RAISE EXCEPTION 'gedu % cannot substitute on group % on %',
                    p_sub_gedu_id, p_group_id, p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_exists THEN
    -- An OPEN request becomes substituted — which is what "set a sub" reads as when
    -- the absent gedu has already asked. A request that is ALREADY SUBSTITUTED is
    -- RE-POINTED at the new sub, so replacing a sub is one action rather than a
    -- clear followed by a set. `approved_by` is the acting admin either way.
    -- Reason and note are only overwritten when this call supplies them, so an
    -- admin replacing a sub does not blank what the gedu wrote.
    UPDATE public.session_substitution_requests
       SET status      = 'substituted'::public.substitution_request_status,
           substitute_id  = p_sub_gedu_id,
           approved_by = v_caller,
           approved_at = now(),
           reason      = COALESCE(p_reason, reason),
           reason_note = COALESCE(v_note, reason_note)
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.session_substitution_requests
      (group_id, session_date, requested_by, role, reason, reason_note,
       status, substitute_id, approved_by, approved_at)
    VALUES (p_group_id, p_session_date, p_absent_gedu_id, v_role, p_reason, v_note,
            'substituted'::public.substitution_request_status, p_sub_gedu_id, v_caller, now())
    RETURNING * INTO v_row;
  END IF;

  -- The replace case can UNSEAT the sub who was there, and a displaced sub who
  -- had filed their own absence no longer holds a seat to be absent from.
  PERFORM public.cascade_withdraw_orphaned_substitution_requests(p_group_id, p_session_date);

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = v_row.id;

  RETURN public.substitution_request_document(v_row, true, v_caller);
END;
$$;


--
-- Name: FUNCTION set_session_substitution(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.substitution_reason, p_reason_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_session_substitution(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.substitution_reason, p_reason_note text) IS 'The office-arranged path: an admin names the absent gedu and the sub outright, with no offer involved. Three shapes in one function. With NO request for that seat it files one on the absent gedu''s behalf, created already `substituted` — and the absent gedu must actually be EXPECTED at the session, with the role taken from their assignment or from the substitution they hold. With an OPEN request it marks that request `substituted`, which is what the admin queue''s approve reads as. With an ALREADY SUBSTITUTED one it RE-POINTS the substitution, so replacing a sub is one action rather than a clear and a set, and the displaced sub''s own absence is then swept by the cascade. There is deliberately NO today-or-later requirement — this is the retroactive path, and an off-platform substitution that already happened has to be recordable because gedu invoicing reads these rows. The date still passes the ordinary writable-date check. Reason is optional and is only overwritten when supplied, so an admin replacing a sub does not blank what the gedu wrote. approved_by is the acting admin on every admin path.';


--
-- Name: FUNCTION set_session_substitution(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.substitution_reason, p_reason_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_session_substitution(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.substitution_reason, p_reason_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_session_substitution(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.substitution_reason, p_reason_note text) TO authenticated;
GRANT ALL ON FUNCTION public.set_session_substitution(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.substitution_reason, p_reason_note text) TO service_role;


