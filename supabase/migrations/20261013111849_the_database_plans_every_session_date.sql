-- The database becomes the one place a product's planned session dates are
-- expanded.
--
-- A product's plan is its term (start_date, and end_date unless it is an
-- open-ended consumer club — both bare dates in products.timezone) and its
-- weekly schedule_slots. Until now that plan was walked weekday by weekday in
-- several functions, each with its own copy of the weekday mapping and the
-- term test. This migration adds the one expansion and moves the database's
-- own readers onto it; the app's TypeScript walks move in later changes.
--
-- WHAT THIS CHANGES
--
-- 1. planned_session_dates(product, from, to) — every planned session in a
--    date span, with its start and end instants. The only expansion of the
--    plan; a catalog test fails on any other function that walks weekdays.
-- 2. planned_group_sessions(product, from, to) — the same rows, each with the
--    groups that have cancelled that date.
-- 3. session_plan_horizon and group_final_session_date — the bounded span an
--    open-ended product is read over, and a group's last running session.
-- 4. derive_group_session_window now reads the plan, and so becomes
--    term-bounded: a date before start_date or after end_date has no window,
--    where before it had one whenever the weekday matched. The two date checks
--    built on it keep their behaviour, because each already applied the term;
--    ensure_group_session's own callers all ask the writable check first; and
--    gedu_substitutes_session falls back to product-local midnight on an
--    out-of-term date exactly as on a date the schedule no longer projects.
-- 5. gedu_assignment_summaries reads its final session, its projected
--    occurrences and their end instants from the plan. Its answers are
--    unchanged.

-- ---------------------------------------------------------------------------
-- 1. The plan
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date)
    RETURNS TABLE(session_date date, starts_at timestamptz, ends_at timestamptz)
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO ''
    AS $$
  SELECT span.first_day + step.n AS session_date,
         -- `timestamp AT TIME ZONE zone` resolves a wall-clock time in that
         -- zone to the correct instant, so this is DST-correct without any
         -- arithmetic of our own. Adding the duration to the INSTANT (not to
         -- the wall clock) keeps a session that straddles a transition the
         -- right length.
         ((span.first_day + step.n) + s.start_time) AT TIME ZONE p.timezone AS starts_at,
         ((span.first_day + step.n) + s.start_time) AT TIME ZONE p.timezone
           + make_interval(mins => s.duration_minutes) AS ends_at
    FROM public.products p
         -- The requested span clipped to the term, both ends inclusive. An
         -- open-ended product's term has no end, so the span's own end stands.
   CROSS JOIN LATERAL (
         SELECT LEAST(p_to, COALESCE(p.end_date, p_to))       AS last_day
         ) AS term_end
         -- At most the 3661 days ending at last_day: anon can call this, and
         -- ten years is past any term while bounding what one call can ask
         -- for. The clamp moves the START, so a span reaching back to the
         -- start_date of a product older than that loses its oldest dates,
         -- never its newest.
   CROSS JOIN LATERAL (
         SELECT GREATEST(p_from, p.start_date, term_end.last_day - 3660) AS first_day,
                term_end.last_day                                         AS last_day
         ) AS span
         -- Calendar days as offsets from the first one, so stepping a day is
         -- exact.
   CROSS JOIN LATERAL generate_series(0, span.last_day - span.first_day) AS step(n)
    JOIN public.schedule_slots s
      ON s.product_id = p.id
     -- schedule_slots.weekday is 0 = Monday; ISODOW is 1 = Monday.
     AND s.weekday = EXTRACT(ISODOW FROM span.first_day + step.n)::integer - 1
   WHERE p.id = p_product_id
     -- GREATEST and LEAST skip a NULL argument, so a NULL bound would quietly
     -- become the term's own. A span with a missing end is no span.
     AND p_from IS NOT NULL
     AND p_to IS NOT NULL
   ORDER BY session_date, starts_at;
$$;

COMMENT ON FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) IS 'The ONLY expansion of a product''s plan into dated sessions: every date in [p_from, p_to] that falls inside the product''s term (start_date to end_date, both inclusive, end open for an open-ended club) on a weekday its schedule has a slot for, with the session''s start and end instants. Instants are resolved in products.timezone, so they are DST-correct, and a session that crosses midnight belongs to the date it starts on. No rows when either bound is NULL. The span is clamped at its start, to no earlier than 3660 days before its last day, so an over-long span loses its oldest dates and keeps its newest. SECURITY INVOKER over products and schedule_slots, which every caller, anon included, already reads in full — so it answers every caller identically. Every other reader of the plan asks this function; a catalog test fails on any other function that walks weekdays.';

