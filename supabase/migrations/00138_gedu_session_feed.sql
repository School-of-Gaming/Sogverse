-- Gedu session feed — sessions become records.
--
-- Until now a session did not exist as a thing. Both dashboards expand a
-- product's weekly schedule_slots forward from `now` at render time, so an
-- occurrence has no row, no identity and no URL, and it disappears from every
-- list the moment its voice window closes. A gedu who ran a session yesterday
-- cannot pull it up today, and attendance — which doubles as the gedu's
-- confirmation that they ran the session, and is what they are paid on — has
-- nowhere to live.
--
-- This migration builds the storage and the RPCs behind that feature.
--
-- THE MODEL
--
-- 1. A session is per (group, product-local calendar date). Rows are created
--    LAZILY: schedule math stays the only source of the *plan*, and a row is
--    written only when there is something to hold (a report, a note, a mark).
--    Admins go on editing dates/times/weekdays freely and nothing needs
--    migrating, because sessions without records are never rows. Where a stored
--    row and a derived occurrence share a date, the row wins; a row orphaned by
--    a schedule edit still renders, because history does not retroactively
--    change because the plan was edited.
--
-- 2. Rows snapshot their scheduled start/end AT MATERIALIZATION and never
--    re-derive them — the whole point is that they survive a later schedule
--    edit. The instants are derived SERVER-SIDE from the current schedule; the
--    client sends only the date, so a client can neither invent a time nor
--    disagree with the schedule about one.
--
-- 3. Attendance is explicitly recorded per gamer and never implied. A roster
--    member with no row is *unanswered*, not absent. Marks are written ONE AT A
--    TIME (per-mark upsert; revert-to-unmarked is a row DELETE), so two gedus
--    marking different children in the same session can never clobber each
--    other's work — the failure mode a whole-map replace would have.
--
-- 4. Two audiences, never merged: `report` is family-facing (markdown, emailed
--    to parents in a later phase) and `gedu_note` is gedu + admin only. A note
--    written under an assumption of privacy can never be retro-published.
--
-- HOLIDAYS ARE OUT OF SCOPE HERE, INCLUDING IN THE WRITE VALIDATOR. Three
-- schedule expansions exist today: the dashboards' holiday-blind one, the
-- calendar component's holiday-aware one, and the server-side holiday-aware
-- product_has_session. This feature's validator is deliberately HOLIDAY-BLIND
-- and deliberately does NOT reuse product_has_session: with the skip/didn't-run
-- UI still undesigned, a holiday-aware validator refusing a date the
-- holiday-blind feed offers would create a permanently unclearable "needs
-- attention" alert. Accepted consequence: a gedu may record a session on a
-- listed holiday, and false holiday gaps may nag. When the cancellation feature
-- is built, every expansion and validator must be unified in one pass.
--
-- CONCURRENCY IS LAST-WRITE-WINS, ACCEPTED. Every write path below carries a
-- comment saying so at the point it overwrites. Multiple gedus may edit the
-- same session, group or site notes simultaneously; there is no locking and no
-- merge, and the later save overwrites. Attendance is the one place this is
-- structurally avoided rather than accepted, per (3) above.

-- ---------------------------------------------------------------------------
-- 1. Columns on existing tables
-- ---------------------------------------------------------------------------

-- Staff-facing lesson material for the product — a link to the lesson plans a
-- gedu teaches from, rendered as a button in the group workspace masthead.
--
-- It is NOT a rename of padlet_url and there is deliberately no backfill: the
-- Padlet held family-facing session notes (which the session report now
-- replaces), while this is lesson content that FAMILIES MUST NEVER SEE. Every
-- read path that can reach a parent or a gamer must leave this column out;
-- only the gedu RPCs below and the admin surfaces select it.
ALTER TABLE public.products
  ADD COLUMN material_url text;

COMMENT ON COLUMN public.products.material_url IS
  'Gedu/admin-only lesson-material link, surfaced in the gedu group workspace. Never rendered to parents or gamers. Distinct from padlet_url, which is the (legacy) family-facing link.';

-- Standing notes about a group, distinct from any one session: the same
-- two-audience split the session fields use. Plain text on purpose — making
-- these rich would convert family-facing fields nobody has decided on, which is
-- an open question this change deliberately does not resolve.
ALTER TABLE public.product_groups
  ADD COLUMN public_note text,
  ADD COLUMN gedu_note   text;

COMMENT ON COLUMN public.product_groups.public_note IS
  'Standing family-facing note about the group. Plain text (rich text for group/site notes is an open question).';
COMMENT ON COLUMN public.product_groups.gedu_note IS
  'Standing gedu + admin note about the group. Never shown to families. Plain text.';

-- ---------------------------------------------------------------------------
-- 2. group_sessions — the materialized session row
-- ---------------------------------------------------------------------------

