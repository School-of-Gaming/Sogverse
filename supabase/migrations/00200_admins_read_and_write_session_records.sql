-- Admins read and write the session record, the same one gedus do.
--
-- WHY
--
-- Until now an admin could see a product's groups and who sat in them and
-- nothing else about what actually happened in the room: not the family-facing
-- report, not the staff note beside it, not the register, not whether the
-- write-up ever reached the parents. Every one of those lives behind an RPC
-- whose gate is `assert_role('gedu')` plus "and you are assigned to this
-- group", so the only way an admin ever read one was to make a second gedu
-- account, assign it to the group, and leave it there for ever. That is a
-- fiction in the data — an educator who teaches nothing appears on rosters and
-- in peer-cover rails — and it is a permanent one, because nobody unassigns it
-- once the question that prompted it is answered.
--
-- WHAT THIS CHANGES
--
--   * `get_admin_product_sessions(product)` — new, admin-gated. One read for
--     the WHOLE product: its schedule parameters, its venue (in-person only),
--     and per group the notes, the roster and every stored session row with its
--     sparse attendance map. Product-keyed rather than group-keyed because the
--     admin page shows one product and lets the reader pick a group in front of
--     it; a per-group read would be N round trips for one page.
--   * Five writers now admit an admin beside the assigned gedu:
--     `set_group_session_notes`, `record_attendance`,
--     `claim_group_session_report_email`, `set_group_notes` and
--     `set_site_notes`.
--
-- THE SHAPE OF THE WIDENED GATE, AND WHY IT IS WRITTEN THIS WAY
--
-- Each of the five opens with
--
--     PERFORM public.assert_role(
--       CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
--     );
--
-- which says "the caller is an admin, or the caller is a gedu" in the ONE shape
-- the authorization spine can read. That matters mechanically: the spine
-- requires the first executable statement of every plpgsql function reachable by
-- `authenticated` to be a schema-qualified `assert_role` / `assert_admin` /
-- `assert_self` call, and it greps the stored source for exactly that. Writing
-- the widening as `IF NOT public.is_admin() THEN PERFORM assert_role('gedu') ...`
-- reads more plainly and would make the first statement an `IF`, which the spine
-- rejects — and rightly, because "the guard is somewhere in here" is not a
-- property anything can check. So the branch moves inside the guard's argument
-- instead of around the guard, and a caller who is neither role is refused with
-- the same 42501 as before, on the same first statement as before.
--
-- The SECOND half of each gate — "and you teach this group" / "and you run
-- something at this building" — is then skipped for an admin and unchanged for a
-- gedu. That is the whole of the privilege being granted.
--
-- WHAT AN ADMIN IS DELIBERATELY NOT EXEMPT FROM
--
-- Everything else. An admin gets a gedu's PERMISSIONS, not a licence to write a
-- record a gedu could not: the roster check on `record_attendance` still refuses
-- a mark aimed at somebody who does not hold a seat in that group, the
-- session-has-started refusal still applies, `group_session_date_is_writable`
-- still refuses a date the schedule never projected, and the claim still refuses
-- a session with no report (P0021) or one already sent (P0022). Those rules are
-- about the integrity of the record, not about who is looking at it.
--
-- Nor is the audit trail relaxed. `updated_by` is still stamped with
-- `auth.uid()`, so an admin who corrects a tick is named as the session's last
-- editor exactly as a gedu would be — which is what the attribution chip on the
-- card reads, and it is the truth.
--
-- WHY THE READ IS A NEW FUNCTION RATHER THAN A RELAXED `get_gedu_group_feed`
--
-- That function's own comment invites relaxing its predicate, and this is not
-- that: it is keyed by group, carries the gedu-only material link, and answers
-- "my workspace". The admin surface asks a different question — every group on
-- one product, side by side, chosen between — and answering it by calling the
-- group feed once per group would put the product shell and the site on the wire
-- once per group as well. The two functions share the SESSION AGGREGATION
-- verbatim, which is the part any card renders from, so a change to what a
-- session row carries is a change to both. That duplication is deliberate and
-- named here so it cannot be discovered as a surprise.
--
-- The roster this function emits is NOT the group feed's roster. It carries the
-- participant id and first name and nothing else, because the only thing the
-- admin surface does with it is take the register — no game identities, no dates
-- of birth, no contact addresses. The groups panel on the same page already
-- answers "who are these people" through its own admin RPC.