REVOKE ALL ON FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) TO anon;
GRANT EXECUTE ON FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The plan with each date's cancellations
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.planned_group_sessions(p_product_id uuid, p_from date, p_to date)
    RETURNS TABLE(session_date date, starts_at timestamptz, ends_at timestamptz, cancelled_group_ids uuid[])
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO ''
    AS $$
  SELECT planned.session_date,
         planned.starts_at,
         planned.ends_at,
         COALESCE(
           (SELECT array_agg(c.group_id ORDER BY c.group_id)
              FROM public.session_cancellations c
              JOIN public.product_groups g ON g.id = c.group_id
             WHERE g.product_id   = p_product_id
               AND c.session_date = planned.session_date),
           '{}'::uuid[]
         ) AS cancelled_group_ids
    FROM public.planned_session_dates(p_product_id, p_from, p_to) AS planned
   ORDER BY planned.session_date, planned.starts_at;
$$;

COMMENT ON FUNCTION public.planned_group_sessions(p_product_id uuid, p_from date, p_to date) IS 'planned_session_dates with, on each date, the product''s groups that have a session_cancellations row for it. Every cancellation on a planned date is in effect — group_session_is_cancelled admits it by its projected arm — so `g = ANY(cancelled_group_ids)` is exactly group_session_is_cancelled(g, date) on every row this returns. Service role only: cancellations are staff data.';

REVOKE ALL ON FUNCTION public.planned_group_sessions(p_product_id uuid, p_from date, p_to date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planned_group_sessions(p_product_id uuid, p_from date, p_to date) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The horizon of an open-ended product, and a group's final session
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid DEFAULT NULL, p_at_least date DEFAULT NULL) RETURNS date
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO ''
    AS $$
  SELECT CASE
           WHEN p.end_date IS NOT NULL THEN p.end_date
           ELSE GREATEST(
                  p_at_least,
                  COALESCE(
                    -- The eighth session that has not ended and that the group
                    -- has not cancelled: an open-ended list shows the first
                    -- eight sessions that have not closed
                    -- (OPEN_ENDED_OCCURRENCE_CAP in src/lib/planned-sessions.ts),
                    -- so the span holds all of them, and skipping the group's
                    -- cancellations keeps its next running session inside. The
                    -- read starts a day back so a session still running past
                    -- midnight counts.
                    (SELECT planned.session_date
                       FROM public.planned_session_dates(
                              p.id,
                              product_local.today - 1,
                              product_local.today + 366
                            ) AS planned
                      WHERE planned.ends_at > now()
                        AND (p_group_id IS NULL
                             OR NOT EXISTS (
                                  SELECT 1
                                    FROM public.session_cancellations c
                                   WHERE c.group_id     = p_group_id
                                     AND c.session_date = planned.session_date
                                ))
                      ORDER BY planned.session_date
                     OFFSET 7
                      LIMIT 1),
                    -- Fewer than eight within the year: the year's end, so
                    -- the span holds every one there is.
                    product_local.today + 366
                  )
                )
         END
    FROM public.products p
         -- The product-local today. The search reads one year ahead of it:
         -- slots are weekly, so eight are inside unless the product starts
         -- late in that year or a year of the group's sessions is cancelled.
   CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE p.timezone)::date AS today) AS product_local
   WHERE p.id = p_product_id;
$$;

COMMENT ON FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date) IS 'The last date worth reading a product''s plan to. A dated product''s end_date; for an open-ended one, the date of the eighth planned session that has not ended and that p_group_id has not cancelled (every planned session when p_group_id is NULL) — an open-ended list shows the first eight sessions that have not closed (OPEN_ENDED_OCCURRENCE_CAP in src/lib/planned-sessions.ts), so the span holds all of them, and skipping the group''s cancellations keeps its next running session inside — raised to p_at_least when that is later. The search reads one year past the product-local today; when fewer than eight qualify inside it (a product starting late in that year, a year of the group''s sessions cancelled, or no slots at all) the answer is that day, product-local today + 366, so the span holds every one there is.';

REVOKE ALL ON FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date) TO service_role;

