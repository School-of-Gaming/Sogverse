-- A state the schema rules out gets no guard.
--
-- Several function bodies carried branches for states their own tables cannot
-- hold. Each branch is removed here, and where the guarantee was a trigger's
-- habit rather than a constraint, it becomes a constraint first:
--
-- * participations.group_joined_at is set exactly when group_id is. The
--   stamping trigger already kept the two in step on every write that names
--   group_id; chk_participations_group_joined_at_iff_group now holds it for
--   every write, a hand-set stamp included. Any row out of step is repaired
--   first, from signed_up_at — the same bound the column's original backfill
--   used.
-- * gedu_assignment_summaries drops its NULL arms on the join stamp and on the
--   occurrence's end instant (a stored NOT NULL ends_at, or the plan's end on a
--   date only the plan projects), the NULL arm on products.start_date (NOT
--   NULL), and the length test on a creations row (its CHECK refuses an empty
--   array).
-- * get_trainee_group_feed and get_trainee_assigned_product read
--   products.timezone (NOT NULL) without a UTC fallback, as every other reader
--   of a product's local day does.
-- * can_read_product answers EXISTS on its own, which is never NULL.
-- * get_my_planned_sessions lets GREATEST skip a NULL stamp itself.
-- * get_admin_municipality_invoicing drops the NULL arms on start_date (NOT
--   NULL) and end_date (chk_products_non_consumer_has_end_date), and reads a
--   club's location through an inner join: every municipality club has one
--   (chk_products_in_person_has_location, chk_products_online_muni_has_location)
--   and the foreign key is ON DELETE RESTRICT.
--
-- Three comments are corrected with them: admin_move_participation's on why it
-- re-checks the target group, the participations table comment (the group
-- trigger rejects a group of another product rather than reconciling
-- product_id), and trg_refresh_product_seat_counts', which called the
-- old-product recompute theoretical when admin_move_participation does move a
-- seat between products.
--
-- ACCESS
--
-- Every function is replaced in place with its signature unchanged, so its
-- grants and comments stand; the one comment that described a removed guard
-- is reissued.

-- ---------------------------------------------------------------------------
-- 1. A seat in a group carries its join stamp, and only then
-- ---------------------------------------------------------------------------

-- Not expected to touch a row: the trigger stamps every write that names
-- group_id. An UPDATE that does not name group_id never fires it, so these
-- write the column directly.
UPDATE public.participations
   SET group_joined_at = signed_up_at
 WHERE group_id IS NOT NULL
   AND group_joined_at IS NULL;

UPDATE public.participations
   SET group_joined_at = NULL
 WHERE group_id IS NULL
   AND group_joined_at IS NOT NULL;

ALTER TABLE public.participations
  ADD CONSTRAINT chk_participations_group_joined_at_iff_group
    CHECK ((group_id IS NULL) = (group_joined_at IS NULL));

COMMENT ON COLUMN public.participations.group_joined_at IS 'When this seat entered its CURRENT group, and NULL exactly when the seat holds no group — chk_participations_group_joined_at_iff_group holds the two together. Rows older than the column carry a value derived from their own signed_up_at, so "unknown" and "derived from signup" are not distinguishable on an old row. That cost is accepted because signup is a provable lower bound on the true join — a seat cannot enter a group of a product it does not hold — so a derived value can only ever understate how new a member is: the newcomer badge then shows less often, and the session register expects the member on more sessions, never fewer. A move between two groups of one product RESETS the stamp: the member is new to THAT group, which is the whole claim the newcomer badge makes, and it is also the floor the session register measures its expectations from. Stamped only by trg_participations_stamp_group_joined_at, which is the column''s only ongoing writer — no RPC and no policy-driven UPDATE sets it, because group_id has at least five writers (including the ON DELETE SET NULL cascade from product_groups) and a trigger is the only point that sees all of them.';

COMMENT ON TABLE public.participations IS 'One row per seat on a product: who holds it, who pays for it, which group they sit in and what state the seat is in. Some of its columns are settled by triggers rather than by any caller, and are therefore invisible at the call site: updated_at is touched on every write, a group_id naming a group of another product is rejected by trg_validate_participations_group, and group_joined_at is stamped by trg_participations_stamp_group_joined_at whenever group_id is set, changed or cleared — group_id has at least five writers, including the ON DELETE SET NULL cascade from product_groups, which is why the stamp lives in a trigger and not in an RPC. Do not set group_joined_at by hand: chk_participations_group_joined_at_iff_group refuses a stamp out of step with group_id.';

