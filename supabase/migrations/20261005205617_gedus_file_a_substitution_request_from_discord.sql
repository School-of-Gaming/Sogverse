-- Gedus file a substitution request from Discord.
--
-- WHAT THIS ADDS
--
-- The Discord bot's `/sub` command lets a gedu say "I cannot make this session"
-- without opening the app. The bot runs on the service-role client and knows the
-- caller only by their Discord user id, so every gedu-facing step it needs is
-- reached through that id, resolved to the gedu account linked to it. The
-- checks themselves are not restated: each of the three things the web
-- Substitutions page does through `auth.uid()` is split into an internal body
-- that takes the gedu as an argument, called by the existing web RPC with
-- `auth.uid()` after its role guard and by a Discord wrapper with the linked
-- gedu.
--
-- 1. `gedu_holds_unexpired_substitution` takes the gedu as an argument, so the
--    two seat reads can ask it about a gedu who is not the session's caller.
--    `gedu_substitutes_session`, its other caller, passes `auth.uid()`.
-- 2. The two seat reads behind the absence picker move into
--    `gedu_assigned_products(uuid)` and `gedu_assignment_summaries(uuid, date)`.
--    `get_my_assigned_products` and `get_my_gedu_assignment_summaries` become
--    their role-gated `auth.uid()` wrappers, returning exactly what they did.
-- 3. The filing write moves into `file_session_substitution_request(uuid, …)`.
--    `request_session_substitution` becomes its role-gated `auth.uid()` wrapper,
--    with the same refusals, codes and messages.
-- 4. The Discord side: `require_discord_linked_gedu(text)` resolves a Discord
--    user id to its linked gedu or refuses with P0031, and four wrappers
--    granted to `service_role` alone answer the bot — who the gedu is, their two
--    seat reads, and the filing.

-- ---------------------------------------------------------------------------
-- 1. The unexpired-substitution predicate takes the gedu
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
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
       AND r.substitute_id   = p_gedu_id
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

COMMENT ON FUNCTION public.gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS 'Internal predicate: does this gedu still hold this (group, date) substitution at all? True when they are the substitute_id of a `substituted` request for it, are still certified, and it has not EXPIRED — now() < COALESCE(report_emailed_at + 24 hours, product-local midnight 15 days after the session date). The single definition of the window''s END. It makes NO start test, which is what separates it from gedu_substitutes_session: this one answers whether the substitution is still the gedu''s to SEE, and the gedu seat reads (gedu_assigned_products, gedu_assignment_summaries) ask it so that an accepted substitution appears on My SOG from approval rather than from the moment its workspace opens. Takes the gedu as an argument: gedu_substitutes_session asks it about the caller, and the seat reads about the gedu they were handed, who is not the caller when the Discord bot asks. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date) TO service_role;