CREATE TABLE public.group_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid NOT NULL REFERENCES public.product_groups(id) ON DELETE CASCADE,
  -- The product-local calendar date. Keying on the local date rather than on a
  -- UTC instant or a slot start time is what makes the row survive the most
  -- common admin edit there is (a time-of-day fix); only a weekday move orphans
  -- it, and an orphan still renders.
  session_date date NOT NULL,

  -- Snapshot of the schedule as it stood when the row was created. Never
  -- re-derived: after an admin edits the schedule these are what the session
  -- actually was, which is the entire reason the row exists.
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,

  -- The family-facing session report (markdown). Optional, but never labelled
  -- optional in the UI.
  report       text,
  -- The gedu + admin note (markdown). Never reaches a family.
  gedu_note    text,

  -- Reserved concepts, zero UI, no editor, no fixture. Both belong to the
  -- cancellation / substitution flows, which are deliberately undesigned; they
  -- are here because reserving two booleans costs nothing and adding columns to
  -- a populated table later costs a migration each. Nothing reads them yet.
  did_not_run      boolean NOT NULL DEFAULT false,
  needs_substitute boolean NOT NULL DEFAULT false,

  -- Audit. Attendance is pay confirmation, which inverts the incentive from
  -- "nag gedus to record" to "audit what they recorded" — so who wrote a row
  -- and who last touched it is part of the record, not bookkeeping.
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT group_sessions_group_date_key UNIQUE (group_id, session_date),
  CONSTRAINT chk_group_sessions_ends_after_starts CHECK (ends_at > starts_at)
);

-- THE ONE-SESSION-PER-GROUP-PER-DAY BET, recorded where it is enforced.
--
-- This unique constraint is a deliberate architectural bet, not an incidental
-- key. It blocks a group having a morning session and an afternoon session on
-- the same day. We do not run products that way and do not plan to, and in
-- exchange the key survives every schedule edit except a weekday move, gap
-- entries and stored rows share one id space (`${group_id}:${session_date}`),
-- and lazy materialization needs no reconciler.
--
-- The cost is stated so nobody has to rediscover it: revisiting morning +
-- afternoon camp days means revisiting this key, and every id derived from it.
COMMENT ON CONSTRAINT group_sessions_group_date_key ON public.group_sessions IS
  'One session per group per local calendar day — a deliberate architectural bet. It blocks multi-slot days (morning + afternoon camps), which we do not run; in exchange the key survives every schedule edit but a weekday move, and entry ids can be (group_id, session_date). Revisiting multi-slot days means revisiting this constraint.';

COMMENT ON TABLE public.group_sessions IS
  'Lazily materialized session records: one row per (group, product-local date), written only when a report, a note or an attendance mark needs somewhere to live. starts_at/ends_at are a snapshot of the schedule at materialization and are never re-derived.';

CREATE INDEX group_sessions_group_date_idx
  ON public.group_sessions (group_id, session_date DESC);

CREATE TRIGGER group_sessions_updated_at
  BEFORE UPDATE ON public.group_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. session_attendance — one row per explicit mark
-- ---------------------------------------------------------------------------

CREATE TABLE public.session_attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  gamer_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Enum-ready status string rather than a Postgres enum: 'late' and 'excused'
  -- are expected additions, and widening a CHECK is a one-line migration while
  -- widening an enum reaches into every generated type that names it. The app
  -- derives its zod schema from the SUPPORTED_ATTENDANCE_STATUSES tuple, which
  -- is the code-side twin of this CHECK.
  status      text NOT NULL,

  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT session_attendance_session_gamer_key UNIQUE (session_id, gamer_id),
  CONSTRAINT chk_session_attendance_status
    CHECK (status IN ('present', 'absent'))
);

COMMENT ON TABLE public.session_attendance IS
  'One row per explicit attendance mark. A roster member with NO row here is unanswered, never absent — the three-state distinction a boolean cannot express. Marks are written one at a time and reverting to unmarked deletes the row, so two gedus marking different children in one session never clobber each other.';

CREATE INDEX session_attendance_session_idx
  ON public.session_attendance (session_id);
CREATE INDEX session_attendance_gamer_idx
  ON public.session_attendance (gamer_id);

-- ---------------------------------------------------------------------------
-- 4. RLS + grants for the two new tables
-- ---------------------------------------------------------------------------

-- RLS on, and deliberately NO grants to `authenticated` or `anon`: every read
-- and every write goes through the SECURITY DEFINER RPCs below, which is the
-- same RPC-gated posture the products write path uses. Two consequences worth
-- being explicit about:
--
--   * There are no write grants, so these tables need no write-IDOR case — the
--     grant layer refuses before RLS is ever consulted, which is the stronger
--     guarantee of the two.
--   * Opening peer-group feeds later (deliberately not in v1) is a GRANT SELECT
--     plus one policy, not a redesign. RLS is enabled from day one so that
--     change cannot forget it.
ALTER TABLE public.group_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.group_sessions     TO service_role;
GRANT ALL ON TABLE public.session_attendance TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Internal helpers (never exposed to authenticated)
-- ---------------------------------------------------------------------------

-- "Does the calling gedu teach this group?" — the authorization predicate every
-- write path below opens with. SECURITY DEFINER so it can see the assignment
-- row regardless of the caller's RLS, and bounded entirely to auth.uid(), so it
-- can answer no question about anybody else.
CREATE FUNCTION public.gedu_teaches_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
     WHERE ga.group_id = p_group_id
       AND ga.gedu_id  = (SELECT auth.uid())
  );
$$;

COMMENT ON FUNCTION public.gedu_teaches_group(uuid) IS
  'Internal predicate: is the caller assigned to this group? Not exposed to authenticated — it is called from inside the SECURITY DEFINER gedu RPCs.';