-- ---------------------------------------------------------------------------
-- 2. The functions
-- ---------------------------------------------------------------------------

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
               AND gs.session_date >= p.start_date
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
          -- Both sides of the comparison are always there: a seat in a group
          -- carries its join stamp (chk_participations_group_joined_at_iff_group),
          -- and an occurrence's end is a stored row's NOT NULL ends_at or, for
          -- a date only the plan projects, that same plan's end.
          CROSS JOIN LATERAL (
            SELECT COUNT(*)::integer AS expected_size
              FROM public.participations part4
             WHERE part4.group_id = g.id
               AND part4.status   = 'active'::public.participation_status
               AND part4.group_joined_at <= occurrence_end.ends_at
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
                  AND part2.group_joined_at <= occurrence_end.ends_at
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
             -- A row IS a creation: the table's CHECK refuses an empty array and
             -- the write RPC deletes the row instead of storing one, so "no row"
             -- is the only empty there is.
             OR (
               p.requires_gamer_creations
               AND occurrence.session_date = final_occurrence.session_date
               AND EXISTS (
                 SELECT 1
                   FROM public.participations part3
                  WHERE part3.group_id = g.id
                    AND part3.status   = 'active'::public.participation_status
                    -- The same join-date test (1) and the expected-size
                    -- lateral use, against the same per-occurrence end instant.
                    AND part3.group_joined_at <= occurrence_end.ends_at
                    AND NOT EXISTS (
                      SELECT 1
                        FROM public.gamer_group_creations c
                       WHERE c.group_id       = g.id
                         AND c.participant_id = part3.participant_id
                    )
               )
             )
           )
      ) AS owed ON true

     WHERE a.gedu_id = p_gedu_id
  ), '[]'::jsonb);
END;
$$;


CREATE OR REPLACE FUNCTION public.get_trainee_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id    uuid;
  v_timezone      text;
  v_today         date;
  v_product       jsonb;
  v_group         jsonb;
  v_site          jsonb;
  v_roster        jsonb;
  v_sessions      jsonb;
  v_gedus         jsonb;
  v_cancellations jsonb;
  v_trainees      jsonb;
  v_start_date    date;
  v_horizon       date;