-- ---------------------------------------------------------------------------
-- 1. The read
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_product_sessions(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_product jsonb;
  v_site    jsonb;
  v_groups  jsonb;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- The schedule parameters and nothing else. The page already holds the
  -- product row from the admin product read; what it cannot get from there is
  -- the slot list in the shape the client's calendar walk takes, which is why
  -- these four fields travel and the rest do not.
  SELECT jsonb_build_object(
    'id',         p.id,
    'timezone',   p.timezone,
    'start_date', p.start_date,
    'end_date',   p.end_date,
    'is_remote',  p.is_remote,
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id;

  -- The venue, on in-person products only — the same test
  -- `get_gedu_group_feed` makes, and for the same reason: a remote municipality
  -- club carries a location_id (a municipality, by CHECK), so "has a location"
  -- would put a door code and a caretaker's name on a club with no building.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes,
    'gedu_note',   ssd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd        ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = p_product_id
    AND p.is_remote = false;

  -- Ordered by (created_at, id), which is the order the groups panel on the
  -- same page lists them in. The group selector sits directly above that panel;
  -- two orders on one page would be a bug the reader has to notice.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'created_at', entry->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',          g.id,
        'name',        g.name,
        'created_at',  g.created_at,
        'public_note', g.public_note,
        'gedu_note',   g.gedu_note,

        -- Register-shaped and nothing more: who may be marked, and what to call
        -- them. See this migration's header for why it is not the group feed's
        -- roster.
        'roster', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'participant_id', part.participant_id,
                   'first_name',     gmp.first_name
                 ) ORDER BY gmp.first_name)
            FROM public.participations part
            JOIN public.profiles gmp ON gmp.id = part.participant_id
           WHERE part.group_id = g.id
             AND part.status   = 'active'::public.participation_status
        ), '[]'::jsonb),

        -- Every stored row for the group, in the SAME shape
        -- `get_gedu_group_feed` emits — the two are read by one card component
        -- and must not disagree about what a session is. An orphan the schedule
        -- no longer projects is history and travels too.
        'sessions', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',                s.id,
                   'session_date',      s.session_date,
                   'starts_at',         s.starts_at,
                   'ends_at',           s.ends_at,
                   'report',            s.report,
                   'gedu_note',         s.gedu_note,
                   'created_at',        s.created_at,
                   'updated_at',        s.updated_at,
                   'created_by',        s.created_by,
                   'updated_by',        s.updated_by,
                   -- When the report was mailed to the families, NULL until it
                   -- was. Its audit partner `report_emailed_by` stays off the
                   -- wire here exactly as it does on the gedu feed.
                   'report_emailed_at', s.report_emailed_at,
                   -- The session's LAST EDITOR, not the report's author. An
                   -- admin who corrects one tick is named here, which is what
                   -- the chip on the card claims and is true.
                   'updated_by_first_name', (
                     SELECT pr.first_name
                       FROM public.profiles pr
                      WHERE pr.id = s.updated_by
                   ),
                   -- Sparse map keyed by participant id. A roster member absent
                   -- from it is UNMARKED, which is not 'absent'.
                   'attendance', COALESCE((
                     SELECT jsonb_object_agg(a.participant_id, a.status)
                       FROM public.session_attendance a
                      WHERE a.session_id = s.id
                   ), '{}'::jsonb)
                 ) ORDER BY s.session_date DESC)
            FROM public.group_sessions s
           WHERE s.group_id = g.id
        ), '[]'::jsonb)
      ) AS entry
        FROM public.product_groups g
       WHERE g.product_id = p_product_id
    ) AS group_rows;

  RETURN jsonb_build_object(
    'product', v_product,
    'site',    v_site,
    'groups',  v_groups
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_product_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_product_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_product_sessions(uuid) TO service_role;

COMMENT ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) IS
  'One round trip behind the admin product page''s Sessions panel: the product''s schedule parameters, its venue and site notes on an in-person product, and every group on it with its standing notes, its register roster and every stored session row with a sparse attendance map. Admin-only, guard-first on assert_admin. Product-keyed rather than group-keyed because the page shows one product and puts a group selector in front of the feed; asking per group would send the product shell and the site over the wire once per group. Contains no schedule expansion — the client owns the calendar math, exactly as it does for the gedu feed. The SESSION shape is get_gedu_group_feed''s verbatim, because one card component renders both and the two must not disagree about what a session is; the ROSTER deliberately is not — it carries participant_id and first_name alone, since the only thing this surface does with it is take the register, and the groups panel on the same page already answers who these people are.';

-- ---------------------------------------------------------------------------
-- 2. The five writers admit an admin
-- ---------------------------------------------------------------------------
--
-- Each body below is the current definition with its guard widened and nothing
-- else touched. See this migration's header for the shape of the widened guard
-- and for what an admin is deliberately still bound by.