-- Derive the scheduled window for a (group, date) from the CURRENT schedule.
-- NULL when the date falls on no slot's weekday, which is also the "this date
-- is not plausibly a session" answer the validator wants.
--
-- Holiday-blind by construction: it reads schedule_slots and nothing else. See
-- the header — this is deliberate, not an omission.
--
-- The multi-slot day cannot be stored (see the unique constraint), so when more
-- than one slot matches a weekday this picks the earliest and the day collapses
-- to one session. That is the same bet the constraint records.
CREATE FUNCTION public.derive_group_session_window(
  p_group_id uuid,
  p_session_date date
) RETURNS tstzrange
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_timezone text;
  v_start    time;
  v_duration integer;
  v_starts   timestamptz;
BEGIN
  IF p_group_id IS NULL OR p_session_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.timezone
    INTO v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  IF v_timezone IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.start_time, s.duration_minutes
    INTO v_start, v_duration
    FROM public.product_groups g
    JOIN public.schedule_slots s ON s.product_id = g.product_id
   WHERE g.id = p_group_id
     -- schedule_slots.weekday is 0 = Monday; ISODOW is 1 = Monday.
     AND s.weekday = (EXTRACT(ISODOW FROM p_session_date)::integer - 1)
   ORDER BY s.start_time
   LIMIT 1;

  IF v_start IS NULL THEN
    RETURN NULL;
  END IF;

  -- `timestamp AT TIME ZONE zone` resolves a wall-clock time in that zone to
  -- the correct instant, so this is DST-correct without any arithmetic of our
  -- own. Adding the duration to the INSTANT (not to the wall clock) keeps a
  -- session that straddles a transition the right length.
  v_starts := (p_session_date + v_start) AT TIME ZONE v_timezone;

  RETURN tstzrange(
    v_starts,
    v_starts + make_interval(mins => v_duration),
    '[)'
  );
END;
$$;

COMMENT ON FUNCTION public.derive_group_session_window(uuid, date) IS
  'Server-side derivation of a session''s scheduled instants from the CURRENT schedule. Holiday-blind on purpose. NULL when the date matches no slot weekday.';

-- The loose write validator (plan decision 11).
--
-- LOOSE IS THE POINT. It refuses dates before the product started and beyond
-- the horizon the feed will ever show, and it requires the weekday to match a
-- slot. It does not try to be exact, because an admin edit can orphan any row a
-- day later anyway, and a stricter rule mostly succeeds at blocking a
-- legitimate write-up in the minutes after a schedule fix.
--
-- Holiday-blind, and deliberately NOT product_has_session — see the header.
CREATE FUNCTION public.group_session_date_is_writable(
  p_group_id uuid,
  p_session_date date
) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start_date date;
  v_end_date   date;
  v_timezone   text;
  v_horizon    date;
BEGIN
  IF p_group_id IS NULL OR p_session_date IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.start_date, p.end_date, p.timezone
    INTO v_start_date, v_end_date, v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_start_date IS NOT NULL AND p_session_date < v_start_date THEN
    RETURN false;
  END IF;

  IF v_end_date IS NOT NULL THEN
    v_horizon := v_end_date;
  ELSE
    -- Open-ended products show eight upcoming occurrences, which is eight weeks
    -- for a weekly club and eight days for a daily one. Ninety days is a
    -- comfortable superset of both and is meant to be: this is the loose bound,
    -- not a second schedule model.
    v_horizon := (now() AT TIME ZONE v_timezone)::date + 90;
  END IF;

  IF p_session_date > v_horizon THEN
    RETURN false;
  END IF;

  RETURN public.derive_group_session_window(p_group_id, p_session_date) IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.group_session_date_is_writable(uuid, date) IS
  'Loose, holiday-blind write validation for a session date: at or after the product start, within the visible horizon, and on a weekday the current schedule uses.';

-- Materialize (or find) the row for a (group, date). ON CONFLICT DO NOTHING is
-- load-bearing: the snapshot instants belong to the moment the row was FIRST
-- written, so a later write must never re-derive them from a schedule that has
-- since been edited.
CREATE FUNCTION public.ensure_group_session(
  p_group_id uuid,
  p_session_date date
) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_window     tstzrange;
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
BEGIN
  SELECT id INTO v_session_id
    FROM public.group_sessions
   WHERE group_id = p_group_id AND session_date = p_session_date;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  v_window := public.derive_group_session_window(p_group_id, p_session_date);
  IF v_window IS NULL THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.group_sessions (
    group_id, session_date, starts_at, ends_at, created_by, updated_by
  )
  VALUES (
    p_group_id, p_session_date, lower(v_window), upper(v_window), v_uid, v_uid
  )
  ON CONFLICT (group_id, session_date) DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    -- A concurrent writer materialized it between the SELECT and the INSERT.
    -- Theirs is the snapshot; take it rather than overwriting.
    SELECT id INTO v_session_id
      FROM public.group_sessions
     WHERE group_id = p_group_id AND session_date = p_session_date;
  END IF;

  RETURN v_session_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_group_session(uuid, date) IS
  'Find-or-create the session row for a (group, date), snapshotting the schedule instants at first write and never re-deriving them afterwards.';

-- ---------------------------------------------------------------------------
-- 6. Write RPCs
-- ---------------------------------------------------------------------------

