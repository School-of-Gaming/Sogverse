-- An optional reason is an optional PARAMETER.
--
-- WHY
--
-- `reason` and `reason_note` are nullable on `session_substitution_requests`, and both
-- write paths 00272 shipped are meant to accept their absence: a gedu may file a
-- request with no note, and an admin recording an off-platform substitution may know
-- neither the category nor a note. But the two functions declared the parameters
-- with no DEFAULT, which makes them REQUIRED — and the type generator never
-- types an RPC argument as nullable, so the generated `Args` read
-- `p_reason: substitution_reason; p_reason_note: string`. A caller with nothing to send
-- has no way to say so: passing `null` is a type error, and omitting a parameter
-- with no default is a PostgREST error. The only way through would have been a
-- cast at every call site, which is exactly the suppression the code-style rule
-- warns about.
--
-- A trailing DEFAULT NULL fixes both halves at once: PostgreSQL accepts the call
-- without the parameter, and the generator emits `p_reason?: …`, so a caller with
-- nothing to send omits it. Nothing about the bodies changes — a NULL reason on
-- the gedu path is still refused with check_violation, and on the admin path it
-- still means "leave whatever reason is already on the row alone".
--
-- WHY A SEPARATE MIGRATION
--
-- 00272 is applied to staging, and an applied migration is never edited
-- (supabase/CLAUDE.md, "Never amend a pushed migration"): the CLI matches on
-- version, so an edit there would never run on staging and only CI's
-- fresh-from-migrations database would ever see it.
--
-- A default is not part of a function's identity, so both are CREATE OR REPLACE
-- and neither signature moves — which is also why no GRANT has to be re-issued
-- for the change itself. They are re-issued anyway, because the rule does not ask
-- which kind of recreation happened: a recreated function can come back
-- PUBLIC-executable, so a migration that touches one pairs its per-role GRANTs
-- with an explicit REVOKE.
--
-- The bodies below are 00272's verbatim, with the two parameter lines changed.

CREATE OR REPLACE FUNCTION public.request_session_substitution(
  p_group_id uuid,
  p_session_date date,
  p_reason public.substitution_reason DEFAULT NULL,
  p_reason_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
CREATE OR REPLACE FUNCTION public.set_session_substitution(
  p_group_id uuid,
  p_session_date date,
  p_absent_gedu_id uuid,
  p_sub_gedu_id uuid,
  p_reason public.substitution_reason DEFAULT NULL,
  p_reason_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

REVOKE EXECUTE ON FUNCTION public.request_session_substitution(uuid, date, public.substitution_reason, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_session_substitution(uuid, date, public.substitution_reason, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.request_session_substitution(uuid, date, public.substitution_reason, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_session_substitution(uuid, date, uuid, uuid, public.substitution_reason, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_session_substitution(uuid, date, uuid, uuid, public.substitution_reason, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_session_substitution(uuid, date, uuid, uuid, public.substitution_reason, text) TO service_role;

DO $$
DECLARE
  v_defaults integer;
BEGIN
  -- Both functions must now carry two trailing defaults, and neither signature
  -- may have moved: pronargdefaults is the count of parameters with a default,
  -- and pronargs the total.
  SELECT count(*) INTO v_defaults
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND ((p.proname = 'request_session_substitution' AND p.pronargs = 4)
       OR (p.proname = 'set_session_substitution'     AND p.pronargs = 6))
     AND p.pronargdefaults = 2;

  IF v_defaults <> 2 THEN
    RAISE EXCEPTION
      'expected both substitution writers to carry two trailing defaults on their original arity, found % ',
      v_defaults;
  END IF;

  -- And there must be exactly ONE of each: a signature that had moved would
  -- leave the old overload behind, and PostgREST would then resolve a call by
  -- argument names in a way nobody wrote down.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('request_session_substitution', 'set_session_substitution')) <> 2 THEN
    RAISE EXCEPTION 'a substitution writer has been overloaded rather than replaced';
  END IF;

  IF has_function_privilege('anon', 'public.request_session_substitution(uuid, date, public.substitution_reason, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_session_substitution(uuid, date, uuid, uuid, public.substitution_reason, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a substitution writer is reachable by anon';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.request_session_substitution(uuid, date, public.substitution_reason, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.set_session_substitution(uuid, date, uuid, uuid, public.substitution_reason, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a substitution writer lost its authenticated grant';
  END IF;
END $$;