CREATE OR REPLACE FUNCTION public.gedu_substitutes_session(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.gedu_holds_unexpired_substitution((SELECT auth.uid()), p_group_id, p_session_date)
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

REVOKE ALL ON FUNCTION public.gedu_substitutes_session(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_substitutes_session(p_group_id uuid, p_session_date date) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The two seat reads take the gedu
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.gedu_assigned_products(p_gedu_id uuid) RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- Three arms, discriminated by `kind`: a standing ASSIGNMENT (one row per
  -- assignment, `substitution_date` null), an unexpired SUBSTITUTION (one row
  -- per substituted date, `substitution_date` set), and a TRAINEE seat. They
  -- share every product fact, which is why they are one RPC rather than three —
  -- the card the dashboard draws differs in its chrome, not in the facts it
  -- needs — and every arm states the product through the same shell every
  -- substitution surface uses.
  RETURN QUERY
  SELECT
    a.group_id,
    public.session_product_document(p),
    (
      SELECT count(*)::integer
        FROM public.product_groups pg
       WHERE pg.product_id = p.id
    ),
    (
      SELECT count(*)::integer
        FROM public.participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ),
    'assignment'::text,
    NULL::date,
    public.group_upcoming_cancelled_dates(a.group_id),
    false
  FROM public.gedu_group_assignments a
  JOIN public.products p ON p.id = a.product_id
  WHERE a.gedu_id = p_gedu_id

  UNION ALL

  -- The gedu's UNEXPIRED substitutions: one row per substituted (group, date) the gedu
  -- still holds. `gedu_holds_unexpired_substitution` carries the whole of that — it is
  -- keyed to the gedu asked about, requires the holder to still be certified, and applies
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
    r.group_id,
    public.session_product_document(p),
    (
      SELECT count(*)::integer
        FROM public.product_groups pg
       WHERE pg.product_id = p.id
    ),
    (
      SELECT count(*)::integer
        FROM public.participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ),
    'substitution'::text,
    r.session_date,
    public.group_upcoming_cancelled_dates(r.group_id),
    -- Asked of the substituted date itself rather than read out of
    -- `cancelled_dates`: that window starts the day before today, and the card
    -- stands for days after its date, so a cancelled substitution would
    -- otherwise read as running once its date fell out of the window.
    public.group_session_is_cancelled(r.group_id, r.session_date)
  FROM public.session_substitution_requests r
  JOIN public.product_groups g ON g.id = r.group_id
  JOIN public.products p       ON p.id = g.product_id
  WHERE r.substitute_id = p_gedu_id
    AND r.status     = 'substituted'::public.substitution_request_status
    AND public.gedu_holds_unexpired_substitution(p_gedu_id, r.group_id, r.session_date)

  UNION ALL

  -- The gedu's TRAINEE seats, one row per seat, shaped like an assignment
  -- row. The card links to the trainee's own workspace.
  SELECT
    t.group_id,
    public.session_product_document(p),
    (
      SELECT count(*)::integer
        FROM public.product_groups pg
       WHERE pg.product_id = p.id
    ),
    (
      SELECT count(*)::integer
        FROM public.participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ),
    'trainee'::text,
    NULL::date,
    public.group_upcoming_cancelled_dates(t.group_id),
    false
  FROM public.gedu_group_trainees t
  JOIN public.products p ON p.id = t.product_id
  WHERE t.gedu_id = p_gedu_id;
END;
$$;

COMMENT ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) IS 'Every product the given gedu has a seat on, one row per seat, with the product as session_product_document describes it — the one shell every substitution surface shares, slots included — how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). THREE KINDS OF SEAT, discriminated by `kind`: an `assignment` row per gedu_group_assignments row, with `substitution_date` null; a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides; and a `trainee` row per gedu_group_trainees seat, shaped like an assignment row (substitution_date null, substitution_cancelled false). gedu_holds_unexpired_substitution rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: the product shell, a date, two head counts, and `cancelled_dates` — the row''s group''s upcoming cancelled dates (group_upcoming_cancelled_dates), dates only, which the card skips when naming the next session and the absence picker never offers; and `substitution_cancelled` — whether the substituted date itself is cancelled (group_session_is_cancelled), asked of the date rather than of that window because the substitution card stands for days after it, and false on an assignment row. One RPC rather than three because the kinds share every product fact and the dashboard card differs in its chrome rather than in the facts it needs.';

REVOKE ALL ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_assigned_products() RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN QUERY
  SELECT * FROM public.gedu_assigned_products((SELECT auth.uid()));
END;
$$;

COMMENT ON FUNCTION public.get_my_assigned_products() IS 'Every seat the calling gedu holds, exactly as gedu_assigned_products describes it for that gedu: gedu-gated on its first statement, then that function for auth.uid(). The rows, their three kinds and every fact on them are that function''s; this is the web''s way in, and get_assigned_products_for_discord_user is the Discord bot''s.';

REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO service_role;

CREATE FUNCTION public.gedu_assignment_summaries(p_gedu_id uuid, p_epoch_date date) RETURNS jsonb
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

      -- The run's FINAL computed occurrence, which is the only session
      -- the creations condition below can attach to. NULL for an open-ended
      -- product, and NULL for a run whose schedule projects nothing at all;
      -- either way the equality below never holds and nothing ever owes.
      --
      -- Cancellation: the final session is the last projected occurrence this
      -- GROUP has not had cancelled, so a cancelled last session hands the
      -- creations condition to the one before it rather than dropping it.
      -- The window is therefore a year ending at end_date, floored at
      -- start_date, rather than the week that sufficed before cancellations:
      -- slots are weekly, so any week inside it holds every weekday and the
      -- max over the window is the max over the run unless a whole year of
      -- the group's sessions is cancelled — a bounded cost either way.
      CROSS JOIN LATERAL (
        SELECT max(d::date) AS session_date
          FROM generate_series(
                 GREATEST(
                   COALESCE(p.start_date, p.end_date - 366),
                   p.end_date - 366
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
           AND NOT public.group_session_is_cancelled(g.id, d::date)
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

     WHERE a.gedu_id = p_gedu_id
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.gedu_assignment_summaries(p_gedu_id uuid, p_epoch_date date) IS 'One row per gedu assignment for the dashboard cards: group name, that group''s participant count (an active seat may be held by an adult as well as by a child), the venue name on in-person products, and how many past sessions still need attention. A finished session on or after the epoch counts until ALL of: the register is in, a family-facing report is written, the mail telling the families it is there has been sent, and — on the run''s FINAL session of a product with requires_gamer_creations set — every current roster member has at least one creation. The register condition is scoped to the members who had JOINED the group before that occurrence ended: both the marks counted and the size they are compared against, off participations.group_joined_at against an end instant resolved once per occurrence (the stored row''s ends_at, else the min slot end for that weekday, which is the same instant the "has it finished" test already used). group_participant_count and the empty-roster guard deliberately keep measuring the WHOLE current roster — a card''s headcount and the empty-group exemption are not per-occurrence questions. The report and mail conditions are unscoped because a session owes those whoever was in the room. The creations condition carries the SAME join-date scoping as the register condition, on the owner''s principle that a gedu owes a creation for every gamer who was in the group at the time of the last session — so a seat placed into the group after the final session ended owes nothing, and one occurrence cannot answer "who was this for" two different ways. Only the JOIN half of that principle is expressible: a member who has since LEFT owes nothing, because the roster is active seats and a departure leaves no trace. The final session is the last occurrence the schedule projects on or before end_date that the group has not cancelled, derived here rather than stored — so a cancelled last session hands the creations condition to the one before it; an open-ended product (end_date NULL) has none and therefore never owes creations, which is documented behaviour rather than an error. A CANCELLED occurrence is never owed, by group_session_is_cancelled — including a cancelled record the schedule no longer projects, which the stored-row arm would otherwise reach: nothing ran, and a record kept under a cancellation is frozen. The badge''s unit is the SESSION: it counts sessions needing attention, and the final one simply has one more way to need it. The enforcement epoch travels in as an argument because it is a code constant, not a column. This count has a twin in TypeScript — the gedu feed''s entry-state derivation, which answers the same question for one card — and the two must be changed together, on all four conditions and on who a session is for, which scopes two of them. A SECOND KIND OF SEAT feeds the same machinery: a `substitution` row per substitution date, carrying `kind` and `substitution_date`, whose owed count is the same four conditions applied to a set of one occurrence — so it is 0 or 1 and never a term''s worth. That arm asks gedu_holds_unexpired_substitution rather than gedu_substitutes_session: the card stands from approval, where the workspace behind it opens 48 hours before the substituted session, and a card that waited for the workspace would hide from a sub the afternoon they had agreed to take. A substitution still locked owes nothing by construction, because every occurrence this count ranges over has already ended. A THIRD KIND, `trainee`: a row per gedu_group_trainees seat with substitution_date null, the group name, participant count and venue name like an assignment row, and an attention_count that is always 0 — what a session owes is the staff''s work, so no staff-only aggregate is computed for a trainee seat.';

REVOKE ALL ON FUNCTION public.gedu_assignment_summaries(p_gedu_id uuid, p_epoch_date date) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN public.gedu_assignment_summaries((SELECT auth.uid()), p_epoch_date);
END;
$$;

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS 'The calling gedu''s seat summaries, exactly as gedu_assignment_summaries describes them for that gedu: gedu-gated on its first statement, then that function for auth.uid(). What a summary carries and what its attention count counts are that function''s; this is the web''s way in, and get_gedu_assignment_summaries_for_discord_user is the Discord bot''s.';

REVOKE ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) TO service_role;

-- Every caller of the two-argument predicate now names the gedu.
DROP FUNCTION public.gedu_holds_unexpired_substitution(p_group_id uuid, p_session_date date);

-- ---------------------------------------------------------------------------
-- 3. The filing write takes the gedu
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.file_session_substitution_request(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_timezone text;
  v_role     public.gedu_assignment_role;
  v_note     text;
  v_row      public.session_substitution_requests;
BEGIN
  -- The authorization IS the derivation: you may file an absence only for a
  -- session you are expected at. That admits an assigned gedu and an approved
  -- sub alike — which is the whole of "a sub can ask for a sub" — and refuses
  -- somebody who already has a live request, so filing twice is impossible
  -- before the unique index has to say so.
  IF NOT public.gedu_is_expected_at_session(p_gedu_id, p_group_id, p_session_date) THEN
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

  -- Cancellation: nobody needs cover for a session that is not happening.
  IF public.group_session_is_cancelled(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', p_session_date
      USING ERRCODE = 'P0026';
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
     AND a.gedu_id  = p_gedu_id;

  IF v_role IS NULL THEN
    SELECT r.role INTO v_role
      FROM public.session_substitution_requests r
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.substitute_id   = p_gedu_id
       AND r.status       = 'substituted'::public.substitution_request_status
     LIMIT 1;
  END IF;

  -- Unreachable while the derivation holds — being expected means one of the two
  -- reads above found something — and stated so the NOT NULL column cannot fail
  -- with a constraint name instead of a sentence.
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'no role to substitute for gedu % on group % (%)', p_gedu_id, p_group_id, p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_reason_note, '')), '');

  INSERT INTO public.session_substitution_requests
    (group_id, session_date, requested_by, role, reason, reason_note)
  VALUES (p_group_id, p_session_date, p_gedu_id, v_role, p_reason, v_note)
  RETURNING * INTO v_row;

  RETURN public.substitution_request_document(v_row, false, p_gedu_id);
END;
$$;

COMMENT ON FUNCTION public.file_session_substitution_request(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) IS '"I cannot make this session", filed for the given gedu: the one body of that write, behind request_session_substitution (the web, for auth.uid()) and request_session_substitution_for_discord_user (the Discord bot, for the linked gedu). Makes no role test of its own: each caller has already established that the gedu is a gedu. The AUTHORIZATION IS THE DERIVATION: the gedu must be EXPECTED at that session, which admits an assigned gedu and an approved sub alike (that is the whole of "a sub can ask for a sub") and refuses anyone who already holds a live request, with 42501. The reason category is required here and only here — an admin recording an off-platform substitution may not know it. The date must pass the ordinary writable-date check, must not be a cancelled session (P0026), AND must be today or later in the PRODUCT''s timezone; date granularity is deliberate, the handbook''s own norm being same-day filing, and it is deliberately looser than the card, which hides the action once the session''s end has passed. The role substituted is snapshotted from the gedu''s assignment role, or from the role on the substitution they hold when the gedu is themselves a sub. reason_note is trimmed, nulled when empty, and capped at 500 characters by the table''s own CHECK. Returns the request document as the filer reads it, without reason or reason_note: the filer''s own words come back from the form, and every other gedu-facing document keeps them off the wire. Granted to nobody: reachable only through its two wrappers.';

REVOKE ALL ON FUNCTION public.file_session_substitution_request(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason DEFAULT NULL::public.substitution_reason, p_reason_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN public.file_session_substitution_request(
    (SELECT auth.uid()), p_group_id, p_session_date, p_reason, p_reason_note
  );
END;
$$;

COMMENT ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) IS '"I cannot make this session", filed by the calling gedu from a future session''s card or the Substitutions page''s picker. Gedu-gated on its first statement, then file_session_substitution_request for auth.uid(), which holds every check, refusal and the returned document. The reason parameters carry SQL defaults so a caller with no note omits the key.';

REVOKE ALL ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) TO authenticated;
GRANT ALL ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The Discord bot's way in
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  -- One Discord account may be linked to several Sogverse accounts. Only an
  -- account that is a gedu NOW counts, so a profile whose role has changed
  -- since it was linked never answers; among several gedu accounts the one
  -- linked most recently is the one the person is acting as.
  SELECT l.profile_id INTO v_gedu_id
    FROM public.discord_links l
    JOIN public.profiles p ON p.id = l.profile_id
   WHERE l.discord_user_id = p_discord_user_id
     AND p.role = 'gedu'::public.user_role
   ORDER BY l.linked_at DESC, l.profile_id
   LIMIT 1;

  IF v_gedu_id IS NULL THEN
    RAISE EXCEPTION 'DISCORD_GEDU_NOT_LINKED' USING ERRCODE = 'P0031';
  END IF;

  RETURN v_gedu_id;
END;
$$;

COMMENT ON FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) IS 'The gedu account a Discord user id acts as: the profile linked to it in discord_links whose role is gedu at the moment of asking, and among several such the most recently linked (linked_at, then profile id). Refuses with P0031 (DISCORD_GEDU_NOT_LINKED) when there is none — no link at all, links only to non-gedu accounts, or a NULL id — which the bot answers by asking the person to link their account. Every Discord wrapper calls it first. Granted to nobody.';