BEGIN
  -- Guard-first, in the shape get_gedu_group_feed uses: an admin or a gedu
  -- past the first statement, everyone else refused on it.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. A gedu reads this only for a group they hold a
  -- trainee seat on — an assigned gedu reads the full document instead. An
  -- admin passes outright, so the trainee's view can be previewed.
  IF NOT public.is_admin()
     AND NOT public.gedu_trains_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id, p.timezone, p.start_date
    INTO v_product_id, v_timezone, v_start_date
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- The plan's span, which the holiday breaks share.
  v_horizon := public.session_plan_horizon(v_product_id, p_group_id);

  -- Ages are counted on the product's own calendar day.
  v_today := (now() AT TIME ZONE v_timezone)::date;

  -- The shell, the material link included: a trainee prepares from the same
  -- material the session is run from.
  SELECT jsonb_build_object(
    'id',                       p.id,
    'product_type',             p.product_type,
    'timezone',                 p.timezone,
    'start_date',               p.start_date,
    'end_date',                 p.end_date,
    'is_remote',                p.is_remote,
    'voice_room_mode',          p.voice_room_mode,
    'external_voice_url',       p.external_voice_url,
    'material_url',             psd.material_url,
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description,
               'voice_join_instructions', pt.voice_join_instructions
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
  LEFT JOIN public.product_staff_details psd ON psd.product_id = p.id
  WHERE p.id = v_product_id;

  -- The public note only. The staff note does not travel at all.
  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue on in-person products, without its staff note.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd ON sd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- The current roster, keyed by participant_id like the gedu document's.
  -- An age rather than a birth year and month, no contact address of any kind, and
  -- whether a staff note exists rather than what it says. `creations` is
  -- always empty: a gamer sees only their own.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'group_joined_at',    part.group_joined_at,
        'age', CASE WHEN gprof.birth_year IS NOT NULL THEN
                 EXTRACT(YEAR FROM age(v_today::timestamp,
                                       make_date(gprof.birth_year, gprof.birth_month, 1)::timestamp))::integer
               END,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- A note row exists only while it holds text (the table's CHECK).
        'has_note',           (gn.participant_id IS NOT NULL),
        'creations',          '[]'::jsonb
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
        LEFT JOIN public.gamer_group_notes gn
               ON gn.group_id       = part.group_id
              AND gn.participant_id = part.participant_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored session the group's families are shown, newest first: the
  -- family-facing report, its photos, when it was mailed and who last touched
  -- the row. No staff note, and an empty register — a gamer sees only their
  -- own mark. A record kept under a cancellation does not travel, as on the
  -- family document; the cancellation below does.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',                s.id,
        'session_date',      s.session_date,
        'starts_at',         s.starts_at,
        'ends_at',           s.ends_at,
        'report',            s.report,
        'report_emailed_at', s.report_emailed_at,
        'updated_by',        s.updated_by,
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
        'attendance', '{}'::jsonb
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
         AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
    ) AS session_rows;

  -- The group's assigned gedus, as the gedu document names them.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name,
        'role',       ga.role
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = p_group_id
    ) AS gedu_rows;

  -- The cancelled sessions in effect, in the staff documents' shape with the
  -- detail left null: that a session is off, never why. One on a holiday is
  -- not listed — that date carries its break alone.
  SELECT COALESCE(
           jsonb_agg(
             public.session_cancellation_document(sc, false)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = p_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
     AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date);

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('id', pr.id, 'first_name', pr.first_name)
             ORDER BY t.created_at, pr.id
           ),
           '[]'::jsonb
         )
    INTO v_trainees
    FROM public.gedu_group_trainees t
    JOIN public.profiles pr ON pr.id = t.gedu_id
   WHERE t.group_id = p_group_id;

  RETURN jsonb_build_object(
    'product',       v_product,
    'group',         v_group,
    'site',          v_site,
    'roster',        v_roster,
    'sessions',      v_sessions,
    'gedus',         v_gedus,
    -- A trainee is nobody's substitute and nobody's absence is theirs to know.
    'substitutions', '[]'::jsonb,
    'cancellations', v_cancellations,
    'trainees',      v_trainees,
    -- The plan and the final session, as the gedu document carries them: the
    -- schedule is no secret from anyone on the group, and nor are the holiday
    -- breaks over the same span.
    'planned_sessions', public.planned_sessions_document(v_product_id, v_horizon),
    'holiday_breaks',   public.holiday_breaks_document(v_product_id, v_start_date, v_horizon),
    'final_session_date', public.group_final_session_date(p_group_id)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_my_group_id uuid;
  v_timezone    text;
  v_today       date;
  v_product     jsonb;
  v_groups      jsonb;
BEGIN
  PERFORM public.assert_role('gedu');

  -- The caller's trainee group on this product. There is at most one (the
  -- table is UNIQUE on gedu and product), so a named group only has to agree
  -- with it.
  SELECT t.group_id
    INTO v_my_group_id
    FROM public.gedu_group_trainees t
   WHERE t.product_id = p_product_id
     AND t.gedu_id    = (SELECT auth.uid())
     AND (p_group_id IS NULL OR t.group_id = p_group_id);

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',                       p.id,
    'product_type',             p.product_type,
    'topic',                    p.topic,
    'timezone',                 p.timezone,
    'start_date',               p.start_date,
    'end_date',                 p.end_date,
    'is_remote',                p.is_remote,
    'voice_room_mode',          p.voice_room_mode,
    'external_voice_url',       p.external_voice_url,
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description,
               'voice_join_instructions', pt.voice_join_instructions
             ))
        FROM public.product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  ), p.timezone
  INTO v_product, v_timezone
  FROM public.products p
  WHERE p.id = p_product_id;

  v_today := (now() AT TIME ZONE v_timezone)::date;

  -- Every group of the product, ordered as get_gedu_assigned_product orders
  -- them. A sibling group is shown by name only, so the trainee can see it
  -- exists (its voice room, locked): its size, its staff and its members are
  -- nothing a gamer on this group is shown. The caller's own group carries the
  -- rest, and its roster is the trainee workspace document's, row for row.
  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT CASE WHEN pg.id <> v_my_group_id THEN
        jsonb_build_object(
          'id',          pg.id,
          'name',        pg.name,
          'created_at',  pg.created_at,
          'is_my_group', false
        )
      ELSE jsonb_build_object(
        'id',          pg.id,
        'name',        pg.name,
        'created_at',  pg.created_at,
        'is_my_group', true,
        'participant_count', (
          SELECT COUNT(*)::integer
            FROM public.participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'::public.participation_status
        ),
        'gedus', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',         gp.id,
                   'first_name', gp.first_name,
                   'role',       ga.role
                 ) ORDER BY gp.first_name)
            FROM public.gedu_group_assignments ga
            JOIN public.profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'participant_id',     part.participant_id,
                   'first_name',         gmp.first_name,
                   'signed_up_at',       part.signed_up_at,
                   'group_joined_at',    part.group_joined_at,
                   'age', CASE WHEN gprof.birth_year IS NOT NULL THEN
                            EXTRACT(YEAR FROM age(v_today::timestamp,
                                                  make_date(gprof.birth_year, gprof.birth_month, 1)::timestamp))::integer
                          END,
                   'gender',             gprof.gender,
                   'minecraft_username', mca.minecraft_username,
                   'minecraft_uuid',     mca.minecraft_uuid,
                   'roblox_username',    rba.roblox_username,
                   'roblox_user_id',     rba.roblox_user_id,
                   'has_note',           (gn.participant_id IS NOT NULL),
                   'creations',          '[]'::jsonb
                 ) ORDER BY gmp.first_name)
            FROM public.participations part
            JOIN public.profiles gmp                ON gmp.id        = part.participant_id
            LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
            LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
            LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = part.group_id
                  AND gn.participant_id = part.participant_id
           WHERE part.group_id = pg.id
             AND part.status   = 'active'::public.participation_status
        ), '[]'::jsonb)
      ) END AS g
        FROM public.product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups,
    -- As get_gedu_assigned_product carries them, for the trainee's own group.
    'planned_sessions', public.planned_sessions_document(
                          p_product_id, public.session_plan_horizon(p_product_id, v_my_group_id)
                        ),
    'final_session_date', public.group_final_session_date(v_my_group_id)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.can_read_product(p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.products pr WHERE pr.id = p_product_id);
