--
-- Name: get_my_gedu_assignment_summaries(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
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


--
-- Name: FUNCTION get_my_gedu_assignment_summaries(p_epoch_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS 'One row per gedu assignment for the dashboard cards: group name, that group''s participant count (an active seat may be held by an adult as well as by a child), the venue name on in-person products, and how many past sessions still need attention. A finished session on or after the epoch counts until ALL of: the register is in, a family-facing report is written, the mail telling the families it is there has been sent, and — on the run''s FINAL session of a product with requires_gamer_creations set — every current roster member has at least one creation. The register condition is scoped to the members who had JOINED the group before that occurrence ended: both the marks counted and the size they are compared against, off participations.group_joined_at against an end instant resolved once per occurrence (the stored row''s ends_at, else the min slot end for that weekday, which is the same instant the "has it finished" test already used). group_participant_count and the empty-roster guard deliberately keep measuring the WHOLE current roster — a card''s headcount and the empty-group exemption are not per-occurrence questions. The report and mail conditions are unscoped because a session owes those whoever was in the room. The creations condition carries the SAME join-date scoping as the register condition, on the owner''s principle that a gedu owes a creation for every gamer who was in the group at the time of the last session — so a seat placed into the group after the final session ended owes nothing, and one occurrence cannot answer "who was this for" two different ways. Only the JOIN half of that principle is expressible: a member who has since LEFT owes nothing, because the roster is active seats and a departure leaves no trace. The final session is the last occurrence the schedule projects on or before end_date, derived here rather than stored; an open-ended product (end_date NULL) has none and therefore never owes creations, which is documented behaviour rather than an error. The badge''s unit is the SESSION: it counts sessions needing attention, and the final one simply has one more way to need it. The enforcement epoch travels in as an argument because it is a code constant, not a column. This count has a twin in TypeScript — the gedu feed''s entry-state derivation, which answers the same question for one card — and the two must be changed together, on all four conditions and on who a session is for, which scopes two of them. A SECOND KIND OF SEAT feeds the same machinery: a `substitution` row per substitution date, carrying `kind` and `substitution_date`, whose owed count is the same four conditions applied to a set of one occurrence — so it is 0 or 1 and never a term''s worth. That arm asks gedu_holds_unexpired_substitution rather than gedu_substitutes_session: the card stands from approval, where the workspace behind it opens 48 hours before the substituted session, and a card that waited for the workspace would hide from a sub the afternoon they had agreed to take. A substitution still locked owes nothing by construction, because every occurrence this count ranges over has already ended.';


--
-- Name: FUNCTION get_my_gedu_assignment_summaries(p_epoch_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) TO service_role;