REVOKE ALL ON FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_gedu_for_discord_user(p_discord_user_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  v_gedu_id := public.require_discord_linked_gedu(p_discord_user_id);

  RETURN (
    SELECT jsonb_build_object(
             'profile_id', p.id,
             'locale',     p.locale
           )
      FROM public.profiles p
     WHERE p.id = v_gedu_id
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_for_discord_user(p_discord_user_id text) IS 'Which gedu a Discord user id acts as (require_discord_linked_gedu, refusing with P0031 when none), as {profile_id, locale}: locale is profiles.locale as stored, NULL when the gedu has never chosen one, so the bot can fall back to the language Discord reports. For the Discord bot, on the service-role client: granted to service_role alone.';

REVOKE ALL ON FUNCTION public.get_gedu_for_discord_user(p_discord_user_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_for_discord_user(p_discord_user_id text) TO service_role;

CREATE FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  v_gedu_id := public.require_discord_linked_gedu(p_discord_user_id);

  RETURN QUERY
  SELECT * FROM public.gedu_assigned_products(v_gedu_id);
END;
$$;

COMMENT ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) IS 'get_my_assigned_products for the gedu a Discord user id acts as: require_discord_linked_gedu (P0031 when none), then gedu_assigned_products for that gedu, so the rows are the very rows the web reads. For the Discord bot, on the service-role client: granted to service_role alone.';

REVOKE ALL ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) TO service_role;

CREATE FUNCTION public.get_gedu_assignment_summaries_for_discord_user(p_discord_user_id text, p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  v_gedu_id := public.require_discord_linked_gedu(p_discord_user_id);

  RETURN public.gedu_assignment_summaries(v_gedu_id, p_epoch_date);
END;
$$;

COMMENT ON FUNCTION public.get_gedu_assignment_summaries_for_discord_user(p_discord_user_id text, p_epoch_date date) IS 'get_my_gedu_assignment_summaries for the gedu a Discord user id acts as: require_discord_linked_gedu (P0031 when none), then gedu_assignment_summaries for that gedu, so the summaries are the very ones the web reads. For the Discord bot, on the service-role client: granted to service_role alone.';

REVOKE ALL ON FUNCTION public.get_gedu_assignment_summaries_for_discord_user(p_discord_user_id text, p_epoch_date date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_assignment_summaries_for_discord_user(p_discord_user_id text, p_epoch_date date) TO service_role;

CREATE FUNCTION public.request_session_substitution_for_discord_user(p_discord_user_id text, p_group_id uuid, p_session_date date, p_reason public.substitution_reason DEFAULT NULL::public.substitution_reason, p_reason_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  v_gedu_id := public.require_discord_linked_gedu(p_discord_user_id);

  RETURN public.file_session_substitution_request(
    v_gedu_id, p_group_id, p_session_date, p_reason, p_reason_note
  );
END;
$$;

COMMENT ON FUNCTION public.request_session_substitution_for_discord_user(p_discord_user_id text, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) IS '"I cannot make this session", filed from Discord''s /sub command: require_discord_linked_gedu (P0031 when no gedu account is linked), then file_session_substitution_request for that gedu — the same checks, refusals and returned document as request_session_substitution. For the Discord bot, on the service-role client: granted to service_role alone. The reason parameters carry SQL defaults so a caller with no note omits the key.';

REVOKE ALL ON FUNCTION public.request_session_substitution_for_discord_user(p_discord_user_id text, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_session_substitution_for_discord_user(p_discord_user_id text, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) TO service_role;