-- Report + gedu note for one session, past or future.
--
-- There is deliberately no planned-versus-recorded distinction: a report
-- written before a session and one written after it are the same field at two
-- moments. Attendance is what only exists on the past side.
--
-- CONCURRENCY: last-write-wins, accepted. Two gedus editing the same session's
-- notes at once means the later save overwrites; there is no locking and no
-- merge, and this is a chosen risk rather than an oversight.
CREATE FUNCTION public.set_group_session_notes(
  p_group_id uuid,
  p_session_date date,
  p_report text,
  p_gedu_note text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
  v_row        public.group_sessions;
BEGIN
  PERFORM public.assert_role('gedu');

  IF NOT public.gedu_teaches_group(p_group_id) THEN
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

COMMENT ON FUNCTION public.set_group_session_notes(uuid, date, text, text) IS
  'Write the family-facing report and the gedu note for one session, materializing the row if needed. Gedu-gated on the group assignment. Last-write-wins.';

-- ONE mark, for ONE child, in ONE session. Consumes the `record_attendance`
-- name reserved in docs/products-architecture.md.
--
-- Per-mark rather than whole-map on purpose: two gedus marking different
-- children in the same session must not clobber each other, and a whole-map
-- replace makes that unavoidable.
--
-- An ABSENT status is the revert-to-unmarked case and DELETEs the row, because
-- "unmarked" has to stay the absence of a record rather than become a third
-- stored value. It is spelled either NULL or the empty string — the same
-- convention register_gedu uses, and for the same reason: the generated RPC
-- argument types make every text parameter a non-null `string`, so a browser
-- caller has no way to send SQL NULL. Accepting both lets the TypeScript side
-- write `?? ''` instead of reaching for a cast, and leaves NULL working for a
-- direct SQL caller (and for the authorization spine, which calls every RPC
-- with all-NULL arguments).
--
-- Attendance is PAST-ONLY and the server enforces it: a future session may hold
-- notes (forward planning) but never a mark, because there is nothing yet to
-- have attended.
--
-- CONCURRENCY: last-write-wins per mark, accepted — two gedus answering for the
-- SAME child at the same time still resolve to whoever wrote last. What the
-- per-mark shape buys is that they cannot destroy each other's answers about
-- *different* children, which is the case that actually happens.
CREATE FUNCTION public.record_attendance(
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
  v_ends_at    timestamptz;
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

  SELECT ends_at INTO v_ends_at
    FROM public.group_sessions WHERE id = v_session_id;

  IF v_ends_at > now() THEN
    RAISE EXCEPTION 'Attendance can only be recorded for a session that has finished'
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
  'Record (or, with a NULL status, clear) ONE child''s attendance mark for one session. Per-mark so concurrent gedus cannot clobber each other; past-only, server-enforced; authorizes both the calling gedu and the target child.';

-- The group's standing notes. Same two-audience split as a session's.
--
-- CONCURRENCY: last-write-wins, accepted.
CREATE FUNCTION public.set_group_notes(
  p_group_id uuid,
  p_public_note text,
  p_gedu_note text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.product_groups;
BEGIN
  PERFORM public.assert_role('gedu');

  IF NOT public.gedu_teaches_group(p_group_id) THEN
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

COMMENT ON FUNCTION public.set_group_notes(uuid, text, text) IS
  'Write a group''s standing family-facing and gedu notes. Gedu-gated on the group assignment. Last-write-wins.';

-- The venue's shared notes. site_details (address + family-facing note) and
-- site_staff_details (gedu note) are keyed by location and are SHARED BY EVERY
-- PRODUCT RUNNING AT THAT SITE — the workspace says so out loud, and this write
-- path is authorized the same way: the caller must teach a group on an
-- in-person product whose location IS this site. Gedus previously had read
-- policies on both tables and no write path at all; this is that write path,
-- deliberately an RPC rather than a policy so the two tables keep their
-- admin-only RLS and need no new write grant.
--
-- CONCURRENCY: last-write-wins, accepted — and it is the broadest instance of
-- it here, because two gedus on *different products* at the same building can
-- overwrite each other.
CREATE FUNCTION public.set_site_notes(
  p_location_id uuid,
  p_address text,
  p_public_note text,
  p_gedu_note text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_address     text;
  v_public_note text;
  v_gedu_note   text;
BEGIN
  PERFORM public.assert_role('gedu');

  IF NOT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
      JOIN public.products p ON p.id = ga.product_id
     WHERE ga.gedu_id     = (SELECT auth.uid())
       AND p.location_id  = p_location_id
       AND p.is_remote    = false
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_address     := NULLIF(btrim(COALESCE(p_address, '')), '');
  v_public_note := NULLIF(btrim(COALESCE(p_public_note, '')), '');
  v_gedu_note   := NULLIF(btrim(COALESCE(p_gedu_note, '')), '');

  INSERT INTO public.site_details (location_id, address, notes)
  VALUES (p_location_id, v_address, v_public_note)
  ON CONFLICT (location_id) DO UPDATE
    SET address = EXCLUDED.address,
        notes   = EXCLUDED.notes;

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

COMMENT ON FUNCTION public.set_site_notes(uuid, text, text, text) IS
  'Write a site''s shared address + family note and its gedu note. Authorized by the caller teaching a group on an in-person product at that site. Last-write-wins, across products.';

-- A gedu correcting a Minecraft username for a child in their own group.
--
-- The Mojang lookup happens in the API route that calls this (the same
-- server-side verify the self-serve PATCH /api/minecraft/account does), so a
-- successful edit lands VERIFIED: the canonical username and the resolved UUID
-- are stored together. A username Mojang does not know lands with a NULL uuid,
-- exactly as the self-serve path leaves it.
--
-- CONCURRENCY: last-write-wins, accepted.
CREATE FUNCTION public.set_group_member_minecraft(
  p_gamer_id uuid,
  p_minecraft_username text,
  p_minecraft_uuid text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_uuid     text;
BEGIN
  PERFORM public.assert_role('gedu');

  -- Actor AND target: the child must be actively participating in a group the
  -- caller is assigned to. A gedu may fix a username for the children they
  -- teach and for nobody else.
  IF NOT EXISTS (
    SELECT 1
      FROM public.participations part
      JOIN public.gedu_group_assignments ga ON ga.group_id = part.group_id
     WHERE part.gamer_id = p_gamer_id
       AND part.status   = 'active'::public.participation_status
       AND ga.gedu_id    = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_username := NULLIF(btrim(COALESCE(p_minecraft_username, '')), '');
  -- Clearing the username clears the uuid with it: a uuid without a name is a
  -- verified link to nothing.
  v_uuid := CASE WHEN v_username IS NULL
                 THEN NULL
                 ELSE NULLIF(btrim(COALESCE(p_minecraft_uuid, '')), '')
            END;

  INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
  VALUES (p_gamer_id, v_username, v_uuid)
  ON CONFLICT (user_id) DO UPDATE
    SET minecraft_username = EXCLUDED.minecraft_username,
        minecraft_uuid     = EXCLUDED.minecraft_uuid;

  RETURN jsonb_build_object(
    'gamer_id',           p_gamer_id,
    'minecraft_username', v_username,
    'minecraft_uuid',     v_uuid
  );
END;
$$;

COMMENT ON FUNCTION public.set_group_member_minecraft(uuid, text, text) IS
  'Set a group member''s Minecraft username + resolved UUID, scoped to gamers actively participating in a group the calling gedu teaches. The Mojang lookup happens in the calling route, so a successful edit lands verified.';

-- ---------------------------------------------------------------------------
-- 7. Read RPCs
-- ---------------------------------------------------------------------------

-- Everything the group workspace renders, for ONE group, in one round trip.
--
-- THE RPC RETURNS DATA; TYPESCRIPT DOES THE CALENDAR MATH. There is no schedule
-- expansion in here on purpose: the client already owns the occurrence
-- enumeration (extended backward for this feature) and merging rows over
-- projections in one place is what keeps the feed and the badges agreeing.
-- So this hands back the stored rows, the roster and the schedule parameters,
-- and stops.
--
-- No server pagination either: a weekly club running five years is ~260
-- sessions — low hundreds of KB at worst — and the feed already reveals its
-- history in chunks on the client.
CREATE FUNCTION public.get_gedu_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
  v_product    jsonb;
  v_group      jsonb;
  v_site       jsonb;
  v_roster     jsonb;
  v_sessions   jsonb;
BEGIN
  PERFORM public.assert_role('gedu');

  -- v1 shows a gedu only their OWN group's feed. Peer-group feeds are not a
  -- schema restriction — relaxing this to "any group on a product the caller is
  -- assigned to" is a change to this predicate alone, and nothing downstream
  -- assumes the caller teaches the group they are reading.
  IF NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id INTO v_product_id
    FROM public.product_groups g WHERE g.id = p_group_id;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- Gedu-only. This document is never served to a parent or a gamer.
    'material_url', p.material_url,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
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
  WHERE p.id = v_product_id;

  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note,
    'gedu_note',   g.gedu_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue, on in-person products only. A remote municipality club carries a
  -- location_id too (a municipality, by CHECK), so "has a location" is the
  -- wrong test and would put a site-notes panel on a club that has no building.
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
  LEFT JOIN public.site_details sd       ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- The current roster. There is deliberately no joined-by-date machinery and
  -- no enrollment-at-the-time derivation: "who was enrolled then" is knowledge
  -- we do not have and choose not to fake. `signed_up_at` travels with each row
  -- so the client can tell a child who joined last week from one who has been
  -- here all term.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'gamer_id',           part.gamer_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so this is non-null in practice and the wire contract says so.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.gamer_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        )
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.gamer_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.gamer_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.gamer_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',               s.id,
        'session_date',     s.session_date,
        'starts_at',        s.starts_at,
        'ends_at',          s.ends_at,
        'report',           s.report,
        'gedu_note',        s.gedu_note,
        'did_not_run',      s.did_not_run,
        'needs_substitute', s.needs_substitute,
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- Sparse map keyed by gamer id. A roster member absent from this object
        -- is UNMARKED, which is a different claim from 'absent'.
        'attendance', COALESCE((
          SELECT jsonb_object_agg(a.gamer_id, a.status)
            FROM public.session_attendance a
           WHERE a.session_id = s.id
        ), '{}'::jsonb)
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
    ) AS session_rows;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_group_feed(uuid) IS
  'One round trip for a gedu group workspace: product shell (with the gedu-only material link), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map. Contains no schedule expansion — the client owns the calendar math.';

-- Per-assignment summary for the gedu dashboard. The dashboard NEVER fetches a
-- feed: one call answers for every card.
--
-- WHY THE EPOCH IS AN ARGUMENT. Work owed starts at max(product start, epoch) —
-- pre-existing clubs owe nothing for their history. The epoch is a constant in
-- code (src/lib/constants/session-epoch.ts), deliberately not a column and not
-- admin-configurable, so it travels in as a parameter rather than being
-- duplicated in the database. A NULL argument simply removes the floor.
--
-- WHY THE COUNT IS COMPUTED HERE AT ALL, given the feed RPC does no schedule
-- math. The alternative is shipping every group's stored-session skeleton to
-- the dashboard so the client can count — which is fetching feeds, which is the
-- thing this RPC exists to avoid. The enumeration below is holiday-blind and
-- date-only (a weekday filter over generate_series, plus an exact end-instant
-- test for the "has it finished" boundary), so it produces exactly the set of
-- dates the client's occurrence expansion produces for the same schedule. If
-- the two ever disagree, the badge and the feed disagree, and that is the
-- regression to look for.
CREATE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL)
RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'product_id',         a.product_id,
               'group_id',           a.group_id,
               'group_name',         g.name,
               'group_gamer_count',  roster.roster_size,
               'site_name',          site.name,
               'attention_count',    COALESCE(owed.owed_count, 0)
             )
             ORDER BY g.name
           )
      FROM public.gedu_group_assignments a
      JOIN public.product_groups g ON g.id = a.group_id
      JOIN public.products p       ON p.id = a.product_id

      -- The venue, in-person products only (see get_gedu_group_feed).
      LEFT JOIN LATERAL (
        SELECT l.name
          FROM public.locations l
         WHERE l.id = p.location_id AND p.is_remote = false
      ) AS site ON true

      CROSS JOIN LATERAL (
        SELECT COUNT(*)::integer AS roster_size
          FROM public.participations part
         WHERE part.group_id = g.id
           AND part.status   = 'active'::public.participation_status
      ) AS roster

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS owed_count
          FROM (
            -- Occurrences the schedule projects, floored at max(product start,
            -- epoch) and bounded above by "has actually finished".
            --
            -- The epoch floors THIS COUNT and nothing else. A pre-epoch session
            -- is fully recordable — a gedu may take its attendance and write it
            -- up — it simply never becomes work the platform asks for. That is
            -- why the write validator below has no epoch floor of its own.
            SELECT d::date AS session_date
              FROM generate_series(
                     GREATEST(
                       COALESCE(p.start_date, (now() AT TIME ZONE p.timezone)::date - 365),
                       COALESCE(p_epoch_date, DATE '0001-01-01')
                     )::timestamp,
                     (now() AT TIME ZONE p.timezone)::date::timestamp,
                     interval '1 day'
                   ) AS d
             WHERE (p.end_date IS NULL OR d::date <= p.end_date)
               AND EXISTS (
                 SELECT 1
                   FROM public.schedule_slots s
                  WHERE s.product_id = p.id
                    AND s.weekday = (EXTRACT(ISODOW FROM d)::integer - 1)
                    AND ((d::date + s.start_time) AT TIME ZONE p.timezone)
                        + make_interval(mins => s.duration_minutes) <= now()
               )
            UNION
            -- Rows the schedule no longer projects still count: a session
            -- orphaned by a weekday move is history, and history that is
            -- missing marks is still owed.
            SELECT gs.session_date
              FROM public.group_sessions gs
             WHERE gs.group_id = g.id
               AND gs.ends_at <= now()
               AND gs.session_date >= COALESCE(p_epoch_date, DATE '0001-01-01')
               AND (p.start_date IS NULL OR gs.session_date >= p.start_date)
          ) AS occurrence
         WHERE roster.roster_size > 0
           -- "Needs attention" means exactly this: some of the CURRENT roster
           -- has no answer yet. Measured against the current roster, never
           -- against the stored map's keys — which is why a child joining a
           -- long-running group reopens previously-complete sessions. That is
           -- the honest reading and it is chosen with eyes open.
           AND (
             SELECT COUNT(*)
               FROM public.session_attendance att
               JOIN public.group_sessions gs2 ON gs2.id = att.session_id
               JOIN public.participations part2
                 ON part2.gamer_id = att.gamer_id
                AND part2.group_id = g.id
                AND part2.status   = 'active'::public.participation_status
              WHERE gs2.group_id     = g.id
                AND gs2.session_date = occurrence.session_date
           ) < roster.roster_size
      ) AS owed ON true

     WHERE a.gedu_id = v_uid
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(date) IS
  'One row per gedu assignment for the dashboard cards: group name, that group''s gamer count, the venue name on in-person products, and how many past sessions still owe attendance. The enforcement epoch travels in as an argument because it is a code constant, not a column.';