$$;


CREATE OR REPLACE FUNCTION public.get_my_planned_sessions() RETURNS TABLE(participation_id uuid, session_date date, starts_at timestamp with time zone, ends_at timestamp with time zone, cancelled boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.id,
         planned.session_date,
         planned.starts_at,
         planned.ends_at,
         -- An unplaced seat has no group, so nothing is cancelled for it.
         COALESCE(p.group_id = ANY (planned.cancelled_group_ids), false) AS cancelled
    FROM public.participations p
    JOIN public.products pr ON pr.id = p.product_id
         -- The product-local today, and the product-local date the seat became
         -- the family's: the later of signing up and being placed, which is
         -- the moment the prep window counts its sessions from. GREATEST
         -- skips a NULL, so an unplaced seat's day is its signup's.
   CROSS JOIN LATERAL (
         SELECT (now() AT TIME ZONE pr.timezone)::date AS today,
                (GREATEST(p.signed_up_at, p.group_joined_at)
                   AT TIME ZONE pr.timezone)::date      AS seat_day
         ) AS local
         -- A cancelled membership's paid-through date: the product-local date
         -- of the `canceling` subscription's current_period_end, the instant
         -- the family's access ends. NULL on anything else.
    LEFT JOIN public.family_subscriptions fs
      ON fs.participation_id = p.id
     AND fs.status = 'canceling'
   CROSS JOIN LATERAL public.planned_group_sessions(
         pr.id,
         -- From the day before the earlier of today and the seat's day: the
         -- day before so a session still running past midnight is in, and back
         -- to the seat's day so the prep window's sessions are in however long
         -- ago the seat was taken.
         LEAST(local.today, local.seat_day) - 1,
         -- To the plan's horizon for this group, raised to the paid-through
         -- date so a winding-down membership's last covered session is in.
         public.session_plan_horizon(
           pr.id,
           p.group_id,
           (fs.current_period_end AT TIME ZONE pr.timezone)::date
         )
       ) AS planned
   WHERE p.status = 'active'::public.participation_status
     AND (
           p.customer_id    = (SELECT auth.uid())
        OR p.participant_id = (SELECT auth.uid())
         )
   ORDER BY p.id, planned.session_date, planned.starts_at;
$$;


CREATE OR REPLACE FUNCTION public.admin_move_participation(p_participation_id uuid, p_target_product_id uuid, p_stripe_price_id text, p_expected_source_product_id uuid, p_expected_stripe_price_id text, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_source_product_id uuid;
  v_status            public.participation_status;
  v_locked            integer;
  v_target_type       public.product_type;
  v_target_mode       public.billing_mode;
  v_live_sub          text;
  v_live_price        text;
  v_group_id          uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status
    INTO v_source_product_id, v_status
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'participation % does not exist', p_participation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Refused BEFORE the lock below, not after: the lock reads both products in
  -- one `IN` list, and a target equal to the source collapses that list to a
  -- single row — which would surface as "the target does not exist" and send an
  -- admin looking for a missing product instead of telling them the seat is
  -- already there.
  IF p_target_product_id = v_source_product_id THEN
    RAISE EXCEPTION 'participation % is already on product % — a move needs a different target (same product)',
      p_participation_id, p_target_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- BOTH product rows, locked in ONE statement ORDERED BY id. Two admins
  -- switching in opposite directions (a seat from A to B while another goes from
  -- B to A) take the same two locks; taking them in the order the ids sort in
  -- means both transactions queue on the same row first, so one waits rather
  -- than the pair deadlocking. The order is the whole point of the ORDER BY —
  -- it is not a presentation choice and must not be dropped.
  --
  -- The source is locked as well as the target because the seat leaves it: its
  -- seat counts and its group list are read by every other participation writer
  -- under this same lock.
  SELECT count(*)
    INTO v_locked
    FROM (
      SELECT id
        FROM public.products
       WHERE id IN (v_source_product_id, p_target_product_id)
       ORDER BY id
         FOR UPDATE
    ) locked;
  -- The source exists by foreign key, so a missing row can only be the target.
  IF v_locked < 2 THEN
    RAISE EXCEPTION 'target product % does not exist', p_target_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- THE SEAT, RE-READ UNDER THE LOCKS, against what the route's check saw. The
  -- read above happened before the locks were held, so this is the first look
  -- at the seat nothing can change underneath. A mismatch means the seat moved
  -- between the check and here — a second admin, or a stale dialog pressed
  -- after the seat has already been switched back — and the money has by then
  -- been moved by the caller, so refusing loudly is the only honest answer.
  SELECT product_id
    INTO v_source_product_id
    FROM public.participations
   WHERE id = p_participation_id;

  IF v_source_product_id IS DISTINCT FROM p_expected_source_product_id THEN
    RAISE EXCEPTION 'participation % is on product %, not the % the switch was checked against — the seat has moved',
      p_participation_id, v_source_product_id, p_expected_source_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'participation % is % and not active — only an active seat can be moved',
      p_participation_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- A LIVE subscription, in exactly the sense admin_remove_participation and
  -- demote_to_waitlist mean it: a family_subscriptions row whose status is
  -- anything but `cancelled`. The predicate is deliberately the same one, read
  -- from the opposite side — those two refuse BECAUSE a subscription is live,
  -- and this one refuses because none is. A seat with nothing to bill is not
  -- this function's business: an admin moves one with the panel's remove zone
  -- and a comp-enrolment on the other club, and there is no price to swap.
  SELECT stripe_subscription_id, stripe_price_id
    INTO v_live_sub, v_live_price
    FROM public.family_subscriptions
   WHERE participation_id = p_participation_id
     AND status <> 'cancelled';
  IF v_live_sub IS NULL THEN
    RAISE EXCEPTION 'participation % has no live subscription to move',
      p_participation_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- THE PRICE, against what the check read. `IS DISTINCT FROM` because the
  -- stored id is nullable and a null on either side is still a disagreement.
  -- What this catches is the case a Stripe idempotency key cannot: a replayed
  -- update answers the caller with the stored response of the FIRST request
  -- without touching the subscription, so a stale dialog can believe it moved
  -- a price that is no longer where it thought it was.
  IF v_live_price IS DISTINCT FROM p_expected_stripe_price_id THEN
    RAISE EXCEPTION 'subscription % is on price %, not the % the switch was checked against — the price has changed',
      v_live_sub, v_live_price, p_expected_stripe_price_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT product_type, billing_mode
    INTO v_target_type, v_target_mode
    FROM public.products
   WHERE id = p_target_product_id;

  -- Asked through the shared predicate rather than spelled out as a
  -- `product_type` comparison, so the panel's picker and this refusal cannot
  -- drift apart. The billing_mode half is stated as well as implied: the money
  -- condition is what this refusal is about, and a reader should not have to
  -- open the predicate to see it.
  IF v_target_mode <> 'paid'
     OR NOT public.is_subscription_shaped(v_target_type, v_target_mode) THEN
    RAISE EXCEPTION 'product % is not a paid subscription club — there is no subscription price to move to',
      p_target_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_group_id IS NOT NULL THEN
    -- THE ADMIN'S OWN PLACEMENT, and the one thing that has to be true about
    -- it. Read under the target's lock taken above, so the group list cannot
    -- change between this check and the write. A group of the SOURCE is the
    -- mistake this refuses in practice — the dialog is opened from the source
    -- club's panel. trg_validate_participations_group would refuse the write
    -- below as well (check_violation for another product's group,
    -- foreign_key_violation for one that does not exist); this check comes
    -- first so both cases are refused with the one message the switch route
    -- recognises, which matters because by then the route has already moved
    -- the Stripe subscription.
    PERFORM 1
       FROM public.product_groups
      WHERE id = p_group_id
        AND product_id = p_target_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'group % is not a group of the target product % — a switched seat can only land in a group of the club it moves to',
        p_group_id, p_target_product_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_group_id := p_group_id;
  ELSE
    -- THE SHARED PLACEMENT RULE, applied to the TARGET, and still the
    -- answer whenever the admin names no group. A no-charge product with
    -- exactly one group has no placement decision left in it; anything else
    -- lands in the unassigned inbox. A paid target — which the refusal above
    -- has just guaranteed — therefore always resolves to NULL, and the rule is
    -- written out anyway rather than short-circuited to NULL, so placement
    -- stays ONE rule with one home instead of two that agree today. LIMIT 2
    -- because the question is "exactly one?", not "how many?".
    IF public.is_no_charge(v_target_mode) THEN
      SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
        INTO v_group_id
        FROM (
          SELECT id FROM public.product_groups
           WHERE product_id = p_target_product_id
           LIMIT 2
        ) g;
    END IF;
  END IF;

  -- The whole write. The two purchase markers are untouched on purpose: the
  -- family bought this seat when they bought it, and the payment marker travels
  -- with the row. The join instant is absent for the reason it is absent from
  -- every other writer — the BEFORE UPDATE trigger stamps it from group_id, and
  -- the table comment forbids writing it by hand.
  --
  -- Nothing group-scoped travels either: attendance marks, creations and feed
  -- history belong to the old group and stay there, exactly as after an admin
  -- demote-and-promote.
  --
  -- If the participant already holds a row on the target in any status the
  -- partial unique index covers — active, waitlisted or completed — this raises
  -- 23505, which is the answer: the collision is deliberately not pre-checked
  -- here, and the commit route pre-flights it with a plain read before it
  -- touches Stripe.
  UPDATE public.participations
     SET product_id = p_target_product_id,
         group_id   = v_group_id
   WHERE id = p_participation_id;

  -- The subscription row's price id, and NOTHING else on that row — its
  -- currency and its Stripe customer are properties of the subscription, which
  -- has not moved and cannot move.
  UPDATE public.family_subscriptions
     SET stripe_price_id = p_stripe_price_id
   WHERE participation_id = p_participation_id;

  RETURN jsonb_build_object(
    'participation_id',       p_participation_id,
    'source_product_id',      v_source_product_id,
    'target_product_id',      p_target_product_id,
    'group_id',               v_group_id,
    'stripe_subscription_id', v_live_sub
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.trg_refresh_product_seat_counts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_product_seat_counts(OLD.product_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_product_seat_counts(NEW.product_id);

  -- An UPDATE that moved a row to a different product needs the old product
  -- recomputed too, or the seat it left keeps counting there:
  -- admin_move_participation moves a seat between two clubs this way.
  IF TG_OP = 'UPDATE' AND OLD.product_id <> NEW.product_id THEN
    PERFORM public.refresh_product_seat_counts(OLD.product_id);
  END IF;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_admin_municipality_invoicing(p_month_start date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_month_end date;
  v_clubs     jsonb;
  v_orphans   text;
BEGIN
  PERFORM public.assert_admin();

  -- The month is named by its first day and nothing else. A mid-month argument
  -- is a caller that has not decided what it is asking for — the window would
  -- be a month-long span that matches no calendar month, and every total drawn
  -- from it would be wrong in a way nobody could see. Refused loudly, after the
  -- guard, so an unauthorized caller learns nothing about the argument shape.
  IF p_month_start IS NULL
     OR p_month_start <> date_trunc('month', p_month_start::timestamp)::date THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing: p_month_start must be the first day of a month (got %)',
      p_month_start
      USING ERRCODE = 'check_violation';
  END IF;

  v_month_end := (p_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH RECURSIVE candidate AS (
    SELECT p.*
      FROM public.products p
     WHERE p.product_type = 'municipality_club'
       AND (
             EXISTS (
               SELECT 1
                 FROM public.product_groups g
                 JOIN public.group_sessions gs ON gs.group_id = g.id
                WHERE g.product_id = p.id
                  AND gs.session_date >= p_month_start
                  AND gs.session_date <= v_month_end
                  -- Cancellation: the same exclusion as `sessions` below.
                  AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
             )
          OR (
               p.start_date <= v_month_end
               AND p.end_date >= p_month_start
             )
           )
  ),
  -- The ancestor-or-self walk, one chain per candidate's own location. It
  -- stops climbing the moment it has emitted a municipality, so the shortest
  -- chain wins by construction; `depth` is kept so the DISTINCT ON below picks
  -- the nearest one even if a tree ever nests two municipalities.
  walk AS (
    SELECT l.id AS origin_id,
           l.id,
           l.parent_id,
           l.type,
           l.name,
           l.name_i18n,
           0 AS depth
      FROM public.locations l
     WHERE l.id IN (SELECT c.location_id FROM candidate c)
     UNION ALL
    SELECT w.origin_id,
           l.id,
           l.parent_id,
           l.type,
           l.name,
           l.name_i18n,
           w.depth + 1
      FROM walk w
      JOIN public.locations l ON l.id = w.parent_id
     -- Two stops, and each earns its place: the first is the answer, the second
     -- is a belt-and-braces bound on a tree the schema does not forbid a cycle
     -- in beyond a row parenting itself.
     WHERE w.type <> 'municipality'
       AND w.depth < 16
  ),
  municipality AS (
    SELECT DISTINCT ON (w.origin_id)
           w.origin_id,
           w.id,
           w.name,
           w.name_i18n
      FROM walk w
     WHERE w.type = 'municipality'
     ORDER BY w.origin_id, w.depth
  )
  SELECT COALESCE(jsonb_agg(club.doc ORDER BY club.id), '[]'::jsonb)
    INTO v_clubs
    FROM (
      SELECT c.id,
             jsonb_build_object(
               'id',                     c.id,
               'timezone',               c.timezone,
               'start_date',             c.start_date,
               'end_date',               c.end_date,
               'municipality_fee_cents', c.municipality_fee_cents,
               'product_translations',   tr.items,
               'schedule_slots',         sl.items,
               'planned_dates',          pd.items,
               'holiday_breaks',         hb.items,
               'location',
                 jsonb_build_object(
                   'id',        l.id,
                   'name',      l.name,
                   'name_i18n', l.name_i18n,
                   'type',      l.type
                 ),
               'municipality',
                 CASE WHEN m.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',        m.id,
                             'name',      m.name,
                             'name_i18n', m.name_i18n
                           )
                 END,
               -- The buyer of this club, whole rather than by id: the caller
               -- turns it into a Finvoice file, so a second admin-gated round
               -- trip per club would buy nothing. Null where nobody has said
               -- who pays yet — flagged by the page, refused by the export.
               'invoice_customer',
                 CASE WHEN ic.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',                 ic.id,
                             'fennoa_customer_no', ic.fennoa_customer_no,
                             'invoice_name',       ic.invoice_name,
                             'street',             ic.street,
                             'postal_code',        ic.postal_code,
                             'city',               ic.city,
                             'country_code',       ic.country_code,
                             'your_reference',     ic.your_reference,
                             'invoice_text',       ic.invoice_text,
                             'billing_cadence',    ic.billing_cadence
                           )
                 END,
               'sessions',               se.items,
               'cancelled_sessions',     cx.items,
               'group_ids',              gr.items
             ) AS doc
        FROM candidate c
        -- Every municipality club has a location, in person and online alike
        -- (chk_products_in_person_has_location, chk_products_online_muni_has_location),
        -- and its foreign key is ON DELETE RESTRICT.
        JOIN public.locations l ON l.id = c.location_id
        LEFT JOIN municipality m ON m.origin_id = c.location_id
        -- The link is the club's own column and never the location's: one city
        -- can be two customers, and an association can buy clubs sited in a
        -- municipality it is not.
        LEFT JOIN public.invoice_customers ic ON ic.id = c.invoice_customer_id
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'weekday',          ss.weekday,
                              'start_time',       to_char(ss.start_time, 'HH24:MI'),
                              'duration_minutes', ss.duration_minutes
                            )
                            ORDER BY ss.weekday, ss.start_time
                          )
                     FROM public.schedule_slots ss
                    WHERE ss.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) sl
        -- The plan: every date planned_session_dates puts inside the month,
        -- clipped to the club's term by that function — one per date, since a
        -- product has at most one slot per weekday. These are the dates the
        -- club was due to meet; the page sets them beside the stored rows and
        -- the cancellations.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(psd.session_date ORDER BY psd.session_date)
                     FROM public.planned_session_dates(c.id, p_month_start, v_month_end) psd
                 ), '[]'::jsonb) AS items
        ) pd
        -- The holiday breaks touching the month, each with the planned dates
        -- it withdrew inside it: the page shows those as holiday lines at no
        -- charge, and the file leaves them out.
        CROSS JOIN LATERAL (
          SELECT public.holiday_breaks_document(c.id, p_month_start, v_month_end) AS items
        ) hb
        -- Raw rows, one per (group, date). The page collapses two groups on one
        -- date into the single session the club is paid for, and can still say
        -- which groups met — an aggregate here would have thrown that away.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'group_id',     gs.group_id,
                              'session_date', gs.session_date
                            )
                            ORDER BY gs.session_date, gs.group_id
                          )
                     FROM public.group_sessions gs
                     JOIN public.product_groups g ON g.id = gs.group_id
                    WHERE g.product_id = c.id
                      AND gs.session_date >= p_month_start
                      AND gs.session_date <= v_month_end
                      -- Cancellation: a row kept under a cancellation is not a
                      -- session that ran, so it never reaches the bill. Left
                      -- out here rather than trusted to the page, so no reader
                      -- of this document can count one.
                      AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
                 ), '[]'::jsonb) AS items
        ) se
        -- Cancellation: the month's cancelled (group, date) pairs in effect,
        -- in the same shape as `sessions`, so the page can show a cancelled
        -- date as Cancelled rather than as unrecorded and never bill it. The
        -- same predicate `sessions` excludes by, so a pair here never also
        -- appears there, and an inert cancellation appears in neither. One on
        -- a holiday is not listed: that date is the break's holiday line and
        -- nothing else.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'group_id',     sc.group_id,
                              'session_date', sc.session_date
                            )
                            ORDER BY sc.session_date, sc.group_id
                          )
                     FROM public.session_cancellations sc
                     JOIN public.product_groups g ON g.id = sc.group_id
                    WHERE g.product_id = c.id
                      AND sc.session_date >= p_month_start
                      AND sc.session_date <= v_month_end
                      AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
                      AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date)
                 ), '[]'::jsonb) AS items
        ) cx
        -- Every group the club has, whether or not the month says anything
        -- about it. A date is cancelled for the club only when every one of its
        -- groups cancelled it, and a group that neither met nor cancelled is
        -- exactly the one neither list above can name — without this a
        -- sibling's cancellation would hide its missed session. Every row, with
        -- no filter: a group has no archived state and no start date, so any
        -- group the product holds is one its schedule is due to meet.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(g.id ORDER BY g.id)
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) gr
    ) club;

  -- Every club on the invoice belongs to a municipality, or there is no invoice.
  -- A municipality club whose chain reaches no municipality cannot be billed to
  -- anybody, and the reader of this document has no way to tell such a club from
  -- one whose location was mistyped an hour ago — so the read stops and names the
  -- products, which is the whole of the repair instruction. Checked against the
  -- document that was built rather than against a second walk of the tree,
  -- because what matters is what would have been emitted.
  --
  -- A missing invoice CUSTOMER is deliberately NOT refused here, and the
  -- difference is real: a club with no municipality has nobody to bill and
  -- cannot be rendered on a page that is organised by municipality, while a club
  -- with no customer renders perfectly well and simply cannot have a file
  -- produced for it yet. Refusing the month would take every other file down
  -- with it.
  SELECT string_agg(club.value ->> 'id', ', ' ORDER BY club.value ->> 'id')
    INTO v_orphans
    FROM jsonb_array_elements(v_clubs) AS club(value)
   WHERE jsonb_typeof(club.value -> 'municipality') = 'null';

  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing: no municipality is an ancestor-or-self of the location of municipality club(s) % — repoint the location so the club can be invoiced',
      v_orphans
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'month_start', to_char(p_month_start, 'YYYY-MM-DD'),
    'clubs',       v_clubs
  );
