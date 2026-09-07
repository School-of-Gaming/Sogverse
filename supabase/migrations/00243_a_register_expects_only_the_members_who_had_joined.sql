-- A register expects only the members who had joined when the session ran.
--
-- WHY
--
-- A gedu wrote in. Her club had two participants; she ran a session, marked
-- them both present, and wrote it up. Two more children were placed into the
-- group the next day — which is good news, and the whole point of a club that
-- fills up. The platform's answer was to reopen every finished session in that
-- group's history and demand an answer for each new member on each of them,
-- and the only way to clear the alert was to mark those children ABSENT from
-- afternoons they had no part in.
--
-- This was deliberate, and it was written down in two places as the honest
-- reading: attendance is measured against the CURRENT roster, so a newcomer
-- reopens what was finished, "since nobody has yet said whether that child was
-- there". That reasoning does not survive contact with the case. There is no
-- unanswered question about whether a child attended a session held before they
-- joined the group. They were not in the group. Presenting an unanswerable
-- question as the honest one, and then requiring a false answer to clear it, is
-- the defect — and the record it produced is worse than the gap it closed,
-- because a stored absence is a claim about a child that a parent may one day
-- read.
--
-- THE RULE
--
-- A roster member is expected on a session's register only if they joined the
-- group before that session ENDED.
--
-- The comparison is against the end instant rather than the start, and it is
-- inclusive, both in the generous direction on purpose: a member placed into
-- the group while the club was running that afternoon may well have walked in,
-- so they stay expected and the gedu decides. What the rule refuses is only the
-- claim that somebody could have attended a session that had already finished
-- before they arrived.
--
-- The same test decides the FINAL session's creations, on the owner's principle
-- that a gedu owes a creation for every gamer who was in the group at the time
-- of the last session. One question — was this member here when this session
-- ended — asked once and answered once, for both of the per-member things a
-- session can owe.
--
-- On the client the answer is also what a card DRAWS: a member the session did
-- not expect gets no register row, no attendance chip and no creations chip on
-- it. That goes further than this file's first revision, which muted and
-- labelled such a row instead; the owner removed it, on the ground that telling
-- a gedu somebody joined late on a session that ran months before they arrived
-- is a sentence with nothing behind it. None of that reaches storage — a mark
-- already recorded for such a member is kept and survives every save — and
-- none of it reaches this file, which counts rather than renders.
--
-- The datum already exists and needs no new storage:
-- `participations.group_joined_at` (00203), stamped by a BEFORE INSERT OR
-- UPDATE trigger that catches every writer of `group_id`, including the
-- ON DELETE SET NULL cascade.
--
-- WHAT IS SCOPED, AND WHAT IS DELIBERATELY NOT
--
-- Condition (1) of `get_my_gedu_assignment_summaries` compared a count of marks
-- against `roster.roster_size`. BOTH sides are now scoped to the members who
-- had joined before the occurrence ended: the marks counted, and the size they
-- are compared against.
--
-- `roster.roster_size` itself is untouched and still means the whole current
-- roster, because its two other readers are asking different questions. It is
-- emitted as `group_participant_count`, which answers "how many gamers are in
-- my group" on a dashboard card — a fact about the group today, not about any
-- one occurrence. And it drives the `roster.roster_size > 0` guard, which is
-- the empty-group exemption: a group with nobody in it must not accrue one
-- alert per week, and that is about the group being empty, not about who a
-- particular session expected. A per-occurrence expected size is derived
-- separately, beside it.
--
-- Conditions (2) and (3) are untouched. The report and the mail to the
-- families are owed by the session regardless of who was in the room, so who
-- had joined is no part of them.
--
-- Condition (4) — the final session's creations — IS scoped, on the same
-- predicate against the same per-occurrence end instant. It has the same
-- joining-reopens-it shape as (1), and the owner has ruled that it follows:
-- if a gamer was in the group at the time of the last session then that gedu
-- owes that gamer a creation, and a gamer who was not in the group then owes
-- nothing. Scoping (1) alone would have left one occurrence answering the same
-- question two ways — a member omitted from the final session's register and
-- itemized on the same card as owing a creation for it.
--
-- Only the JOIN half of "was in the group at the time" is expressible. A member
-- who was in the group at the final session and has SINCE LEFT owes nothing:
-- the roster is active seats and a departure leaves no trace to measure. That
-- is unchanged behaviour and a limit of the data rather than a decision, and it
-- is stated here so the next reader does not go looking for the missing half.
--
-- ONE OCCURRENCE, ONE END INSTANT
--
-- The occurrence set is a UNION of dates the schedule projects and orphaned
-- `group_sessions` rows, and the rule needs an end instant on both arms. The
-- union itself is left exactly as it was — widening it to two columns would let
-- one date arrive twice with two different ends and double-count the
-- occurrence — and the end instant is resolved once per occurrence in a lateral
-- beside it: the stored row's `ends_at` where the occurrence has one, and
-- otherwise the schedule's own arithmetic. That fallback takes the MIN over the
-- weekday's slots, which is not an arbitrary choice: the projected arm's
-- "has this finished yet" guard is an EXISTS over the same expression, and
-- `EXISTS (end <= now)` is exactly `min(end) <= now`. The two therefore agree
-- about what an occurrence's end instant is by construction rather than by
-- inspection.
--
-- A NULL end instant is unreachable — a projected occurrence has a slot by the
-- EXISTS that admitted it, and an orphaned one has a stored row — but it is
-- handled explicitly anyway, in the safe direction: no end instant means every
-- member is expected, which is the behaviour that predates this migration.
--
-- THE BACKFILL, AND RETIRING 00203's ASSERTION
--
-- `group_joined_at` shipped with no backfill, so every seat placed before
-- 2026-08-25 carries NULL — most of the platform. Reading NULL as "has always
-- been here" would have left the reported bug fully alive for exactly those
-- seats, which is to say for the gedu who reported it. So the fix is made at
-- the data:
--
--     UPDATE participations SET group_joined_at = signed_up_at
--      WHERE group_id IS NOT NULL AND group_joined_at IS NULL;
--
-- 00203 refused this, and its end-state block asserts the column is still
-- entirely NULL. That assertion is RETIRED here, deliberately and on the
-- merits, rather than worked around or quietly deleted.
--
-- 00203's objection was that deriving from `signed_up_at` "would badge a large
-- slice of the platform with a claim that is false for exactly the members a
-- gedu would be most surprised to see badged". The newcomer badge was the
-- column's only consumer until this file — verified across every reader of the
-- column in the application, all of which are that one feature, and nothing in
-- SQL reads it in a predicate; the register below is the second consumer, which
-- is what makes the backfill worth its cost. The objection does not hold
-- against how the badge actually works:
--
--   * The badge fires only while `now - group_joined_at` is inside a 30-day
--     window. Post-backfill that means the SEAT is under 30 days old, and group
--     tenure can never exceed seat age, because a seat cannot be placed into a
--     group of a product it does not yet hold. So every badge the backfill can
--     produce is on somebody who genuinely joined that group inside the window.
--   * The "days in" it shows is computed from a signup that is at or before the
--     true join, so it OVERSTATES tenure — it draws a member as less new than
--     they are. The arithmetic is structurally incapable of claiming a
--     long-standing member is new.
--   * Its only error is UNDER-badging somebody recently moved between groups,
--     which is precisely what NULL already does today. Nothing about the badge
--     gets worse; some cases get better.
--   * One bounded side effect, named rather than glossed: seats signed up
--     within the last 30 days but placed before 2026-08-25 begin badging on the
--     day this runs. That population shrinks daily and is empty from roughly
--     2026-09-24, and those badges are correct — they are new members — so it
--     is accepted rather than mitigated.
--
-- THE COST, STATED AS A COST
--
-- NULL currently means "we do not know". The backfill overwrites that with a
-- lower bound, irreversibly: unknown and derived become indistinguishable, and
-- no later migration can tell them apart again. It is accepted because
-- `signed_up_at` is a PROVABLE lower bound on the true join date rather than an
-- estimate of it; because a lower bound can only ever err toward expecting a
-- member on MORE sessions, which is the status quo and the harmless direction,
-- while the opposite error would be a false "complete" on a register nobody
-- took; and because nothing has needed a true historical join date in the year
-- the column has been NULL. A member moved between groups keeps their original
-- signup as the bound and stays expected on sessions predating the move, which
-- degrades to exactly today's behaviour for that member and no further.
--
-- The predicate is the whole of the guard. Only seats that actually hold a
-- group are touched, and only rows with no stamp — so a seat holding no group
-- keeps `group_joined_at IS NULL`, which is what the column comment already
-- says that state means and which no roster ever contains. Re-running the
-- statement is a no-op.
--
-- Two mechanical notes. The stamping trigger is `BEFORE INSERT OR UPDATE OF
-- group_id`, and this statement names only `group_joined_at`, so it does not
-- fire and cannot overwrite what is being written. The `participations_updated_at`
-- trigger DOES fire, so every backfilled seat has its `updated_at` touched, and
-- that is not inert: `get_product_groups_with_details` orders each group's
-- members by `(updated_at, id)`, and the admin Groups panel leans on it — the
-- most-recently-touched row sorts last, which is exactly where the drag board
-- appends optimistically, so the optimistic order and the settle-refetch order
-- agree without a client-side sort. Collapsing every grouped seat onto one
-- instant drops that ordering to its `id` tiebreaker, so each group's chips
-- reshuffle once into UUID order and the "recently moved is last" property is
-- gone until each row is next genuinely written. Accepted: it is cosmetic,
-- confined to one admin panel, self-healing on the next real write, and the
-- alternative — disabling a trigger for a data fix — is worse than the noise.
-- (The unassigned arm of that same document is untouched, since those rows hold
-- no group and fall outside the predicate.) And the table comment's standing "do not set group_joined_at by hand"
-- is unchanged: it governs application code and RPCs, which is where a second
-- writer would silently compete with the trigger. A one-off, guarded, argued
-- backfill in a numbered migration is the exception that rule exists to make
-- explicit rather than a breach of it.
--
-- THE TWIN
--
-- This derivation exists twice by design — here for the dashboard badge, and in
-- TypeScript for the session card (the gedu feed's entry-state module) — and a
-- change to one is a change to both, in the same commit. Both halves of this
-- one ship together: the client grew the same comparison, over the same
-- instant, with the same inclusive boundary, on the register condition and on
-- the creations condition alike. The TypeScript side expresses it as one
-- exported predicate everything else is built from, which is the shape to
-- preserve: a second copy of the comparison over there is how these two twins
-- come to drift apart in halves.

-- ---------------------------------------------------------------------------
-- 1. The backfill, before anything reads the column under the new rule
-- ---------------------------------------------------------------------------

UPDATE public.participations
   SET group_joined_at = signed_up_at
 WHERE group_id IS NOT NULL
   AND group_joined_at IS NULL;

COMMENT ON COLUMN public.participations.group_joined_at IS
  'When this seat entered its CURRENT group. NULL when the seat holds no group, '
  'and only then — the rows that predated the column were backfilled from their '
  'own signed_up_at in 00243, which retired 00203''s deliberate refusal to do '
  'so. That refusal was argued against the newcomer badge, the column''s only '
  'consumer; 00243 answers it on the merits and states the cost, which is that '
  '"unknown" and "derived from signup" are no longer distinguishable. Signup is '
  'a provable lower bound on the true join — a seat cannot enter a group of a '
  'product it does not hold — so a backfilled value can only ever understate '
  'how new a member is. A move between two groups of one product RESETS the '
  'stamp: the member is new to THAT group, which is the whole claim the '
  'newcomer badge makes, and it is also the floor the session register measures '
  'its expectations from (00243). Stamped only by '
  'trg_participations_stamp_group_joined_at, which is the column''s only '
  'ongoing writer — no RPC and no policy-driven UPDATE sets it, because '
  'group_id has at least five writers (including the ON DELETE SET NULL cascade '
  'from product_groups) and a trigger is the only point that sees all of them.';

-- ---------------------------------------------------------------------------
-- 2. The dashboard count, with condition (1) scoped to who had joined
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
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
               'product_id',              a.product_id,
               'group_id',                a.group_id,
               'group_name',              g.name,
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

REVOKE ALL ON FUNCTION public.get_my_gedu_assignment_summaries(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO service_role;

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
  'who a session is for, which now scopes two of them.';

-- ---------------------------------------------------------------------------
-- 3. End state
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_src  text;
  v_left bigint;
BEGIN
  -- --- (a) The backfill landed, and left the one NULL state that means -------
  --         something.
  SELECT COUNT(*) INTO v_left
    FROM public.participations
   WHERE group_id IS NOT NULL
     AND group_joined_at IS NULL;

  IF v_left <> 0 THEN
    RAISE EXCEPTION 'the group_joined_at backfill left % grouped seat(s) unstamped', v_left;
  END IF;

  -- The complement, asserted positively: a seat holding no group must still
  -- read NULL. 00203's assertion that the column is entirely NULL is retired
  -- by this file; this is what replaces it, and it is the invariant the column
  -- comment actually claims.
  IF EXISTS (
    SELECT 1 FROM public.participations
     WHERE group_id IS NULL AND group_joined_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a seat holding no group carries a group_joined_at — the trigger clears it, so something wrote the column by hand';
  END IF;

  -- --- (b) The summaries RPC kept its guard and every condition. ------------
  SELECT pr.prosrc INTO v_src
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname = 'get_my_gedu_assignment_summaries';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries is missing after being replaced';
  END IF;

  IF position('PERFORM public.assert_role(''gedu'')' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost its assert_role(''gedu'') guard';
  END IF;

  -- The count is an OR, so a condition lost while retyping silently lowers
  -- every badge on the dashboard rather than failing anywhere.
  IF position('session_attendance' IN v_src) = 0
     OR position('report_emailed_at' IN v_src) = 0
     OR position('btrim(COALESCE(gs3.report' IN v_src) = 0
     OR position('requires_gamer_creations' IN v_src) = 0
     OR position('gamer_group_creations' IN v_src) = 0
     OR position('final_occurrence' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost one of its four attention conditions';
  END IF;

  -- --- (c) The new scoping is actually in the body. -------------------------
  IF position('part2.group_joined_at' IN v_src) = 0
     OR position('part4.group_joined_at' IN v_src) = 0
     OR position('expected.expected_size' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries did not take the joined-before-it-ended scoping — both the mark count and the size it is compared against have to carry it';
  END IF;

  -- The creations condition takes the same scoping, and it is asserted
  -- separately because it is the half that is easy to drop: (1) fails loudly
  -- against a fixture the moment its predicate goes missing, whereas (4) fires
  -- on one occurrence per run and would simply go back to over-reporting there.
  IF position('part3.group_joined_at' IN v_src) = 0 THEN
    RAISE EXCEPTION 'the creations condition lost its joined-before-it-ended scoping — a member placed into the group after the final session ended would owe a creation for a session they are not even on the register of';
  END IF;

  IF position('occurrence_end' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries has no per-occurrence end instant — the two arms of the occurrence union would then disagree about what a session''s end is';
  END IF;

  -- --- (d) What must NOT have moved. ----------------------------------------
  IF position('roster.roster_size > 0' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost its empty-roster guard — an empty group owes nothing, and that exemption is not per-occurrence';
  END IF;

  IF position('''group_participant_count'', roster.roster_size' IN v_src) = 0 THEN
    RAISE EXCEPTION 'group_participant_count no longer reports the whole current roster — the card''s headcount is not a per-occurrence number';
  END IF;

  -- The lockstep note is load-bearing: the TypeScript twin has to be changed in
  -- the same commit, and this file has just given the two a fifth thing to
  -- agree on.
  IF position('TWIN IN TYPESCRIPT' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost its TypeScript-twin comment — the comment is what tells the next editor the client derivation must change with it';
  END IF;

  -- --- (e) Grants survived the replacement. ---------------------------------
  IF NOT has_function_privilege('authenticated', 'public.get_my_gedu_assignment_summaries(date)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_my_gedu_assignment_summaries(date)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost an EXECUTE grant during recreation';
  END IF;

  IF has_function_privilege('anon', 'public.get_my_gedu_assignment_summaries(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries is executable by anon — the REVOKE FROM PUBLIC did not take';
  END IF;
END $$;