-- ---------------------------------------------------------------------------
-- 8. Grants for the new functions
-- ---------------------------------------------------------------------------
--
-- Nothing is exposed by default: a fresh function grants EXECUTE to PUBLIC,
-- which includes `authenticated`, so every one of these is revoked first and
-- then granted deliberately per role.
--
-- The four internal helpers stay unexposed. They are only ever called from
-- inside the SECURITY DEFINER RPCs below, where they run with the definer's
-- privileges and need no grant of their own — so they never join the exposed
-- function surface and never need a spine classification.

REVOKE ALL ON FUNCTION public.gedu_teaches_group(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_teaches_group(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.derive_group_session_window(uuid, date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.derive_group_session_window(uuid, date) TO service_role;

REVOKE ALL ON FUNCTION public.group_session_date_is_writable(uuid, date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_date_is_writable(uuid, date) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_group_session(uuid, date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_group_session(uuid, date) TO service_role;

REVOKE ALL ON FUNCTION public.set_group_session_notes(uuid, date, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_session_notes(uuid, date, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_session_notes(uuid, date, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.record_attendance(uuid, date, uuid, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_attendance(uuid, date, uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.record_attendance(uuid, date, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.set_group_notes(uuid, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_notes(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_notes(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.set_site_notes(uuid, text, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_site_notes(uuid, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.set_site_notes(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.set_group_member_minecraft(uuid, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_member_minecraft(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_member_minecraft(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_gedu_group_feed(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_gedu_group_feed(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_gedu_group_feed(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_my_gedu_assignment_summaries(date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. site_staff_details: revoke anon's SELECT
-- ---------------------------------------------------------------------------
--
-- Reviewed while adding the gedu write path above. `anon` held a table-level
-- SELECT grant on site_staff_details — a leftover from the legacy auto-expose
-- default privileges, and the only new-style grant on the table that nothing
-- justifies. site_staff_details is the GEDU-ONLY note set: parents never see
-- it, and an unauthenticated visitor has no business holding a read privilege
-- on it.
--
-- It leaked nothing today, because the table's RLS has no policy `TO anon` and
-- default-deny answered every anon SELECT with zero rows. That is exactly why
-- it is worth removing rather than shrugging at: the grant is the standing half
-- of the hole, and one future policy written without a TO clause (which
-- defaults to PUBLIC) would arm it. Its sibling site_details carries no anon
-- grant, so this also converges the pair.
REVOKE SELECT ON TABLE public.site_staff_details FROM anon;
-- Belt and braces: a grant to PUBLIC would keep anon reachable through the
-- back door, and `has_table_privilege` (asserted at the end of this file)
-- cannot tell the two apart. No PUBLIC table grant exists today, so this is a
-- no-op that stops the assertion below failing for a reason nobody expected.
REVOKE SELECT ON TABLE public.site_staff_details FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 10. create_product / update_product gain p_material_url
-- ---------------------------------------------------------------------------
--
-- Both write the products row directly, so both take the new column. Adding a
-- parameter changes the signature, so CREATE OR REPLACE would leave a second
-- overload behind — DROP the old signatures, recreate, and re-GRANT (DROP drops
-- the grants). Bodies are the current ones from schema.sql with material_url
-- threaded through the INSERT / UPDATE and nothing else touched.

DROP FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, text, uuid, integer, date,
  date, integer, integer, jsonb, jsonb, uuid[], integer, integer, integer
);

CREATE FUNCTION public.create_product(
  p_product_type            public.product_type,
  p_billing_mode            public.billing_mode,
  p_translations            jsonb,
  p_topic                   public.product_topic,
  p_min_age                 integer,
  p_max_age                 integer,
  p_spoken_language_code    text,
  p_is_remote               boolean,
  p_timezone                text,
  p_registration_opens_at   timestamp with time zone,
  p_status                  public.product_status DEFAULT 'draft'::public.product_status,
  p_is_visible              boolean        DEFAULT false,
  p_waitlist_enabled        boolean        DEFAULT true,
  p_image_path              text           DEFAULT NULL,
  p_padlet_url              text           DEFAULT NULL,
  p_location_id             uuid           DEFAULT NULL,
  p_signup_threshold        integer        DEFAULT NULL,
  p_start_date              date           DEFAULT NULL,
  p_end_date                date           DEFAULT NULL,
  p_seat_count              integer        DEFAULT NULL,
  p_refund_policy_days      integer        DEFAULT NULL,
  p_schedule_slots          jsonb          DEFAULT NULL,
  p_prices                  jsonb          DEFAULT NULL,
  p_holiday_calendar_ids    uuid[]         DEFAULT NULL,
  p_primary_gedu_fee_cents   integer       DEFAULT NULL,
  p_assistant_gedu_fee_cents integer       DEFAULT NULL,
  p_municipality_fee_cents   integer       DEFAULT NULL,
  p_material_url             text          DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_product_id    UUID;
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
BEGIN
  PERFORM public.assert_admin();

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.products (
    product_type, billing_mode, topic,
    min_age, max_age, spoken_language_code, image_path, padlet_url,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    refund_policy_days, is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents,
    material_url
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path, p_padlet_url,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_refund_policy_days, p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents,
    p_material_url
  )
  RETURNING id INTO v_product_id;

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      v_product_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      NULLIF(v_translation->'long_description', 'null'::jsonb)
    );
  END LOOP;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        v_product_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_cents
      )
      VALUES (
        v_product_id,
        v_price->>'currency',
        (v_price->>'price_cents')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT v_product_id, unnest(p_holiday_calendar_ids);
  END IF;

  RETURN v_product_id;
END;
$function$;

DROP FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  boolean, boolean, text, text, uuid, integer, date, date, integer, integer,
  jsonb, jsonb, uuid[], integer, integer, integer
);

CREATE FUNCTION public.update_product(
  p_id                      uuid,
  p_billing_mode            public.billing_mode,
  p_translations            jsonb,
  p_topic                   public.product_topic,
  p_min_age                 integer,
  p_max_age                 integer,
  p_spoken_language_code    text,
  p_is_remote               boolean,
  p_timezone                text,
  p_registration_opens_at   timestamp with time zone,
  p_is_visible              boolean        DEFAULT false,
  p_waitlist_enabled        boolean        DEFAULT true,
  p_image_path              text           DEFAULT NULL,
  p_padlet_url              text           DEFAULT NULL,
  p_location_id             uuid           DEFAULT NULL,
  p_signup_threshold        integer        DEFAULT NULL,
  p_start_date              date           DEFAULT NULL,
  p_end_date                date           DEFAULT NULL,
  p_seat_count              integer        DEFAULT NULL,
  p_refund_policy_days      integer        DEFAULT NULL,
  p_schedule_slots          jsonb          DEFAULT NULL,
  p_prices                  jsonb          DEFAULT NULL,
  p_holiday_calendar_ids    uuid[]         DEFAULT NULL,
  p_primary_gedu_fee_cents   integer       DEFAULT NULL,
  p_assistant_gedu_fee_cents integer       DEFAULT NULL,
  p_municipality_fee_cents   integer       DEFAULT NULL,
  p_material_url             text          DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_locales       TEXT[];
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_id) THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.products SET
    billing_mode             = p_billing_mode,
    topic                    = p_topic,
    min_age                  = p_min_age,
    max_age                  = p_max_age,
    spoken_language_code     = p_spoken_language_code,
    image_path               = p_image_path,
    padlet_url               = p_padlet_url,
    material_url             = p_material_url,
    location_id              = p_location_id,
    is_remote                = p_is_remote,
    signup_threshold         = p_signup_threshold,
    start_date               = p_start_date,
    end_date                 = p_end_date,
    timezone                 = p_timezone,
    seat_count               = p_seat_count,
    waitlist_enabled         = p_waitlist_enabled,
    registration_opens_at    = p_registration_opens_at,
    refund_policy_days       = p_refund_policy_days,
    is_visible               = p_is_visible,
    primary_gedu_fee_cents   = p_primary_gedu_fee_cents,
    assistant_gedu_fee_cents = p_assistant_gedu_fee_cents,
    municipality_fee_cents   = p_municipality_fee_cents
  WHERE id = p_id;

  -- product_translations — UPSERT new set, then DELETE leftovers (the
  -- "≥1 row remains" trigger passes because the new rows are already in
  -- place before any delete fires).
  v_locales := ARRAY[]::TEXT[];

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      p_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      NULLIF(v_translation->'long_description', 'null'::jsonb)
    )
    ON CONFLICT (product_id, locale) DO UPDATE SET
      name              = EXCLUDED.name,
      short_description = EXCLUDED.short_description,
      long_description  = EXCLUDED.long_description,
      updated_at        = NOW();

    v_locales := array_append(v_locales, v_translation->>'locale');
  END LOOP;

  DELETE FROM public.product_translations
  WHERE product_id = p_id
    AND locale <> ALL (v_locales);

  -- schedule_slots — wipe and replace.
  DELETE FROM public.schedule_slots WHERE product_id = p_id;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        p_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  -- product_prices — wipe and replace.
  DELETE FROM public.product_prices WHERE product_id = p_id;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_cents
      )
      VALUES (
        p_id,
        v_price->>'currency',
        (v_price->>'price_cents')::INTEGER
      );
    END LOOP;
  END IF;

  -- product_holiday_calendars — wipe and replace.
  DELETE FROM public.product_holiday_calendars WHERE product_id = p_id;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT p_id, unnest(p_holiday_calendar_ids);
  END IF;

  RETURN p_id;
END;
$function$;

-- Re-GRANT: DROP took the old grants with it. Both are SECURITY INVOKER and
-- guard with assert_admin, so `authenticated` is the admin browser client.
REVOKE ALL ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, text, uuid, integer, date,
  date, integer, integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, text, uuid, integer, date,
  date, integer, integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) TO authenticated;
GRANT ALL ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, text, uuid, integer, date,
  date, integer, integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) TO service_role;

REVOKE ALL ON FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  boolean, boolean, text, text, uuid, integer, date, date, integer, integer,
  jsonb, jsonb, uuid[], integer, integer, integer, text
) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  boolean, boolean, text, text, uuid, integer, date, date, integer, integer,
  jsonb, jsonb, uuid[], integer, integer, integer, text
) TO authenticated;
GRANT ALL ON FUNCTION public.update_product(
  uuid, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  boolean, boolean, text, text, uuid, integer, date, date, integer, integer,
  jsonb, jsonb, uuid[], integer, integer, integer, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 11. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Several statements above are conditional or depend on an object being in the
-- state this file expects (the DROPs assume the 00112 signatures; the REVOKE
-- assumes anon actually held that grant). A conditional whose predicate does not
-- match is indistinguishable from one that did its job, and the only production
-- discrepancy on record was a migration that took a branch its author did not
-- expect. So assert the end state rather than trusting the branch. This runs
-- once, when 00138 applies: apply-time protection, not a standing invariant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
     WHERE n.nspname = 'public'
       AND pr.proname IN ('create_product', 'update_product')
     GROUP BY pr.proname
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'create_product/update_product has more than one overload — the DROP did not match the signature it meant to remove';
  END IF;

  IF has_table_privilege('anon', 'public.site_staff_details', 'SELECT') THEN
    RAISE EXCEPTION
      'anon still holds SELECT on site_staff_details — the REVOKE did not take';
  END IF;

  IF has_function_privilege('authenticated', 'public.gedu_teaches_group(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'gedu_teaches_group is reachable by authenticated — it is an internal helper and must stay off the exposed function surface';
  END IF;
END;
$$;