END;
$$;

COMMENT ON FUNCTION public.can_read_product(p_product_id uuid) IS 'Read predicate behind the products SELECT policy and the seven satellite tables that defer to it: translations, prices, schedule slots, marketing consents, gamer photo consents, required consents, holiday calendars. True for ANY product that exists; false only for an id no product has. Every product is readable by direct link forever, by owner decision (2026-09-15): a parent following a link to a term that ended should land on the product''s page and read that it is over, with the product''s own picture in the link preview, rather than meet a not-found page and the site''s default card — and the crawler that renders that preview holds no session either. is_visible governs LISTING alone — the browse queries apply it, alongside their own date filters — so a finished or unlisted product is absent from the shop and present at its URL. Whether a place can be BOUGHT is decided somewhere else entirely: the term dates, the seat cap and the registration window. The former arms — an admin, a party to an active or waitlisted participation, an assigned gedu, and the term test that used to bound the public one — are removed rather than left dormant: with the public answer true for every product none of them could decide anything, and a security predicate whose branches cannot decide is one the next reader has to reason about for nothing. It remains a function rather than a USING (true) written into each policy, so those eight policies keep ONE predicate to tighten if the decision is ever revisited, and it remains SECURITY DEFINER because it runs inside the products SELECT policy and must not depend on the caller''s own RLS.';