CREATE OR REPLACE FUNCTION public.set_group_session_notes(
  p_group_id     uuid,
  p_session_date date,
  p_report       text,
  p_gedu_note    text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

REVOKE EXECUTE ON FUNCTION public.set_group_session_notes(uuid, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_session_notes(uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_session_notes(uuid, date, text, text) TO service_role;

COMMENT ON FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) IS
  'Write the family-facing report and the gedu note for one session, materializing the row if needed. Open to an ADMIN or to the gedu assigned to the group (00200): the guard admits either role, and the assignment half of the gate is skipped for an admin only. Everything else is unchanged for both — an unscheduled date is still refused with check_violation, and updated_by is still stamped with the caller, so an admin''s edit is attributed to the admin. Last-write-wins.';

CREATE OR REPLACE FUNCTION public.record_attendance(
  p_group_id       uuid,
  p_session_date   date,
  p_participant_id uuid,
  p_status         text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

REVOKE EXECUTE ON FUNCTION public.record_attendance(uuid, date, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_attendance(uuid, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_attendance(uuid, date, uuid, text) TO service_role;

COMMENT ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) IS
  'Record (or, with a NULL status, clear) ONE participant''s attendance mark for one session. Per-mark so concurrent writers cannot clobber each other; marks open at the session''s scheduled start (roll call during the session is the standard pattern) and never before. Open to an ADMIN or to the gedu assigned to the group (00200) — the guard admits either role and only the assignment half of the gate is skipped for an admin. The TARGET check is not: both callers must aim the mark at somebody who actually holds an active seat in the group, and both are refused before the session starts. The target is whoever holds the seat — an adult is marked present exactly as a child is, with no branch for it.';

CREATE OR REPLACE FUNCTION public.claim_group_session_report_email(
  p_group_id     uuid,
  p_session_date date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
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

REVOKE EXECUTE ON FUNCTION public.claim_group_session_report_email(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_group_session_report_email(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_group_session_report_email(uuid, date) TO service_role;

COMMENT ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) IS
  'Claim the one send of a session report to the group''s families, and hand back the row it claimed. Open to an ADMIN or to the gedu assigned to the group (00200), exactly as the session-notes writer is. Takes the row''s lock, then refuses with SQLSTATE P0021 when there is no report to send (no row, or a report that is empty after the same whitespace trim the summaries SQL applies) and with P0022 when report_emailed_at is already set — both bind an admin identically; otherwise stamps report_emailed_at = now() and report_emailed_by = auth.uid(). The claim is the FIRST write of the send and is also its authorization: succeeding proves the caller may send for this group, which is what lets the route resolve recipients with the service role afterwards. Releasing a claim is the route''s job and happens only when every single mail failed.';

CREATE OR REPLACE FUNCTION public.set_group_notes(
  p_group_id    uuid,
  p_public_note text,
  p_gedu_note   text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.product_groups;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.product_groups
     SET public_note = NULLIF(btrim(COALESCE(p_public_note, '')), ''),
         gedu_note   = NULLIF(btrim(COALESCE(p_gedu_note, '')), '')
   WHERE id = p_group_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',          v_row.id,
    'public_note', v_row.public_note,
    'gedu_note',   v_row.gedu_note
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_group_notes(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_notes(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_notes(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) IS
  'Write a group''s standing family-facing and gedu notes. Open to an ADMIN or to the gedu assigned to the group (00200) — the guard admits either role and only the assignment half of the gate is skipped for an admin. Last-write-wins.';

CREATE OR REPLACE FUNCTION public.set_site_notes(
  p_location_id uuid,
  p_public_note text,
  p_gedu_note   text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_public_note text;
  v_gedu_note   text;
  v_address     text;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- "You run something at this building" — the site-scoped analogue of the
  -- assignment check, and the half an admin is exempt from.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
      JOIN public.products p ON p.id = ga.product_id
     WHERE ga.gedu_id     = (SELECT auth.uid())
       AND p.location_id  = p_location_id
       AND p.is_remote    = false
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_public_note := NULLIF(btrim(COALESCE(p_public_note, '')), '');
  v_gedu_note   := NULLIF(btrim(COALESCE(p_gedu_note, '')), '');

  INSERT INTO public.site_details (location_id, address, notes)
  VALUES (p_location_id, NULL, v_public_note)
  ON CONFLICT (location_id) DO UPDATE
    -- `address` is deliberately absent from this SET list: whatever an admin
    -- put there stays there.
    SET notes = EXCLUDED.notes
  RETURNING address INTO v_address;

  INSERT INTO public.site_staff_details (location_id, notes)
  VALUES (p_location_id, v_gedu_note)
  ON CONFLICT (location_id) DO UPDATE
    SET notes = EXCLUDED.notes;

  RETURN jsonb_build_object(
    'location_id', p_location_id,
    'address',     v_address,
    'public_note', v_public_note,
    'gedu_note',   v_gedu_note
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_site_notes(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_site_notes(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_site_notes(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) IS
  'Write a site''s shared family note and its gedu note. The venue ADDRESS is not a parameter and is never touched — it belongs to the location record and is an admin''s to edit through the location itself. Open to an ADMIN, or to a gedu who teaches on an in-person product at that site (00200). Last-write-wins on the notes, across products.';

-- ---------------------------------------------------------------------------
-- 3. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Everything below runs against the database this file was just applied to, so
-- a silent no-op (an already-claimed version number, an IF EXISTS that took a
-- branch nobody expected) fails here rather than three weeks later.

DO $assert$
DECLARE
  v_src     text;
  v_name    text;
  v_granted boolean;
  v_names text[] := ARRAY[
    'set_group_session_notes',
    'record_attendance',
    'claim_group_session_report_email',
    'set_group_notes',
    'set_site_notes'
  ];
BEGIN
  -- --- (a) The read exists, is exposed the way it should be. ---------------
  IF to_regprocedure('public.get_admin_product_sessions(uuid)') IS NULL THEN
    RAISE EXCEPTION 'get_admin_product_sessions was not created';
  END IF;

  IF NOT has_function_privilege(
    'authenticated', 'public.get_admin_product_sessions(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_admin_product_sessions has no authenticated EXECUTE grant';
  END IF;

  IF has_function_privilege(
    'anon', 'public.get_admin_product_sessions(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_admin_product_sessions is reachable by anon — the REVOKE FROM PUBLIC did not take';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_admin_product_sessions';

  -- Guard-first, in the one shape the authorization spine greps for.
  IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_product_sessions does not guard on assert_admin';
  END IF;

  -- The session shape it shares with the gedu feed. Losing any of these would
  -- leave the card rendering `undefined` rather than failing.
  IF position('report_emailed_at' IN v_src) = 0
     OR position('updated_by_first_name' IN v_src) = 0
     OR position('session_attendance' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_product_sessions lost part of the shared session shape';
  END IF;

  -- --- (b) All five writers admit an admin, and none lost its second half. -
  FOREACH v_name IN ARRAY v_names LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name;

    IF v_src IS NULL THEN
      RAISE EXCEPTION '% is missing entirely', v_name;
    END IF;

    IF position('public.is_admin() THEN ''admin'' ELSE ''gedu''' IN v_src) = 0 THEN
      RAISE EXCEPTION '% did not take the widened guard', v_name;
    END IF;

    -- The gedu half must still be there. A rewrite that dropped it would pass
    -- the check above while handing every gedu every group on the platform.
    IF position('NOT public.is_admin() AND NOT' IN v_src) = 0 THEN
      RAISE EXCEPTION '% lost the gedu half of its gate', v_name;
    END IF;

    SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      INTO v_granted
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name;

    IF v_granted IS NOT TRUE THEN
      RAISE EXCEPTION '% lost its authenticated EXECUTE grant', v_name;
    END IF;

    SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
      INTO v_granted
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name;

    IF v_granted THEN
      RAISE EXCEPTION '% came back reachable by anon — the REVOKE FROM PUBLIC did not take', v_name;
    END IF;
  END LOOP;

  -- --- (c) The integrity rules an admin is NOT exempt from survived. -------
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_attendance';

  IF position('v_starts_at > now()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'record_attendance lost its session-has-started refusal';
  END IF;

  IF position('part.participant_id = p_participant_id' IN v_src) = 0 THEN
    RAISE EXCEPTION 'record_attendance lost its roster target check';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'claim_group_session_report_email';

  IF position('P0021' IN v_src) = 0 OR position('P0022' IN v_src) = 0 THEN
    RAISE EXCEPTION 'claim_group_session_report_email lost one of its refusal codes';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'set_site_notes';

  -- The address must still be absent from the upsert's SET list. It is the one
  -- thing this function has never been allowed to write.
  IF position('SET notes = EXCLUDED.notes' IN v_src) = 0
     OR position('SET address' IN v_src) > 0 THEN
    RAISE EXCEPTION 'set_site_notes started writing the venue address';
  END IF;
END
$assert$;
