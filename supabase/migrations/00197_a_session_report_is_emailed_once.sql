-- Emailing a session report to the families is a recorded, at-most-once act.
--
-- WHY
--
-- A gedu writes a report after every session and a family can read it on their
-- child's product page — but nothing tells them it is there, so the write-up
-- that is the main thing a family gets back from us between payments goes
-- unread. The mail itself already exists; what is missing is the wiring: a way
-- to send it, a record that it was sent, and the rule that a session is not
-- finished until it has been.
--
-- WHAT THIS ADDS
--
--   * Two columns on `group_sessions` — `report_emailed_at` and
--     `report_emailed_by` — the at-most-once marker and its audit partner.
--   * `claim_group_session_report_email(group, date)`, which CLAIMS the send
--     before a single mail is composed, and refuses a session with no report or
--     one already claimed.
--   * `get_gedu_group_feed` carries `report_emailed_at` per session, so the
--     card renders the sent state without a second read.
--   * `get_my_gedu_assignment_summaries` counts a finished session as
--     outstanding until the send has happened, beside the register and the
--     report.
--
-- WHY A CLAIM RATHER THAN A STAMP AFTERWARDS
--
-- Marking the session only once the sends succeed reads simpler and is wrong:
-- two clicks in flight both see "not sent", both fan out, and the only thing
-- standing between a family and two identical mails is a disabled button in one
-- browser tab. So the claim is the FIRST write. It takes the row's lock, tests
-- the marker under it and stamps it, so exactly one of two concurrent callers
-- comes back with a row and the other is told the report has already gone.
-- Partial failure therefore KEEPS the claim — the families who received the
-- mail must not receive it twice — and only a fan-out where every single send
-- failed releases it, which the route does with the service role, guarded on
-- the timestamp it claimed.
--
-- The claim is also the AUTHORIZATION. Succeeding proves the caller is a gedu
-- assigned to the group, which is why the route may then resolve parents'
-- addresses with the admin client: nothing about who to mail is decided by the
-- request.
--
-- THE TWO REFUSAL CODES, AND WHY THEY ARE CODES
--
--   * `P0021` — no report. The session row is missing, or its report is empty
--     after the same whitespace trim `get_my_gedu_assignment_summaries` applies.
--     "No report" has been a TRIMMED test since 00150, never a NULL test: a
--     whitespace-only report once counted as one, and this body must not
--     reintroduce that.
--   * `P0022` — already sent.
--
-- Distinct SQLSTATEs rather than distinct messages, because the route turns
-- each into its own answer and a message is not a contract. `set_group_session_
-- notes` raising `check_violation` for an unscheduled date is the precedent;
-- these two need codes of their own because `check_violation` cannot say which
-- of two things went wrong. They are mirrored in the feature's contracts file as
-- exported constants, so the route matches on a named value rather than a
-- literal.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--
--   * `report_emailed_by` stays off both feeds. It is an audit column; nothing
--     renders it, and the family document must never learn it exists.
--   * No signature, guard, posture or grant of the two recreated readers moves.
--     CREATE OR REPLACE keeps the ACL and the COMMENT, and both are re-issued
--     anyway — a recreated function can come back PUBLIC-executable regardless
--     of 00099's default-privilege entry (observed on staging during 00172), so
--     the REVOKEs below are load-bearing rather than historical.
--   * The bodies recreated below are the LIVE ones from `supabase/schema.sql`,
--     which is what 00194 (the last editor's name) and 00195 (the Roblox pair)
--     left behind. Copying from the migration that first defined either would
--     silently revert both.

-- ---------------------------------------------------------------------------
-- 1. The columns.
-- ---------------------------------------------------------------------------

ALTER TABLE public.group_sessions
  ADD COLUMN report_emailed_at timestamptz,
  ADD COLUMN report_emailed_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.group_sessions.report_emailed_at IS
  'When this session''s report was emailed to the group''s families, and NULL '
  'until it has been — the AT-MOST-ONCE MARKER for that mail. Set by '
  'claim_group_session_report_email before any mail is composed, which is what '
  'makes two concurrent sends impossible; cleared again only by the route, and '
  'only when EVERY send failed and therefore no family received anything. A '
  'partial failure keeps it set on purpose. Never cleared by an edit to the '
  'report: there is no resend, and a gedu fixing a typo afterwards does not get '
  'to mail the families a second version.';

COMMENT ON COLUMN public.group_sessions.report_emailed_by IS
  'The gedu whose click sent the report, stamped alongside report_emailed_at. '
  'Audit only — it is on neither feed and nothing renders it; the card''s author '
  'chip reads updated_by. ON DELETE SET NULL, so a departed gedu leaves the '
  'send recorded without the name.';

-- ---------------------------------------------------------------------------
-- 2. The claim.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_group_session_report_email(
  p_group_id uuid,
  p_session_date date
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.group_sessions;
BEGIN
  -- The same two-part gate every write on this surface opens with: the role
  -- first, then the assignment. Guard-first is what the authorization spine
  -- reads, and the assignment half is what makes a NULL group a refusal rather
  -- than a lookup.
  PERFORM public.assert_role('gedu');

  IF NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE is the whole of the concurrency argument. Two gedus (or one
  -- gedu with two tabs) serialize here; the second reads the marker the first
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
  'Claim the one send of a session report to the group''s families, and hand '
  'back the row it claimed. Gedu-gated on the group assignment, exactly as the '
  'session-notes writer is. Takes the row''s lock, then refuses with SQLSTATE '
  'P0021 when there is no report to send (no row, or a report that is empty '
  'after the same whitespace trim the summaries SQL applies) and with P0022 '
  'when report_emailed_at is already set; otherwise stamps report_emailed_at = '
  'now() and report_emailed_by = auth.uid(). The claim is the FIRST write of '
  'the send and is also its authorization: succeeding proves the caller teaches '
  'the group, which is what lets the route resolve recipients with the service '
  'role afterwards. Releasing a claim is the route''s job and happens only when '
  'every single mail failed.';

-- ---------------------------------------------------------------------------
-- 3. The gedu feed carries the marker.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_gedu_group_feed(p_group_id uuid) RETURNS jsonb
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
    -- Gedu-only, and stored somewhere only this function and an admin can
    -- reach. This document is never served to a parent or a gamer.
    'material_url', psd.material_url,
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
  LEFT JOIN public.product_staff_details psd ON psd.product_id = p.id
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
  -- so the client can tell someone who joined last week from one who has been
  -- here all term.
  --
  -- The identity key is `participant_id` as of 00175. Every row on this roster
  -- is whoever holds the seat, and since 00173 that can be an adult — the
  -- date_of_birth / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel (00195), and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so on a CHILD row this is non-null in practice and the wire
        -- contract said so until 00173. An ADULT row has no parent link at all,
        -- so it is NULL there and the contract now allows it — the address for
        -- that row is the one below.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.participant_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        ),
        -- The adult's own address, and NULL on every child row. Deliberately
        -- not "the participant's email whoever they are": a gamer's profile
        -- email is the synthetic @gamer.sogverse.internal handle, which is not
        -- a mailbox and must never reach a copy-email affordance. The role
        -- check (00177) is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
  --
  -- Two reserved booleans were emitted here until 00151, purely so the document
  -- mirrored the table. 00151 dropped the columns; nothing replaces them. Their
  -- names are deliberately not repeated in this body — the end-state assertion
  -- at the foot of that migration greps this source for them.
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
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- When this session's report was mailed to the group's families, and
        -- NULL until it has been (00197). The card renders the sent line from
        -- it and decides whether to offer the button, so it has to travel with
        -- the session rather than be read separately.
        --
        -- Its partner column `report_emailed_by` deliberately stays OFF the
        -- wire: it is an audit trail for staff, nothing renders it, and the
        -- card's author chip is `updated_by_first_name` above.
        'report_emailed_at', s.report_emailed_at,
        -- The last editor's first name, for the author chip on the card.
        --
        -- 00194's field, carried through verbatim — see this migration's
        -- header. Nothing here reads it; it is the current definition of this
        -- function on the database this file is pushed to, and recreating a
        -- function preserves what it is not deliberately changing.
        --
        -- LEFT-JOIN-shaped on purpose: NULL when nothing has stamped the row
        -- yet, and NULL again if the profile has gone. The FK is ON DELETE SET
        -- NULL, so the second case cannot arise from a deleted profile — it is
        -- written this way so the shape survives any future relaxation rather
        -- than because it is reachable today.
        --
        -- This is the LAST TOUCHER of the whole session, not the report's
        -- author: an attendance correction or a staff-note edit moves it.
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        -- Sparse map keyed by participant id. A roster member absent from this
        -- object is UNMARKED, which is a different claim from 'absent'.
        'attendance', COALESCE((
          SELECT jsonb_object_agg(a.participant_id, a.status)
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

REVOKE EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO service_role;

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS
  'One round trip for a gedu group workspace: product shell (with the gedu-only '
  'material link, read from product_staff_details), group notes, site notes on '
  'in-person products, the current roster, and every stored session row with its '
  'sparse attendance map. Contains no schedule expansion — the client owns the '
  'calendar math. Each roster row is keyed by participant_id (00175 — whoever '
  'holds the seat, child or adult), carries both game identities since 00195 '
  '(minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, '
  'independent of each other and drawn according to the product''s topic, which '
  'this document does not carry), and carries two contact fields and never both: '
  'parent_email for a child (their linked parent), participant_email for an '
  'adult seat (their own address, NULL on child rows because a gamer profile''s '
  'email is a synthetic non-mailbox). Each session row carries report_emailed_at '
  'since 00197 — when its report was mailed to the families, NULL until it was — '
  'and never report_emailed_by, which is audit and renders nowhere.';

-- ---------------------------------------------------------------------------
-- 4. The dashboard badge counts the send too.
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
         WHERE roster.roster_size > 0
           -- "Needs attention" is THREE questions joined by OR, and any one
           -- alone keeps the session on the list.
           --
           -- This derivation has a TWIN IN TYPESCRIPT — the gedu feed's
           -- entry-state module, which decides the same thing for the card
           -- from the feed document — and the two must agree, or the dashboard
           -- badge counts a session the card calls finished. Changing either
           -- half means changing both, in the same commit.
           AND (
             -- (1) Some of the CURRENT roster has no answer yet. Measured
             -- against the current roster, never against the stored map's keys
             -- — which is why someone joining a long-running group reopens
             -- previously-complete sessions. That is the honest reading and it
             -- is chosen with eyes open.
             (
               SELECT COUNT(*)
                 FROM public.session_attendance att
                 JOIN public.group_sessions gs2 ON gs2.id = att.session_id
                 JOIN public.participations part2
                   ON part2.participant_id = att.participant_id
                  AND part2.group_id = g.id
                  AND part2.status   = 'active'::public.participation_status
                WHERE gs2.group_id     = g.id
                  AND gs2.session_date = occurrence.session_date
             ) < roster.roster_size
             -- (2) Nothing has been written for the families. NOT EXISTS rather
             -- than a LEFT JOIN's NULL test, so a date with no materialized row
             -- at all — the common case for a session nobody has touched — is
             -- the same answer as a row holding a blank report.
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
           )
      ) AS owed ON true

     WHERE a.gedu_id = v_uid
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO service_role;

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS
  'One row per gedu assignment for the dashboard cards: group name, that '
  'group''s participant count (renamed from group_gamer_count in 00175 — an '
  'active seat may be held by an adult since 00173), the venue name on '
  'in-person products, and how many past sessions still owe a register, a '
  'family-facing report, or the mail that tells the families it is there. A '
  'finished session on or after the epoch counts until ALL THREE are in (the '
  'third since 00197). The enforcement epoch travels in as an argument because '
  'it is a code constant, not a column. This count has a twin in TypeScript — '
  'the gedu feed''s entry-state derivation, which answers the same question for '
  'one card — and the two must be changed together.';

-- ---------------------------------------------------------------------------
-- 5. End state, asserted where it runs.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_ok    boolean;
  v_claim text;
  v_feed  text;
  v_sum   text;
BEGIN
  -- --- (a) The two columns, and the FK's delete behaviour. -----------------
  SELECT count(*) = 2 INTO v_ok
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'group_sessions'
     AND column_name IN ('report_emailed_at', 'report_emailed_by')
     AND is_nullable  = 'YES';
  IF NOT v_ok THEN
    RAISE EXCEPTION 'group_sessions is missing one of the two nullable report-email columns';
  END IF;

  -- ON DELETE SET NULL rather than CASCADE or RESTRICT: a departed gedu must
  -- leave the send recorded, never delete the session it belongs to and never
  -- pin the profile row in place.
  SELECT EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'public.group_sessions'::regclass
       AND c.contype  = 'f'
       AND c.confdeltype = 'n'
       AND c.conkey = ARRAY[(
             SELECT a.attnum FROM pg_attribute a
              WHERE a.attrelid = 'public.group_sessions'::regclass
                AND a.attname  = 'report_emailed_by'
           )]::smallint[]
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'report_emailed_by has no ON DELETE SET NULL foreign key to profiles';
  END IF;

  -- --- (b) The claim's posture. --------------------------------------------
  SELECT p.prosrc INTO v_claim
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'claim_group_session_report_email';
  IF v_claim IS NULL THEN
    RAISE EXCEPTION 'claim_group_session_report_email does not exist';
  END IF;

  SELECT p.prosecdef
     AND NOT p.proisstrict
     AND p.proconfig @> ARRAY['search_path=""']
    INTO v_ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'claim_group_session_report_email';
  IF NOT v_ok THEN
    -- STRICT matters as much as the other two: a STRICT function skips its
    -- body on NULL input, so its guard would never run and the spine's
    -- all-NULL matrix would pass against nothing at all.
    RAISE EXCEPTION 'claim_group_session_report_email is not SECURITY DEFINER + non-STRICT + search_path-pinned';
  END IF;

  -- Guard first, and both refusal codes actually raised. Quoted with their
  -- delimiters so this body's own prose cannot satisfy the test.
  IF position('assert_role(''gedu'')' IN v_claim) = 0 THEN
    RAISE EXCEPTION 'claim_group_session_report_email does not assert the gedu role';
  END IF;

  IF position('gedu_teaches_group' IN v_claim) = 0 THEN
    RAISE EXCEPTION 'claim_group_session_report_email does not check the group assignment';
  END IF;

  IF position('''P0021''' IN v_claim) = 0 OR position('''P0022''' IN v_claim) = 0 THEN
    RAISE EXCEPTION 'claim_group_session_report_email does not raise both refusal codes';
  END IF;

  -- The trimmed emptiness test, not a bare NULL test. 00150 exists because a
  -- whitespace-only report once counted as a report; this is the pin that
  -- stops the claim reintroducing it.
  IF position('btrim(COALESCE(v_row.report' IN v_claim) = 0 THEN
    RAISE EXCEPTION 'claim_group_session_report_email does not trim the report before calling it empty';
  END IF;

  IF has_function_privilege('anon', 'public.claim_group_session_report_email(uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'claim_group_session_report_email is reachable by anon — the REVOKE FROM PUBLIC did not take';
  END IF;

  IF NOT has_function_privilege(
    'authenticated', 'public.claim_group_session_report_email(uuid, date)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'claim_group_session_report_email is not executable by authenticated';
  END IF;

  IF NOT has_function_privilege(
    'service_role', 'public.claim_group_session_report_email(uuid, date)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'claim_group_session_report_email is not executable by service_role';
  END IF;

  -- --- (c) The feed emits the marker, and only the marker. -----------------
  SELECT p.prosrc INTO v_feed
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_gedu_group_feed';

  IF position('''report_emailed_at''' IN v_feed) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed does not emit report_emailed_at';
  END IF;

  -- The audit column stays off the wire. Quoted with its delimiters, so the
  -- word appearing in this function's comments cannot satisfy the check.
  IF position('''report_emailed_by''' IN v_feed) > 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed now emits report_emailed_by, which is audit-only';
  END IF;

  IF has_function_privilege('anon', 'public.get_gedu_group_feed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_gedu_group_feed came back reachable by anon';
  END IF;

  IF NOT has_function_privilege(
    'authenticated', 'public.get_gedu_group_feed(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_gedu_group_feed lost its authenticated EXECUTE grant';
  END IF;

  -- --- (d) The badge asks the third question. ------------------------------
  SELECT p.prosrc INTO v_sum
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_my_gedu_assignment_summaries';

  IF position('report_emailed_at IS NOT NULL' IN v_sum) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries does not test report_emailed_at';
  END IF;

  -- The other two halves survived the recreation. A rewrite that dropped
  -- either would still pass the check above while quietly declaring every
  -- unmarked or unwritten session finished.
  IF position('btrim(COALESCE(gs3.report' IN v_sum) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost the report half of its count';
  END IF;

  IF position('session_attendance' IN v_sum) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost the register half of its count';
  END IF;

  IF has_function_privilege('anon', 'public.get_my_gedu_assignment_summaries(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries came back reachable by anon';
  END IF;

  IF NOT has_function_privilege(
    'authenticated', 'public.get_my_gedu_assignment_summaries(date)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost its authenticated EXECUTE grant';
  END IF;
END
$assert$;