-- ---------------------------------------------------------------------------
-- 3. End state
-- ---------------------------------------------------------------------------

-- The constraint is in force, and none of the removed guards is back in the
-- body it was removed from. Matched as text, because a guard restored is a
-- body that spells it again.
DO $$
DECLARE
  v_guard record;
  v_found text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.participations'::regclass
       AND conname = 'chk_participations_group_joined_at_iff_group'
       AND contype = 'c'
       AND convalidated
  ) THEN
    RAISE EXCEPTION 'participations must carry a validated chk_participations_group_joined_at_iff_group';
  END IF;

  FOR v_guard IN
    SELECT *
      FROM (VALUES
        ('gedu_assignment_summaries',        'group_joined_at IS NULL'),
        ('gedu_assignment_summaries',        'ends_at IS NULL'),
        ('gedu_assignment_summaries',        'start_date IS NULL'),
        ('gedu_assignment_summaries',        'jsonb_array_length'),
        ('get_trainee_group_feed',           'COALESCE(v_timezone'),
        ('get_trainee_assigned_product',     'COALESCE(v_timezone'),
        ('can_read_product',                 'COALESCE'),
        ('get_my_planned_sessions',          'COALESCE(p.group_joined_at'),
        ('get_admin_municipality_invoicing', 'start_date IS NOT NULL'),
        ('get_admin_municipality_invoicing', 'end_date IS NULL'),
        ('get_admin_municipality_invoicing', 'location_id IS NOT NULL'),
        ('get_admin_municipality_invoicing', 'l.id IS NULL'),
        ('get_admin_municipality_invoicing', 'LEFT JOIN public.locations'),
        ('trg_refresh_product_seat_counts',  'theoretical')
      ) AS g(fn, text)
  LOOP
    SELECT p.proname INTO v_found
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = v_guard.fn
       AND p.prosrc LIKE '%' || v_guard.text || '%';

    IF v_found IS NOT NULL THEN
      RAISE EXCEPTION '% still carries "%"', v_guard.fn, v_guard.text;
    END IF;
  END LOOP;

  IF obj_description('public.can_read_product(uuid)'::regprocedure, 'pg_proc') LIKE '%COALESCE%' THEN
    RAISE EXCEPTION 'can_read_product''s comment still describes a COALESCE';
  END IF;
END;
$$;
