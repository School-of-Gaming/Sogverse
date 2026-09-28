-- Every substitution request states a reason.
--
-- WHAT THIS CHANGES
--
-- The owner ruled (2026-09) that an admin filing an absence on a gedu's behalf
-- states a reason exactly as a gedu filing one does, so a request's reason can
-- no longer be null.
--
-- 1. Rows filed before the reason was required get `other`: the closest true
--    thing for a reason nobody stated. The note is left as it was. The feature
--    has never reached production, so this touches test rows on staging at most.
-- 2. `reason` becomes NOT NULL, and its comment stops calling it optional.
-- 3. set_session_substitution refuses a filing with no reason — no live request
--    for the seat, so the admin is filing one on the absent gedu's behalf — with
--    a check_violation of its own, raised before the insert rather than leaving
--    the column's NOT NULL to answer. An admin surface reaches it only through a
--    race: the gedu withdrew their request while a dialog that asks no reason,
--    because the seat had one, was open. Approving an open request and
--    re-pointing a substituted one still accept an omitted reason and keep the
--    row's.
--
-- WHAT DID NOT CHANGE
--
-- The function's guard (assert_admin, first statement), its signature and
-- parameter defaults, every other check, and its grants, restated below.

UPDATE public.session_substitution_requests
   SET reason = 'other'::public.substitution_reason
 WHERE reason IS NULL;

ALTER TABLE public.session_substitution_requests
  ALTER COLUMN reason SET NOT NULL;

COMMENT ON COLUMN public.session_substitution_requests.reason IS 'Why the gedu is away — `sick` or `other` — and ADMIN-VISIBLE ONLY: it reaches the admin Substitutions page and the admin session document, and every gedu-facing document emits it as null. A `sick` category is health-related data about a contractor; the Discord tickets it replaces carry the same, so nothing new is disclosed, but no retention rule exists for either yet. Always present: a gedu filing an absence states one, and so does an admin filing on a gedu''s behalf.';

CREATE OR REPLACE FUNCTION public.set_session_substitution(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.substitution_reason DEFAULT NULL::public.substitution_reason, p_reason_note text DEFAULT NULL::text) RETURNS jsonb
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
    -- No request: the admin is filing one on the absent gedu's behalf, and a
    -- filing states why exactly as the gedu's own does. An admin surface that
    -- asked no reason, because the seat had a request, reaches this only when
    -- that request was withdrawn while its dialog was open.
    IF p_reason IS NULL THEN
      RAISE EXCEPTION 'seat has no substitution request, and filing one needs a reason'
        USING ERRCODE = 'check_violation';
    END IF;

    -- The absent gedu has to actually be expected at the session.
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

REVOKE ALL ON FUNCTION public.set_session_substitution(uuid, date, uuid, uuid, public.substitution_reason, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_session_substitution(uuid, date, uuid, uuid, public.substitution_reason, text) TO authenticated;
GRANT ALL ON FUNCTION public.set_session_substitution(uuid, date, uuid, uuid, public.substitution_reason, text) TO service_role;

COMMENT ON FUNCTION public.set_session_substitution(uuid, date, uuid, uuid, public.substitution_reason, text) IS 'The office-arranged path: an admin names the absent gedu and the sub outright, with no offer involved. Three shapes in one function. With NO request for that seat it files one on the absent gedu''s behalf, created already `substituted` — the filing needs a reason exactly as the gedu''s own does and is refused without one, and the absent gedu must actually be EXPECTED at the session, with the role taken from their assignment or from the substitution they hold. With an OPEN request it marks that request `substituted`, which is what the admin queue''s approve reads as. With an ALREADY SUBSTITUTED one it RE-POINTS the substitution, so replacing a sub is one action rather than a clear and a set, and the displaced sub''s own absence is then swept by the cascade. An approval or a re-point may omit the reason and keeps the row''s: reason and note are only overwritten when supplied, so an admin replacing a sub does not blank what the gedu wrote. There is deliberately NO today-or-later requirement — this is the retroactive path, and an off-platform substitution that already happened has to be recordable because gedu invoicing reads these rows. The date still passes the ordinary writable-date check. approved_by is the acting admin on every admin path.';