CREATE FUNCTION public.group_final_session_date(p_group_id uuid) RETURNS date
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO ''
    AS $$
  SELECT max(planned.session_date)
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   CROSS JOIN LATERAL public.planned_group_sessions(p.id, p.end_date - 366, p.end_date) AS planned
   WHERE g.id = p_group_id
     -- Explicit rather than relying on a NULL bound answering nothing: "an
     -- open-ended product has no final session" is a decision.
     AND p.end_date IS NOT NULL
     AND NOT (g.id = ANY (planned.cancelled_group_ids));
$$;

COMMENT ON FUNCTION public.group_final_session_date(p_group_id uuid) IS 'The group''s FINAL session: the last planned date on or before end_date that the group has not cancelled, so a cancelled last session hands the role to the one before it. NULL for an open-ended product and for a run that plans nothing. The search is the year ending at end_date: slots are weekly, so the answer is the run''s unless a whole year of the group''s sessions is cancelled.';

REVOKE ALL ON FUNCTION public.group_final_session_date(p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_final_session_date(p_group_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The single-date checks read the plan
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) RETURNS tstzrange
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT tstzrange(planned.starts_at, planned.ends_at, '[)')
    FROM public.product_groups g
   CROSS JOIN LATERAL public.planned_session_dates(g.product_id, p_session_date, p_session_date) AS planned
   WHERE g.id = p_group_id
   ORDER BY planned.starts_at
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) IS 'A session''s scheduled instants from the CURRENT plan (planned_session_dates). NULL when the plan has no session on the date: outside the product''s term, or on a weekday it has no slot for. Term-bounded since the plan became the database''s, where it used to answer for any matching weekday.';

CREATE OR REPLACE FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.derive_group_session_window(p_group_id, p_session_date) IS NOT NULL;
$$;

COMMENT ON FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) IS 'Does the CURRENT plan have a session on this date: inside the product''s term and on a weekday it has a slot for (planned_session_dates, through derive_group_session_window). The writable-date check minus its visible horizon — what a new cancellation is validated against, and one of the two ways a stored cancellation stays in effect (group_session_is_cancelled).';

