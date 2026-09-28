-- A substitution is visible from approval and reachable from 48 hours out.
--
-- WHAT THIS CHANGES
--
-- 00272 gave a substitution an access window with an END and no START: approval
-- handed the sub the group's workspace immediately, however far out the
-- session was. The owner's rule is now that the workspace opens 48 hours
-- before the session the sub is standing in for — and that the sub must still
-- see the substitution they accepted on My SOG the whole time, from approval, even
-- while they cannot open it.
--
-- Those are two different questions about one row, so there are now two
-- predicates rather than one:
--
--   gedu_holds_unexpired_substitution — the caller holds this substitution and it has not
--     EXPIRED. This is 00272's predicate, body unchanged, under its own name.
--     It answers "is this substitution still mine to see", which is what the two
--     dashboard reads ask.
--   gedu_substitutes_session        — the caller may REACH the group for this date:
--     the above, AND the session has come within 48 hours. Every access gate
--     goes on calling this one and none of them changed.
--
-- THE WINDOW STILL HAS ONE DEFINITION OF EACH BOUND
--
-- The END expression exists in exactly one place in the schema (the sibling's
-- body) and the START in exactly one (gedu_substitutes_session's). gedu_substitutes_group
-- is still one EXISTS over gedu_substitutes_session and restates neither — which is
-- also what gives the group-wide surfaces the right answer for a sub holding
-- two substitutions on one group: the workspace opens at the EARLIER of the two
-- T-48h instants and closes at the later of the two ends.
--
-- WHY THE TWO DASHBOARD READS MOVE AND NOTHING ELSE DOES
--
-- `get_my_assigned_products`' substitution arm and `get_my_gedu_assignment_summaries`'
-- substitution arm are the rows the /gedu substitution card is drawn from. Left on
-- gedu_substitutes_session they would have made an accepted substitution VANISH from My SOG
-- until T-48h, which is the opposite of the requirement. They now ask the
-- sibling, so the card appears at approval and lasts until the window closes,
-- while the workspace behind it stays shut until T-48h. Both functions are
-- restated whole from their 00272 definitions with that one call changed.
--
-- WHAT A LOCKED CARD IS ALLOWED TO CARRY
--
-- Those two reads were checked against that: a substitution row carries the product
-- and group names, the product type, the substitution date, the slots and timezone,
-- the in-person site NAME, and two head COUNTS (the product's active
-- participations, and the substituted group's roster size). No child is named,
-- aged or contactable through either row — the roster itself is behind
-- get_gedu_group_feed / get_gedu_assigned_product, which are gated by
-- gedu_substitutes_session and stay shut. The counts are left ungated deliberately:
-- an approved sub is already the session's staff from the moment of approval
-- (that is what gedu_is_expected_at_session says about them), and "how many
-- children am I teaching" is the prep fact a sub has to have before the
-- workspace opens. The owed count on the summaries arm is 0 for a locked substitution
-- by construction rather than by a rule — it counts occurrences that have
-- already ENDED, and a substitution that is still locked is still in the future.

-- ---------------------------------------------------------------------------
-- 1. The two predicates
-- ---------------------------------------------------------------------------

-- "The caller holds this substitution and it has not expired." 00272's
-- gedu_substitutes_session body, verbatim, under the name of the question it
-- actually answers. The END of the window lives here and nowhere else.
CREATE FUNCTION public.gedu_holds_unexpired_substitution(p_group_id uuid, p_session_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.session_substitution_requests r
      JOIN public.product_groups g  ON g.id = r.group_id
      JOIN public.products p        ON p.id = g.product_id
      JOIN public.gedu_profiles gp  ON gp.user_id = r.substitute_id
      -- The session row is LAZILY materialized, so there may be none — which is
      -- exactly the case the 15-day arm of the COALESCE is for.
      LEFT JOIN public.group_sessions gs
             ON gs.group_id     = r.group_id
            AND gs.session_date = r.session_date
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.status       = 'substituted'::public.substitution_request_status
       AND r.substitute_id   = (SELECT auth.uid())
       -- Still certified. De-certifying an educator ends their substitution access
       -- mid-window, which is the point of checking it here rather than only at
       -- approval time.
       AND gp.certified
       -- 24 hours after the report was mailed, or 15 days after the session date
       -- if it never was. The fallback is compared against PRODUCT-LOCAL
       -- midnight, so a club in Helsinki and one in Los Angeles both get fifteen
       -- of their own days.
       AND now() < COALESCE(
                     gs.report_emailed_at + interval '24 hours',
                     ((r.session_date + 15)::timestamp AT TIME ZONE p.timezone)
                   )
  );
$$;

-- The access window: the substitution is still the caller's AND the session has come
-- within 48 hours. The START of the window lives here and nowhere else.
--
-- The start instant is the session's OWN, derived from the current schedule by
-- the function that already owns that arithmetic, so the predicate and the card
-- the sub is reading agree about when the session is: both resolve the date
-- against the slots, and where a weekday carries two slots BOTH take the
-- earliest-starting one. Do not "fix" that to the latest — the client's
-- occurrence resolver takes the earliest, and the two have to name one instant.
--
-- THE ORPHAN CASE FAILS OPEN. A date the schedule no longer projects has no
-- start to count back from, and the sub may still owe that session a write-up:
-- an admin moving the group's weekday must not lock somebody out of an
-- afternoon they actually ran. Product-local midnight of the session date
-- stands in, which opens the window at midnight-minus-48h — earlier than any
-- real session on that date would have, so the fallback can only ever admit
-- sooner and never later.
CREATE OR REPLACE FUNCTION public.gedu_substitutes_session(p_group_id uuid, p_session_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.gedu_holds_unexpired_substitution(p_group_id, p_session_date)
     AND EXISTS (
       SELECT 1
         FROM public.product_groups g
         JOIN public.products p ON p.id = g.product_id
        WHERE g.id = p_group_id
          AND now() >= COALESCE(
                         lower(public.derive_group_session_window(g.id, p_session_date)),
                         (p_session_date::timestamp AT TIME ZONE p.timezone)
                       ) - interval '48 hours'
     );
$$;

-- A recreated function comes back PUBLIC-executable, so both are re-revoked and
-- re-granted rather than left to inherit. Both are internal: they are called
-- from inside SECURITY DEFINER bodies only, and `gedu_substitutes_group` remains the
-- one substitution predicate `authenticated` may execute.
REVOKE EXECUTE ON FUNCTION public.gedu_holds_unexpired_substitution(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.gedu_holds_unexpired_substitution(uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gedu_substitutes_session(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.gedu_substitutes_session(uuid, date) TO service_role;

COMMENT ON FUNCTION public.gedu_holds_unexpired_substitution(p_group_id uuid, p_session_date date) IS
  'Internal predicate: does the CALLER still hold this (group, date) substitution at all? True when they are the substitute_id of a `substituted` request for it, are still certified, and it has not EXPIRED — now() < COALESCE(report_emailed_at + 24 hours, product-local midnight 15 days after the session date). The single definition of the window''s END. It makes NO start test, which is what separates it from gedu_substitutes_session: this one answers whether the substitution is still the caller''s to SEE, and the gedu dashboard''s two reads ask it so that an accepted substitution appears on My SOG from approval rather than from the moment its workspace opens. Not granted to `authenticated`.';

COMMENT ON FUNCTION public.gedu_substitutes_session(p_group_id uuid, p_session_date date) IS
  'Internal predicate: may the CALLER reach this group for this exact date? Their substitution is unexpired (gedu_holds_unexpired_substitution, which carries the window''s END) AND the session has come within 48 hours — now() >= the session''s own scheduled start, derived from the current schedule, minus 48 hours. The single definition of the window''s START; every other substitution access test reaches both bounds through here or through gedu_substitutes_group. A date the schedule no longer projects has no start, and falls back to product-local midnight of the session date, which opens EARLIER than any real session that day would: an orphaned date must not lock a sub out of a session they ran and still owe a report for. Not granted to `authenticated`: it is called from inside SECURITY DEFINER functions only, the two voice predicates among them.';

-- ---------------------------------------------------------------------------
-- 2. The two dashboard reads ask the sibling
-- ---------------------------------------------------------------------------
--
-- Restated whole from their 00272 definitions — 00273-00276 did not touch
-- either — with one call changed in each and nothing else. Neither signature
-- moves, so both are a plain replace.
CREATE OR REPLACE FUNCTION public.get_my_assigned_products() RETURNS TABLE(product_id uuid, group_id uuid, timezone text, start_date date, end_date date, is_remote boolean, product_type public.product_type, product_translations jsonb, schedule_slots jsonb, group_count integer, participant_count integer, kind text, substitution_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_gedu_id UUID := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- Two arms, discriminated by `kind`, because a gedu's dashboard now has two
  -- kinds of thing on it: a standing ASSIGNMENT (one row per assignment, as
  -- before, `substitution_date` null) and an unexpired SUBSTITUTION (one row per substituted
  -- date, `substitution_date` set). They share every product-shell column, which is why
  -- they are one RPC rather than two — the card the dashboard draws differs in
  -- its chrome, not in the facts it needs.
  RETURN QUERY
  SELECT
    p.id            AS product_id,
    a.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS participant_count,
    'assignment'::text AS kind,
    NULL::date         AS substitution_date
  FROM gedu_group_assignments a
  JOIN products p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id

  UNION ALL

  -- The caller's UNEXPIRED substitutions: one row per substituted (group, date) the caller
  -- still holds. `gedu_holds_unexpired_substitution` carries the whole of that — it is
  -- keyed to auth.uid(), requires the holder to still be certified, and applies
  -- the window's END — so nothing here restates any of it. The status test
  -- beside it is not redundant either: it is what makes the join read as "a
  -- substituted request", and the predicate then decides whether it is still
  -- current.
  --
  -- Deliberately NOT gedu_substitutes_session, which would also require the session
  -- to be within 48 hours: this is the row the substitution card on My SOG is drawn
  -- from, and a sub has to see the afternoon they accepted from the moment it
  -- is theirs, not from the moment they can open the group. The workspace the
  -- card links to is the thing that stays shut, and it is gated on
  -- gedu_substitutes_session like every other access surface.
  SELECT
    p.id            AS product_id,
    r.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS participant_count,
    'substitution'::text   AS kind,
    r.session_date  AS substitution_date
  FROM session_substitution_requests r
  JOIN product_groups g ON g.id = r.group_id
  JOIN products p       ON p.id = g.product_id
  WHERE r.substitute_id = v_gedu_id
    AND r.status     = 'substituted'::public.substitution_request_status
    AND public.gedu_holds_unexpired_substitution(r.group_id, r.session_date);
END;
$$;
CREATE OR REPLACE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN COALESCE((
    -- The caller's SEATS on groups, of which there are now two kinds. The union
    -- is the whole of the change to this function: everything below it is
    -- written against a (product, group) pair and a possible substitution DATE, and
    -- does not care which arm produced them.
    --
    --   * `assignment` — one row per gedu_group_assignments row, exactly as
    --     before, with `substitution_date` null.
    --   * `substitution`      — one row per UNEXPIRED substitution date.
    --     gedu_holds_unexpired_substitution carries the whole of that: keyed to
    --     auth.uid(), the holder still certified, and the window's END not yet
    --     passed. Deliberately not gedu_substitutes_session, which would also
    --     require the session to be within 48 hours — this arm feeds the substitution
    --     card a sub reads on My SOG, which exists from approval, where the
    --     workspace it links to opens at T-48h.
    --
    -- `gedu_id` is carried through rather than dropped so the closing
    -- `WHERE a.gedu_id = v_uid` still reads as the statement it always was.
    WITH seat AS (
      SELECT a0.product_id,
             a0.group_id,
             a0.gedu_id,
             'assignment'::text AS kind,
             NULL::date         AS substitution_date
        FROM public.gedu_group_assignments a0
       WHERE a0.gedu_id = v_uid
      UNION ALL
      SELECT g0.product_id,
             r0.group_id,
             r0.substitute_id AS gedu_id,
             'substitution'::text  AS kind,
             r0.session_date AS substitution_date
        FROM public.session_substitution_requests r0
        JOIN public.product_groups g0 ON g0.id = r0.group_id
       WHERE r0.substitute_id = v_uid
         AND r0.status     = 'substituted'::public.substitution_request_status
         AND public.gedu_holds_unexpired_substitution(r0.group_id, r0.session_date)
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
               -- Renamed from group_gamer_count in 00175: the count is every
               -- active seat on the group, and since 00173 one of those can be
               -- an adult.
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

      -- The run's FINAL computed occurrence (00227), which is the only session
      -- the creations condition below can attach to. NULL for an open-ended
      -- product, and NULL for a run whose schedule projects nothing at all;
      -- either way the equality below never holds and nothing ever owes.
      --
      -- Seven days ending at end_date, floored at start_date. Slots are weekly,
      -- so a run of a week or more has every weekday in that window and a
      -- shorter run is wholly inside it — which makes the max over the window
      -- the max over the whole run, at a bounded cost.
      CROSS JOIN LATERAL (
        SELECT max(d::date) AS session_date
          FROM generate_series(
                 GREATEST(
                   COALESCE(p.start_date, p.end_date - 6),
                   p.end_date - 6
                 )::timestamp,
                 p.end_date::timestamp,
                 interval '1 day'
               ) AS d
         -- Explicit rather than relying on generate_series answering nothing for
         -- a NULL bound: "an open-ended product never owes" is a decision and it
         -- should be readable as one.
         WHERE p.end_date IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM public.schedule_slots s
              WHERE s.product_id = p.id
                AND s.weekday = (EXTRACT(ISODOW FROM d)::integer - 1)
           )
      ) AS final_occurrence

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS owed_count
          FROM (
            -- Occurrences the schedule projects, floored at max(product start,
            -- epoch) and bounded above by "has actually finished".
            --
            -- The epoch floors THIS COUNT and nothing else. A pre-epoch session
            -- is fully recordable — a gedu may take its attendance and write it
            -- up — it simply never becomes work the platform asks for. That is
            -- why the write validator has no epoch floor of its own.
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

          -- The occurrence's END INSTANT — one value per occurrence, and the
          -- same value whichever arm of the union above produced it.
          --
          -- The union is deliberately left keyed on the date alone: carrying an
          -- end instant through it would let one date arrive twice with two
          -- different ends and count the occurrence twice. So it is resolved
          -- here instead — the stored row's own `ends_at` where the occurrence
          -- has a row, and otherwise the schedule's arithmetic.
          --
          -- MIN over the weekday's slots, not MAX, and that is not arbitrary:
          -- the projected arm admits a date when EXISTS a slot whose end has
          -- passed, and `EXISTS (end <= now)` is exactly `min(end) <= now`. The
          -- "has it finished" test and the "who did it expect" test therefore
          -- read the same instant by construction rather than by inspection.
          --
          -- Today the choice is moot, and it is worth naming WHY rather than
          -- leaving the guarantee incidental: `schedule_slots_product_id_weekday_key`
          -- is UNIQUE (product_id, weekday), so a weekday carries at most one
          -- slot and this MIN ranges over exactly one row. That is also what
          -- keeps the TypeScript twin in step, since its projection maps one
          -- slot per weekday and cannot pick a different one. **If that
          -- constraint is ever relaxed — the group_sessions unique key already
          -- flags multi-slot days as a revisit — the twins DIVERGE:** this side
          -- would take the minimum end, while the client's takes the
          -- earliest-STARTING slot's end, and those differ whenever the slot
          -- that starts earlier runs longer. Whoever relaxes it changes both
          -- halves in the same commit, or the badge and the card start
          -- disagreeing on multi-slot days only.
          CROSS JOIN LATERAL (
            SELECT COALESCE(
                     (SELECT gs5.ends_at
                        FROM public.group_sessions gs5
                       WHERE gs5.group_id     = g.id
                         AND gs5.session_date = occurrence.session_date),
                     (SELECT min(((occurrence.session_date + s2.start_time) AT TIME ZONE p.timezone)
                                 + make_interval(mins => s2.duration_minutes))
                        FROM public.schedule_slots s2
                       WHERE s2.product_id = p.id
                         AND s2.weekday = (EXTRACT(ISODOW FROM occurrence.session_date)::integer - 1))
                   ) AS ends_at
          ) AS occurrence_end

          -- How many the register was FOR — the members who had joined the
          -- group before this occurrence ended.
          --
          -- Separate from roster.roster_size on purpose: that one is the whole
          -- current roster and answers the dashboard card's headcount and the
          -- empty-group exemption, neither of which is a per-occurrence
          -- question.
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

         WHERE roster.roster_size > 0
           -- A SUBSTITUTION row owes ONE date: the one it substitutes for. The four conditions
           -- below are untouched and simply see a set of one occurrence, which
           -- is what "the same code path, restricted to that date" means — no
           -- second computation, and in particular the creations condition (4)
           -- fires for a substitution only when the substitution date really is the run's
           -- final occurrence. An ASSIGNMENT row sees every occurrence, as
           -- before.
           AND (a.substitution_date IS NULL OR occurrence.session_date = a.substitution_date)
           -- A date the caller holds a NON-WITHDRAWN request on is not their
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
                AND rq.requested_by = v_uid
                AND rq.status <> 'withdrawn'::public.substitution_request_status
           )
           -- "Needs attention" is FOUR questions joined by OR, and any one
           -- alone keeps the session on the list.
           --
           -- This derivation has a TWIN IN TYPESCRIPT — the gedu feed's
           -- entry-state module, which decides the same thing for the card
           -- from the feed document — and the two must agree, or the dashboard
           -- badge counts a session the card calls finished. Changing either
           -- half means changing both, in the same commit. That includes the
           -- CREATIONS condition (4) below — which, since 00243, is scoped by
           -- the same join-date test (1) is — and which members a session is
           -- FOR at all: the TS side asks the same question of the same
           -- instant, with the same inclusive boundary, in both conditions.
           AND (
             -- (1) Some of the members this session EXPECTED have no answer
             -- yet. Both sides of the comparison are scoped the same way: marks
             -- are counted only for members who had joined before the
             -- occurrence ended, and they are compared against how many such
             -- members there are.
             --
             -- Before 00243 this compared every mark against the whole current
             -- roster, so placing a member into a group reopened every session
             -- in its history and the only way to clear the alert was to record
             -- an absence that never happened. The reasoning was that nobody
             -- had yet said whether that child was there; there was no question
             -- to answer, because they were not in the group.
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
             -- (3) The families have not been told it is there (00197).
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
             -- somebody on the current roster who has none (00227). Creations
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
             -- An empty roster is already excluded by the roster_size guard
             -- above, so nothing here has to restate it. A group whose every
             -- seat postdates the final session is NOT excluded by that guard —
             -- it has a roster — and falls out of this condition instead: no
             -- seat passes the join-date predicate, so the EXISTS is false and
             -- nothing is owed, which is the same answer for the same reason.
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

     WHERE a.gedu_id = v_uid
  ), '[]'::jsonb);
END;
$$;
-- ---------------------------------------------------------------------------
-- 3. Grants and comments
-- ---------------------------------------------------------------------------
--
-- A replace keeps the privileges a drop-and-create would lose, so these restate
-- what is already there rather than repairing it — which is what makes the
-- statement below the place to read the exposure off.
REVOKE EXECUTE ON FUNCTION public.get_my_assigned_products() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_assigned_products() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO service_role;

COMMENT ON FUNCTION public.get_my_assigned_products() IS
  'Every product the calling gedu has a seat on, one row per seat, with the '
  'product shell, its schedule slots, how many groups it has and how many active '
  'seats (participant_count — renamed from gamer_count in 00175, because a seat '
  'may be held by an adult since 00173). Gedu-gated on its first statement. '
  'TWO KINDS OF SEAT since 00272, discriminated by `kind`: an `assignment` row '
  'per gedu_group_assignments row, with `substitution_date` null, exactly as this '
  'function always returned; and a `substitution` row per UNEXPIRED substitution date, with '
  '`substitution_date` set — a `substituted` request whose holder is still certified and '
  'whose window has not closed, which is the whole of what '
  'gedu_holds_unexpired_substitution decides. That predicate rather than '
  'gedu_substitutes_session, and the difference is the point: this read draws the '
  'substitution CARD on My SOG, which stands from approval, where the workspace the '
  'card links to opens 48 hours before the substituted session. A substitution row '
  'therefore reaches a sub who cannot yet open the group, and carries nothing '
  'that would not be theirs to read then: names, a type, a date, the schedule, '
  'and two head counts. One RPC rather than two because the two kinds share '
  'every product-shell column and the dashboard card differs in its chrome '
  'rather than in the facts it needs.';

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS
  'One row per gedu assignment for the dashboard cards: group name, that '
  'group''s participant count (renamed from group_gamer_count in 00175 — an '
  'active seat may be held by an adult since 00173), the venue name on '
  'in-person products, and how many past sessions still need attention. A '
  'finished session on or after the epoch counts until ALL of: the register is '
  'in, a family-facing report is written, the mail telling the families it is '
  'there has been sent (00197), and — since 00227, on the run''s FINAL session '
  'of a product with requires_gamer_creations set — every current roster member '
  'has at least one creation. Since 00243 the register condition is scoped to '
  'the members who had JOINED the group before that occurrence ended: both the '
  'marks counted and the size they are compared against, off '
  'participations.group_joined_at against an end instant resolved once per '
  'occurrence (the stored row''s ends_at, else the min slot end for that '
  'weekday, which is the same instant the "has it finished" test already used). '
  'group_participant_count and the empty-roster guard deliberately keep '
  'measuring the WHOLE current roster — a card''s headcount and the empty-group '
  'exemption are not per-occurrence questions. The report and mail conditions '
  'are unscoped because a session owes those whoever was in the room. The '
  'creations condition carries the SAME join-date scoping as the register '
  'condition, on the owner''s principle that a gedu owes a creation for every '
  'gamer who was in the group at the time of the last session — so a seat '
  'placed into the group after the final session ended owes nothing, and one '
  'occurrence cannot answer "who was this for" two different ways. Only the '
  'JOIN half of that principle is expressible: a member who has since LEFT owes '
  'nothing, because the roster is active seats and a departure leaves no trace. '
  'The final session is the last occurrence the schedule projects on or before '
  'end_date, derived here rather than stored; an open-ended product (end_date '
  'NULL) has none and therefore never owes creations, which is documented '
  'behaviour rather than an error. The badge''s unit is unchanged: it counts '
  'SESSIONS needing attention, and the final one simply has one more way to '
  'need it. The enforcement epoch travels in as an argument because it is a '
  'code constant, not a column. This count has a twin in TypeScript — the gedu '
  'feed''s entry-state derivation, which answers the same question for one '
  'card — and the two must be changed together, on all four conditions and on '
  'who a session is for, which now scopes two of them. SINCE 00272 a second '
  'kind of seat feeds the same machinery: a `substitution` row per substitution date, '
  'carrying `kind` and `substitution_date`, whose owed count is the same four '
  'conditions applied to a set of one occurrence — so it is 0 or 1 and never a '
  'term''s worth. Since 00278 that arm asks gedu_holds_unexpired_substitution rather '
  'than gedu_substitutes_session: the card stands from approval, where the workspace '
  'behind it opens 48 hours before the substituted session, and a card that waited '
  'for the workspace would hide from a sub the afternoon they had agreed to '
  'take. A substitution still locked owes nothing by construction, because every '
  'occurrence this count ranges over has already ended.';

-- ---------------------------------------------------------------------------
-- 4. End state
-- ---------------------------------------------------------------------------
--
-- The claim 00272 made and this migration has to keep making is that the access
-- window has ONE definition. It has two bounds now, so the assertion is counted
-- rather than argued: each bound's expression occurs in exactly one body in the
-- schema, and in the body that owns it. Both are searched for in the catalogs
-- rather than listed here, so a third copy written next year fails this on the
-- way in.

DO $$
DECLARE
  -- The two expressions, as they are written in the bodies above. Matched as
  -- text because that is what a duplicate would be: somebody restating the
  -- arithmetic instead of calling the predicate that owns it.
  v_end   constant text := 'report_emailed_at + interval ''24 hours''';
  v_start constant text := 'interval ''48 hours''';
  v_owners text[];
  v_callers text[];
  v_name   text;
BEGIN
  SELECT array_agg(p.proname::text ORDER BY p.proname COLLATE "C")
    INTO v_owners
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc LIKE '%' || v_end || '%';

  IF v_owners IS DISTINCT FROM ARRAY['gedu_holds_unexpired_substitution'] THEN
    RAISE EXCEPTION
      'the window''s END is written in % rather than in gedu_holds_unexpired_substitution alone', v_owners::text;
  END IF;

  SELECT array_agg(p.proname::text ORDER BY p.proname COLLATE "C")
    INTO v_owners
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc LIKE '%' || v_start || '%';

  IF v_owners IS DISTINCT FROM ARRAY['gedu_substitutes_session'] THEN
    RAISE EXCEPTION
      'the window''s START is written in % rather than in gedu_substitutes_session alone', v_owners::text;
  END IF;

  -- Who may ask the unexpired question rather than the access one. Three
  -- bodies, and each for a stated reason: the access predicate builds on it,
  -- and the two gedu dashboard reads draw the substitution card from it. A fourth
  -- caller is a surface that has quietly stopped applying the 48-hour start,
  -- which is the one way this split can go wrong, so it fails here.
  SELECT array_agg(p.proname::text ORDER BY p.proname COLLATE "C")
    INTO v_callers
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname <> 'gedu_holds_unexpired_substitution'
     AND p.prosrc LIKE '%gedu_holds_unexpired_substitution%';

  IF v_callers IS DISTINCT FROM ARRAY[
       'gedu_substitutes_session', 'get_my_assigned_products',
       'get_my_gedu_assignment_summaries'
     ] THEN
    RAISE EXCEPTION
      'gedu_holds_unexpired_substitution is called by % — every ACCESS gate must call gedu_substitutes_session, which is the one that applies the 48-hour start', v_callers::text;
  END IF;

  -- The substitution arm of each dashboard read still reads the requests table, which
  -- is what keeps both of them inside the swept substitution branch on
  -- gedu_group_assignments (the sweep itself is 00272's and the permanent one
  -- in tests/db/session-substitution.test.ts).
  FOREACH v_name IN ARRAY ARRAY[
    'get_my_assigned_products', 'get_my_gedu_assignment_summaries'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = v_name
         AND p.prosrc LIKE '%session_substitution_requests%'
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
         AND NOT p.proisstrict
    ) THEN
      RAISE EXCEPTION
        '% has lost its substitution arm, its authenticated grant, or has become STRICT or anon-reachable', v_name;
    END IF;
  END LOOP;

  -- Both window predicates are internal. gedu_substitutes_group stays the one substitution
  -- predicate `authenticated` may execute, because the gedus_read_assigned_groups
  -- policy calls it and a policy is evaluated as the querying role.
  FOREACH v_name IN ARRAY ARRAY[
    'gedu_holds_unexpired_substitution', 'gedu_substitutes_session'
  ] LOOP
    IF EXISTS (
      SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = v_name
         AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
              OR has_function_privilege('anon', p.oid, 'EXECUTE'))
    ) THEN
      RAISE EXCEPTION
        '% is an internal helper and must not be reachable from the Data API', v_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'gedu_substitutes_group'
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'gedu_substitutes_group has lost its authenticated grant, or gained an anon one';
  END IF;
END $$;