CREATE OR REPLACE FUNCTION public.group_session_date_is_writable(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_end_date date;
  v_timezone text;
BEGIN
  SELECT p.end_date, p.timezone
    INTO v_end_date, v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  IF NOT FOUND OR p_session_date IS NULL THEN
    RETURN false;
  END IF;

  -- Open-ended products show eight upcoming occurrences, which is eight weeks
  -- for a weekly club and eight days for a daily one. Ninety days is a
  -- comfortable superset of both and is meant to be: this is the loose bound,
  -- not a second schedule model. A dated product's horizon is its end date,
  -- which the plan already applies.
  IF v_end_date IS NULL
     AND p_session_date > (now() AT TIME ZONE v_timezone)::date + 90 THEN
    RETURN false;
  END IF;

  RETURN public.derive_group_session_window(p_group_id, p_session_date) IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.group_session_date_is_writable(p_group_id uuid, p_session_date date) IS 'Loose write validation for a session date: the current plan has a session on it (inside the term, on a slot weekday), and an open-ended product''s date is within ninety days of product-local today.';

-- ---------------------------------------------------------------------------
-- 5. The dashboard's attention count reads the plan
-- ---------------------------------------------------------------------------
--
-- The final session, the projected occurrences and their end instants come
-- from the plan; every answer is the same as before. The grants are unchanged
-- by CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.gedu_assignment_summaries(p_gedu_id uuid, p_epoch_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN

  RETURN COALESCE((
    -- The gedu's SEATS on groups, of which there are now two kinds. The union
    -- is the whole of the change to this function: everything below it is
    -- written against a (product, group) pair and a possible substitution DATE, and
    -- does not care which arm produced them.
    --
    --   * `assignment` — one row per gedu_group_assignments row, exactly as
    --     before, with `substitution_date` null.
    --   * `substitution`      — one row per UNEXPIRED substitution date.
    --     gedu_holds_unexpired_substitution carries the whole of that: keyed to
    --     the gedu asked about, the holder still certified, and the window's END not yet
    --     passed. Deliberately not gedu_substitutes_session, which would also
    --     require the session to be within 48 hours — this arm feeds the substitution
    --     card a sub reads on My SOG, which exists from approval, where the
    --     workspace it links to opens at T-48h.
    --
    -- `gedu_id` is carried through rather than dropped so the closing
    -- `WHERE a.gedu_id = p_gedu_id` still reads as the statement it always was.
    WITH seat AS (
      SELECT a0.product_id,
             a0.group_id,
             a0.gedu_id,
             'assignment'::text AS kind,
             NULL::date         AS substitution_date
        FROM public.gedu_group_assignments a0
       WHERE a0.gedu_id = p_gedu_id
      UNION ALL
      SELECT g0.product_id,
             r0.group_id,
             r0.substitute_id AS gedu_id,
             'substitution'::text  AS kind,
             r0.session_date AS substitution_date
        FROM public.session_substitution_requests r0
        JOIN public.product_groups g0 ON g0.id = r0.group_id
       WHERE r0.substitute_id = p_gedu_id
         AND r0.status     = 'substituted'::public.substitution_request_status
         AND public.gedu_holds_unexpired_substitution(p_gedu_id, r0.group_id, r0.session_date)
      UNION ALL
      --   * `trainee` — one row per gedu_group_trainees seat. It owes nothing
      --     (see the attention count below).
      SELECT t0.product_id,
             t0.group_id,
             t0.gedu_id,
             'trainee'::text AS kind,
             NULL::date      AS substitution_date
        FROM public.gedu_group_trainees t0
       WHERE t0.gedu_id = p_gedu_id
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'product_id',              a.product_id,
               'group_id',                a.group_id,
               'group_name',              g.name,
               -- Which kind of seat this row is, and on which date when it is a
               -- substitution. The dashboard rollup keys on (product, group) and a
               -- substitution card's identity is (group, date) — one card per substituted
               -- date, standing from approval until the substitution expires.
               'kind',                    a.kind,
               'substitution_date',            a.substitution_date,
               -- The count is every active seat on the group, and one of those
               -- can be an adult — which is why it is named for the
               -- participant rather than for a gamer.
               --
               -- It is the WHOLE current roster and stays that way. "How many
               -- gamers are in my group" is a fact about the group today, not
               -- about any one occurrence — the per-occurrence expected size
               -- that condition (1) uses is derived separately below and must
               -- never be routed through this value.
               'group_participant_count', roster.roster_size,
               'site_name',               site.name,
               'attention_count',         COALESCE(owed.owed_count, 0)
             )
             ORDER BY g.name, a.kind, a.substitution_date
           )
      FROM seat a
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

      -- The run's FINAL session this group has not cancelled, which is the
      -- only session the creations condition below can attach to. NULL for an
      -- open-ended product, and NULL for a run whose plan holds nothing at
      -- all; either way the equality below never holds and nothing ever owes.
      CROSS JOIN LATERAL (
        SELECT public.group_final_session_date(g.id) AS session_date
      ) AS final_occurrence

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS owed_count
          FROM (
            -- Occurrences the plan holds, floored at max(product start,
            -- epoch) and bounded above by "has actually finished".
            --
            -- The epoch floors THIS COUNT and nothing else. A pre-epoch session
            -- is fully recordable — a gedu may take its attendance and write it
            -- up — it simply never becomes work the platform asks for. That is
            -- why the write validator has no epoch floor of its own.
            SELECT planned.session_date
              FROM public.planned_session_dates(
                     p.id,
                     GREATEST(p.start_date, p_epoch_date),
                     (now() AT TIME ZONE p.timezone)::date
                   ) AS planned
             WHERE planned.ends_at <= now()
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

          -- The occurrence's END INSTANT — one value per occurrence, and the
          -- same value whichever arm of the union above produced it.
          --
          -- The union is deliberately left keyed on the date alone: carrying an
          -- end instant through it would let one date arrive twice with two
          -- different ends and count the occurrence twice. So it is resolved
          -- here instead — the stored row's own `ends_at` where the occurrence
          -- has a row, and otherwise the plan's.
          --
          -- The plan's end is the earliest-starting session's on that date,
          -- which is the very instant the projected arm tested "has it
          -- finished" against, so the two tests read one instant. That holds
          -- because `schedule_slots_product_id_weekday_key` is UNIQUE
          -- (product_id, weekday): a date carries at most one planned session.
          -- **If that constraint is ever relaxed** — the group_sessions unique
          -- key already flags multi-slot days as a revisit — the projected arm
          -- would admit a date when ANY of its sessions has ended, while this
          -- reads the earliest-starting one, and those differ whenever the
          -- session that starts earlier runs longer. Whoever relaxes it settles
          -- both here and in the TypeScript twin in the same commit.
          CROSS JOIN LATERAL (
            SELECT COALESCE(
                     (SELECT gs5.ends_at
                        FROM public.group_sessions gs5
                       WHERE gs5.group_id     = g.id
                         AND gs5.session_date = occurrence.session_date),
                     upper(public.derive_group_session_window(g.id, occurrence.session_date))
                   ) AS ends_at
          ) AS occurrence_end

          -- How many the register was FOR — the members who had joined the
          -- group before this occurrence ended.
          --
          -- Separate from roster.roster_size on purpose: that one is the whole
          -- current roster and answers the dashboard card's headcount, which is
          -- not a per-occurrence question. This one also answers the
          -- empty-group exemption below, which is.
          --
          -- The NULL branches are explicit rather than left to a comparison's
          -- behaviour on NULL, and both point the same way — expected. A seat
          -- with no stamp holds no group, so it cannot be here at all; an
          -- occurrence with no end instant cannot arise either. Where the
          -- unreachable happens anyway, the answer is the behaviour that
          -- predates this migration, which costs a mark nobody needed rather
          -- than producing a false "complete".
          CROSS JOIN LATERAL (
            SELECT COUNT(*)::integer AS expected_size
              FROM public.participations part4
             WHERE part4.group_id = g.id
               AND part4.status   = 'active'::public.participation_status
               AND (part4.group_joined_at IS NULL
                    OR occurrence_end.ends_at IS NULL
                    OR part4.group_joined_at <= occurrence_end.ends_at)
          ) AS expected

         -- A session nobody in the group was expected at owes nothing: there
         -- was no register to take and no family to write to. Measured on the
         -- members expected on THIS occurrence rather than the current roster,
         -- so a group whose first members joined after its first weeks had
         -- run does not owe a report and a mail for the weeks before them. An
         -- empty group falls out of the same test.
         WHERE expected.expected_size > 0
           -- A TRAINEE seat owes nothing: the register, the report, the mail
           -- and the creations are the staff's work, not the trainee's, so its
           -- count is 0 without being computed.
           AND a.kind <> 'trainee'
           -- A SUBSTITUTION row owes ONE date: the one it substitutes for. The four conditions
           -- below are untouched and simply see a set of one occurrence, which
           -- is what "the same code path, restricted to that date" means — no
           -- second computation, and in particular the creations condition (4)
           -- fires for a substitution only when the substitution date really is the run's
           -- final occurrence. An ASSIGNMENT row sees every occurrence, as
           -- before.
           AND (a.substitution_date IS NULL OR occurrence.session_date = a.substitution_date)
           -- A date the gedu holds a NON-WITHDRAWN request on is not their
           -- work, whichever kind of seat this row is: they have said they
           -- cannot be there. The badge must not count it, whether the request
           -- is still open, already substituted, or a sub-of-sub chain's second
           -- link. This has a TWIN IN TYPESCRIPT (see the comment below on the
           -- four conditions) and the twin learns the same rule.
           AND NOT EXISTS (
             SELECT 1
               FROM public.session_substitution_requests rq
              WHERE rq.group_id     = g.id
                AND rq.session_date = occurrence.session_date
                AND rq.requested_by = p_gedu_id
                AND rq.status <> 'withdrawn'::public.substitution_request_status
           )
           -- Cancellation: a cancelled session owes nothing — nothing ran, so
           -- there is no register, report or mail to ask for, and a record
           -- kept under the cancellation is frozen rather than owed — and
           -- stays so when the stored-row arm reaches it on a date the
           -- schedule no longer projects, because a cancellation over a
           -- record stays in effect. This has the same TypeScript twin as the
           -- rule above, and it learns it too.
           AND NOT public.group_session_is_cancelled(g.id, occurrence.session_date)
           -- "Needs attention" is FOUR questions joined by OR, and any one
           -- alone keeps the session on the list.
           --
           -- This derivation has a TWIN IN TYPESCRIPT — the gedu feed's
           -- entry-state module, which decides the same thing for the card
           -- from the feed document — and the two must agree, or the dashboard
           -- badge counts a session the card calls finished. Changing either
           -- half means changing both, in the same commit. That includes the
           -- CREATIONS condition (4) below — which is scoped by the same
           -- join-date test (1) is — and which members a session is
           -- FOR at all: the TS side asks the same question of the same
           -- instant, with the same inclusive boundary, in both conditions.
           AND (
             -- (1) Some of the members this session EXPECTED have no answer
             -- yet. Both sides of the comparison are scoped the same way: marks
             -- are counted only for members who had joined before the
             -- occurrence ended, and they are compared against how many such
             -- members there are.
             --
             -- Comparing every mark against the whole current roster instead
             -- would mean that placing a member into a group reopens every
             -- session in its history, with no way to clear the alert but to
             -- record an absence that never happened: nobody had yet said
             -- whether that child was there, because they were not in the
             -- group.
             --
             -- Still measured against the CURRENT roster rather than the stored
             -- map's keys, which is a different rule and unchanged: a member
             -- who has LEFT stops being asked about.
             (
               SELECT COUNT(*)
                 FROM public.session_attendance att
                 JOIN public.group_sessions gs2 ON gs2.id = att.session_id
                 JOIN public.participations part2
                   ON part2.participant_id = att.participant_id
                  AND part2.group_id = g.id
                  AND part2.status   = 'active'::public.participation_status
                  AND (part2.group_joined_at IS NULL
                       OR occurrence_end.ends_at IS NULL
                       OR part2.group_joined_at <= occurrence_end.ends_at)
                WHERE gs2.group_id     = g.id
                  AND gs2.session_date = occurrence.session_date
             ) < expected.expected_size
             -- (2) Nothing has been written for the families. NOT EXISTS rather
             -- than a LEFT JOIN's NULL test, so a date with no materialized row
             -- at all — the common case for a session nobody has touched — is
             -- the same answer as a row holding a blank report.
             --
             -- Unscoped by who had joined, and that is right: a session owes the
             -- families a write-up whoever was in the room.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs3
                WHERE gs3.group_id     = g.id
                  AND gs3.session_date = occurrence.session_date
                  AND btrim(COALESCE(gs3.report, ''), E' \t\r\n\v\f') <> ''
             )
             -- (3) The families have not been told it is there.
             -- Writing the report is half the job; a report nobody was mailed
             -- about is a report nobody reads, so a session stays owed until
             -- the send has been claimed.
             --
             -- NOT EXISTS again, for the same reason as (2): a date with no
             -- materialized row is the same answer as a row that was never
             -- mailed, and neither is a LEFT JOIN's three-valued NULL test.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs4
                WHERE gs4.group_id     = g.id
                  AND gs4.session_date = occurrence.session_date
                  AND gs4.report_emailed_at IS NOT NULL
             )
             -- (4) The FINAL session of a product that requires creations, with
             -- somebody on the current roster who has none. Creations
             -- are part of the last session's work, so this fires on exactly one
             -- occurrence per run and only once that occurrence has finished —
             -- which is free, because every member of this set has finished.
             --
             -- Measured over the CURRENT roster, scoped exactly as (1) is: only
             -- the members who had joined the group before the FINAL occurrence
             -- ended. The owner's principle is that if a gamer was in the group
             -- at the time of the last session, then the gedu owes that gamer a
             -- creation — so a seat placed into the group after that session
             -- had already finished owes nothing and cannot reopen a run that
             -- was square.
             --
             -- This shipped one revision unscoped, and the gap is the argument
             -- for closing it: the same member could be absent from the final
             -- session's register — not asked about, not counted, not drawn —
             -- while still being counted here as owing a creation FOR that
             -- session. One occurrence, two answers to one question about who
             -- it was for. Both conditions now ask it once.
             --
             -- The other half of "was in the group at the time" is not
             -- expressible here and is not attempted: a member who WAS in the
             -- group at the final session and has since left owes nothing,
             -- because this EXISTS ranges over active seats and a departure
             -- leaves nothing behind to measure. Leaving clears the debt, in
             -- both twins, as a limit of the data.
             --
             -- A group nobody was expected at on the final session — empty, or
             -- every seat postdating it — is already excluded by the
             -- expected_size guard above, so nothing here has to restate it.
             --
             -- The array-length test is defensive: the CHECK on the table
             -- refuses an empty array and the write RPC deletes the row instead
             -- of storing one, so "no row" is the only reachable empty. It costs
             -- nothing and it states what "has a creation" means.
             OR (
               p.requires_gamer_creations
               AND occurrence.session_date = final_occurrence.session_date
               AND EXISTS (
                 SELECT 1
                   FROM public.participations part3
                  WHERE part3.group_id = g.id
                    AND part3.status   = 'active'::public.participation_status
                    -- The same three-branch shape (1) and the expected-size
                    -- lateral use, against the same per-occurrence end instant,
                    -- and NULL points the same way in both: expected, which is
                    -- the behaviour that predates this file and can only ever
                    -- ask for a creation nobody needed rather than declare a
                    -- run finished that is not.
                    AND (part3.group_joined_at IS NULL
                         OR occurrence_end.ends_at IS NULL
                         OR part3.group_joined_at <= occurrence_end.ends_at)
                    AND NOT EXISTS (
                      SELECT 1
                        FROM public.gamer_group_creations c
                       WHERE c.group_id       = g.id
                         AND c.participant_id = part3.participant_id
                         AND jsonb_array_length(c.creations) > 0
                    )
               )
             )
           )
      ) AS owed ON true

     WHERE a.gedu_id = p_gedu_id
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.gedu_assignment_summaries(p_gedu_id uuid, p_epoch_date date) IS 'One row per gedu assignment for the dashboard cards: group name, that group''s participant count (an active seat may be held by an adult as well as by a child), the venue name on in-person products, and how many past sessions still need attention. A finished session on or after the epoch counts until ALL of: the register is in, a family-facing report is written, the mail telling the families it is there has been sent, and — on the run''s FINAL session of a product with requires_gamer_creations set — every current roster member has at least one creation. The register condition is scoped to the members who had JOINED the group before that occurrence ended: both the marks counted and the size they are compared against, off participations.group_joined_at against an end instant resolved once per occurrence (the stored row''s ends_at, else the planned end from derive_group_session_window, which is the same instant the "has it finished" test already used). group_participant_count deliberately keeps measuring the WHOLE current roster — a card''s headcount is not a per-occurrence question. The empty-group exemption is: an occurrence on which no member was expected owes nothing at all, so a group whose first members joined after its first sessions had run owes no register, report or mail for those sessions. The report and mail conditions are unscoped because a session owes those whoever was in the room. The creations condition carries the SAME join-date scoping as the register condition, on the owner''s principle that a gedu owes a creation for every gamer who was in the group at the time of the last session — so a seat placed into the group after the final session ended owes nothing, and one occurrence cannot answer "who was this for" two different ways. Only the JOIN half of that principle is expressible: a member who has since LEFT owes nothing, because the roster is active seats and a departure leaves no trace. The final session is group_final_session_date: the last planned date on or before end_date that the group has not cancelled, derived rather than stored — so a cancelled last session hands the creations condition to the one before it; an open-ended product (end_date NULL) has none and therefore never owes creations, which is documented behaviour rather than an error. A CANCELLED occurrence is never owed, by group_session_is_cancelled — including a cancelled record the schedule no longer projects, which the stored-row arm would otherwise reach: nothing ran, and a record kept under a cancellation is frozen. The badge''s unit is the SESSION: it counts sessions needing attention, and the final one simply has one more way to need it. The enforcement epoch travels in as an argument because it is a code constant, not a column. This count has a twin in TypeScript — the gedu feed''s entry-state derivation, which answers the same question for one card — and the two must be changed together, on all four conditions and on who a session is for, which scopes two of them. A SECOND KIND OF SEAT feeds the same machinery: a `substitution` row per substitution date, carrying `kind` and `substitution_date`, whose owed count is the same four conditions applied to a set of one occurrence — so it is 0 or 1 and never a term''s worth. That arm asks gedu_holds_unexpired_substitution rather than gedu_substitutes_session: the card stands from approval, where the workspace behind it opens 48 hours before the substituted session, and a card that waited for the workspace would hide from a sub the afternoon they had agreed to take. A substitution still locked owes nothing by construction, because every occurrence this count ranges over has already ended. A THIRD KIND, `trainee`: a row per gedu_group_trainees seat with substitution_date null, the group name, participant count and venue name like an assignment row, and an attention_count that is always 0 — what a session owes is the staff''s work, so no staff-only aggregate is computed for a trainee seat.';
