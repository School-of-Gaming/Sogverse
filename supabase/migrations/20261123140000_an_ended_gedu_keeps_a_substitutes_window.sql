-- An ended gedu keeps a substitute's window.
--
-- Owner's ruling (2026-11-23): when a gedu's period on a group ends, their card
-- and the group's workspace stay open exactly as a substitute's would. Per
-- session they were EXPECTED at inside the ended period — not cancelled, not one
-- they filed an absence for — the group stays theirs until that session's
-- substitute window closes (group_session_access_ends_at: 24 hours after its
-- report was mailed, else 15 product-local days after the date), and the card
-- stands while ANY such session's window is open. Then it leaves My SOG. The
-- voice room and the chat roster stay current-only, and a gedu still current on
-- the group gets nothing extra.
--
-- Second ruling, the same day: a gedu owes only the sessions they were expected
-- at. The summaries' owed count was every session of the group since the epoch,
-- less the dates the gedu filed against; it is now the sessions the gedu was
-- expected at (gedu_is_expected_at_session), so a gedu added mid-run, a
-- substitute and an ended gedu each owe their own sessions and no others.
--
-- The rule-6 readers below — the three seat reads and the report claim — also
-- gain the "current" filter they had been left without until this arm existed:
-- an ended period never reaches them except through it.

-- ---------------------------------------------------------------------------
-- gedu_holds_unexpired_ended_assignment
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           -- They held the group at that session…
           EXISTS (
             SELECT 1
               FROM public.group_assignments_at(
                      p_group_id,
                      public.group_session_starts_at(p_group_id, p_session_date)
                    ) a
              WHERE a.gedu_id = p_gedu_id
           )
           -- …and hold it no longer: with no current period on the group, the
           -- period that held the session is an ended one.
           AND NOT EXISTS (
             SELECT 1
               FROM public.gedu_group_assignments ga
              WHERE ga.group_id = p_group_id
                AND ga.gedu_id  = p_gedu_id
                AND ga.ended_at IS NULL
           )
           -- Only a session they were expected at: not one they filed an
           -- absence for, whoever ran it.
           AND public.gedu_is_expected_at_session(p_gedu_id, p_group_id, p_session_date)
           AND NOT public.group_session_is_cancelled(p_group_id, p_session_date)
           -- The substitute window's END, its one definition.
           AND now() < public.group_session_access_ends_at(p_group_id, p_session_date),
           false
         );
$$;

COMMENT ON FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS 'Internal predicate, the sibling of gedu_holds_unexpired_substitution: does this gedu still hold this (group, date) through an ENDED assignment? True when they held the group at that session (group_assignments_at asked at group_session_starts_at) and hold no current period on it now, were expected at it (gedu_is_expected_at_session — so not a date they filed an absence for), it is not cancelled, and the substitute window has not closed (now() before group_session_access_ends_at). A gedu still current on the group is answered false: the current period already reaches everything this would. No certification test, unlike a substitution''s: the seat was a standing one. Takes the gedu as an argument because the seat reads ask it about the gedu they were handed. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) TO service_role;

-- ---------------------------------------------------------------------------
-- gedu_unexpired_ended_assignment_dates
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) RETURNS TABLE(session_date date)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT candidate.session_date
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
    CROSS JOIN LATERAL (
      -- Every date whose window can still be open. The planned dates from 16
      -- product-local days back — the 15-day fallback cannot reach further —
      -- to today, since a session in an ended period started before the end…
      SELECT planned.session_date
        FROM public.planned_session_dates(
               g.product_id,
               (now() AT TIME ZONE p.timezone)::date - 16,
               (now() AT TIME ZONE p.timezone)::date
             ) AS planned
      UNION
      -- …the stored rows over the same days, a date the plan has since dropped
      -- included, and any older row whose report was mailed within the last 24
      -- hours, since the mailed report is what the window counts from.
      SELECT gs.session_date
        FROM public.group_sessions gs
       WHERE gs.group_id = g.id
         AND (gs.session_date >= (now() AT TIME ZONE p.timezone)::date - 16
              OR gs.report_emailed_at > now() - interval '24 hours')
    ) AS candidate
   WHERE g.id = p_group_id
     -- Constant for the call, so it is decided once: almost every group has no
     -- ended period of this gedu on it, and is answered without the plan.
     AND EXISTS (
           SELECT 1
             FROM public.gedu_group_assignments ga
            WHERE ga.group_id = p_group_id
              AND ga.gedu_id  = p_gedu_id
              AND ga.ended_at IS NOT NULL
         )
     AND public.gedu_holds_unexpired_ended_assignment(p_gedu_id, p_group_id, candidate.session_date);
$$;

COMMENT ON FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) IS 'Internal: the dates of this group on which the gedu still holds it through an ended assignment — gedu_holds_unexpired_ended_assignment asked of every date whose window can still be open: the planned dates from 16 product-local days back to today, and the stored rows over those days or whose report was mailed in the last 24 hours. The group-wide form of that predicate: EXISTS over it is "an ended assignment still in its window", the arm gedu_substitutes_group and the seat reads compose, so the card and the workspace stay open until the LATEST of those windows closes. Empty for a gedu still current on the group. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- gedu_substitutes_group
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gedu_substitutes_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- A temporary seat: a live substitution on any date of the group…
  SELECT EXISTS (
    SELECT 1
      FROM public.session_substitution_requests r
     WHERE r.group_id   = p_group_id
       AND r.substitute_id = (SELECT auth.uid())
       AND r.status     = 'substituted'::public.substitution_request_status
       AND public.gedu_substitutes_session(r.group_id, r.session_date)
  )
  -- …or an ended assignment still in its window.
  OR EXISTS (
    SELECT 1
      FROM public.gedu_unexpired_ended_assignment_dates((SELECT auth.uid()), p_group_id)
  );
$$;

COMMENT ON FUNCTION public.gedu_substitutes_group(p_group_id uuid) IS 'Internal-by-intent predicate: does the CALLER hold a TEMPORARY seat on this group — a live substitution on ANY of its dates (an EXISTS over gedu_substitutes_session, so the access window has exactly one definition), or an ENDED assignment still in its window on any of its dates (gedu_unexpired_ended_assignment_dates, which closes on the same window end)? This is the arm added to every GROUP-WIDE gate on gedu_group_assignments — the workspace, the feed, notes, roster, member flair, the game-account editors and the site notes — on the owner''s rule that a sub sees everything the main gedu sees for as long as their window is open, and that a gedu taken off a group is treated like one. It is NOT the arm used by the two date-scoped exceptions (the voice room and the family report mail): the voice room is current-only for an ended gedu, and the report mail asks about the claimed date itself. EXPOSED TO `authenticated`, unlike the other substitution predicates, and for one reason: the gedus_read_assigned_groups policy on product_groups calls it, and an RLS policy is evaluated as the querying role, so it cannot call a private helper. Inlining the EXISTS instead would have needed a table SELECT grant AND a read policy on session_substitution_requests — strictly more Data API surface than one boolean. Self-scoping: it answers only about the caller, no argument can name a different asker, and it is total, so a USING clause is never handed a three-valued answer.';

-- ---------------------------------------------------------------------------
-- gedu_assigned_products and its two ways in
--
-- A new column changes RETURNS TABLE, so the three are dropped and recreated.
-- ---------------------------------------------------------------------------

DROP FUNCTION public.get_my_assigned_products();
DROP FUNCTION public.get_assigned_products_for_discord_user(text);
DROP FUNCTION public.gedu_assigned_products(uuid);

CREATE FUNCTION public.gedu_assigned_products(p_gedu_id uuid) RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, substitution_cancelled boolean, upcoming_sessions jsonb, substitution_starts_at timestamp with time zone, substitution_ends_at timestamp with time zone, last_session_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- Four arms, discriminated by `kind`: a CURRENT ASSIGNMENT (one row per
  -- current period, `substitution_date` null), an unexpired SUBSTITUTION (one
  -- row per substituted date, `substitution_date` set), a TRAINEE seat, and an
  -- ENDED ASSIGNMENT still in its window (one row per group). They share every
  -- product fact, which is why they are one RPC — the card the dashboard draws
  -- differs in its chrome, not in the facts it needs — and every arm states the
  -- product through the same shell every substitution surface uses.
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
    false,
    public.group_upcoming_planned_sessions(a.group_id),
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::date
  FROM public.gedu_group_assignments a
  JOIN public.products p ON p.id = a.product_id
  WHERE a.gedu_id = p_gedu_id
    AND a.ended_at IS NULL

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
    -- Asked of the substituted date itself: the card stands for days after
    -- its date, so the flag has to hold once the date is behind today.
    public.group_session_is_cancelled(r.group_id, r.session_date),
    -- A substitution is one afternoon, not a run: its card and the picker read
    -- the substituted session's own instants below, never the group's plan.
    '[]'::jsonb,
    lower(sw.session_window),
    upper(sw.session_window),
    NULL::date
  FROM public.session_substitution_requests r
  JOIN public.product_groups g ON g.id = r.group_id
  JOIN public.products p       ON p.id = g.product_id
  -- NULL on a date the plan no longer has: the card then states the date alone.
  CROSS JOIN LATERAL public.derive_group_session_window(r.group_id, r.session_date) AS sw(session_window)
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
    false,
    public.group_upcoming_planned_sessions(t.group_id),
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::date
  FROM public.gedu_group_trainees t
  JOIN public.products p ON p.id = t.product_id
  WHERE t.gedu_id = p_gedu_id

  UNION ALL

  -- The gedu's ENDED assignments still in their window: one row per group,
  -- however many ended periods (a role change) the gedu held it in, dated by
  -- the latest session still open to them. A gedu current on the group gets
  -- no row here: gedu_unexpired_ended_assignment_dates is empty for them.
  SELECT
    e.group_id,
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
    'ended_assignment'::text,
    NULL::date,
    -- A cancelled date never holds the window, so the date below never is.
    false,
    -- The run is no longer theirs: no plan.
    '[]'::jsonb,
    lower(sw.session_window),
    upper(sw.session_window),
    last_open.session_date
  FROM (
    SELECT DISTINCT a.group_id, a.product_id
      FROM public.gedu_group_assignments a
     WHERE a.gedu_id = p_gedu_id
       AND a.ended_at IS NOT NULL
  ) e
  JOIN public.products p ON p.id = e.product_id
  CROSS JOIN LATERAL (
    SELECT max(d.session_date) AS session_date
      FROM public.gedu_unexpired_ended_assignment_dates(p_gedu_id, e.group_id) d
  ) last_open
  CROSS JOIN LATERAL public.derive_group_session_window(e.group_id, last_open.session_date) AS sw(session_window)
  WHERE last_open.session_date IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) IS 'Every product the given gedu has a seat on, one row per seat, with the product as session_product_document describes it — the one shell every substitution surface shares, slots included — how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). FOUR KINDS OF SEAT, discriminated by `kind`: an `assignment` row per CURRENT gedu_group_assignments period, with `substitution_date` null; a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides; a `trainee` row per gedu_group_trainees seat, shaped like an assignment row (substitution_date null, substitution_cancelled false); and an `ended_assignment` row per group the gedu was taken off and still holds through gedu_unexpired_ended_assignment_dates — some session they were expected at in an ended period whose substitute window is still open — with `last_session_date` the latest such date, never for a group the gedu is current on. gedu_holds_unexpired_substitution rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: the product shell, a date, two head counts; `substitution_cancelled` — whether the substituted date itself is cancelled (group_session_is_cancelled), asked of the date because the substitution card stands for days after it, and false on the other kinds; and `substitution_starts_at`/`substitution_ends_at` — the instants of the session the row is dated by (the substituted date, or an ended assignment''s `last_session_date`), derive_group_session_window''s bounds, NULL where the plan has no session on the date and NULL on the other kinds. `upcoming_sessions` is the standing seat''s group''s plan (group_upcoming_planned_sessions: {session_date, starts_at, ends_at, cancelled} from the day before the product-local today to the group''s plan horizon), which the card names its next session from and the absence picker lists; the empty array on a substitution or an ended row, neither of which is a run. `last_session_date` is NULL on every kind but `ended_assignment`. One RPC rather than four because the kinds share every product fact and the dashboard card differs in its chrome rather than in the facts it needs.';

REVOKE ALL ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) FROM PUBLIC;

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, substitution_cancelled boolean, upcoming_sessions jsonb, substitution_starts_at timestamp with time zone, substitution_ends_at timestamp with time zone, last_session_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN QUERY
  SELECT * FROM public.gedu_assigned_products((SELECT auth.uid()));
END;
$$;

COMMENT ON FUNCTION public.get_my_assigned_products() IS 'Every seat the calling gedu holds, exactly as gedu_assigned_products describes it for that gedu: gedu-gated on its first statement, then that function for auth.uid(). The rows, their four kinds and every fact on them are that function''s; this is the web''s way in, and get_assigned_products_for_discord_user is the Discord bot''s.';

REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO service_role;

CREATE FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, substitution_cancelled boolean, upcoming_sessions jsonb, substitution_starts_at timestamp with time zone, substitution_ends_at timestamp with time zone, last_session_date date)
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

REVOKE ALL ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) TO service_role;

-- ---------------------------------------------------------------------------
-- claim_group_session_report_email
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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

  -- The assignment half is spelled out INLINE here rather than through
  -- gedu_teaches_group. gedu_teaches_group admits a temporary seat on ANY of
  -- the group's dates; the family report mail is at-most-once and has no
  -- resend, so a sub, or a gedu taken off the group, must not be able to send
  -- the mail for a session they did not run. Both temporary arms are therefore
  -- DATE-SCOPED to the session being claimed.
  IF NOT public.is_admin()
     AND NOT EXISTS (
           SELECT 1
             FROM public.gedu_group_assignments ga
            WHERE ga.group_id = p_group_id
              AND ga.gedu_id  = (SELECT auth.uid())
              AND ga.ended_at IS NULL
         )
     AND NOT public.gedu_substitutes_session(p_group_id, p_session_date)
     AND NOT public.gedu_holds_unexpired_ended_assignment(
           (SELECT auth.uid()), p_group_id, p_session_date
         ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Cancellation: a cancelled session's report is never mailed. The record
  -- may still hold one — an admin can cancel a session that was written up —
  -- but the families were told the session is off. Asked under the lock
  -- cancel_session takes, so a claim cannot land past a cancellation.
  PERFORM public.lock_group_session_key(p_group_id, p_session_date);

  IF public.group_session_is_cancelled(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', p_session_date
      USING ERRCODE = 'P0026';
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

COMMENT ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) IS 'Claim the one send of a session report to the group''s families, and hand back the row it claimed. Open to an ADMIN, to a gedu holding a CURRENT assignment period on the group, to the substitute of that date (gedu_substitutes_session), and to a gedu taken off the group for a date they still hold through their ended assignment (gedu_holds_unexpired_ended_assignment). Refuses a CANCELLED session with SQLSTATE P0026 — a record kept under a cancellation may hold a report, but the families were told the session is off — asked under the (group, date) advisory lock cancel_session takes. Then takes the row''s lock and refuses with P0021 when there is no report to send (no row, or a report that is empty after the same whitespace trim the summaries SQL applies) and with P0022 when report_emailed_at is already set — every refusal binds an admin identically; otherwise stamps report_emailed_at = now() and report_emailed_by = auth.uid(). The claim is the FIRST write of the send and is also its authorization: succeeding proves the caller may send for this group, which is what lets the route resolve recipients with the service role afterwards. Releasing a claim is the route''s job and happens only when every single mail failed. The assignment half is spelled out INLINE here instead of calling gedu_teaches_group, and that is a security decision rather than a convenience: gedu_teaches_group admits a temporary seat on ANY of the group''s dates, while this mail is at-most-once with no resend, so a sub or an ended gedu must not be able to send the families a write-up of a session they did not run. Both temporary arms here are therefore DATE-SCOPED to the session being claimed — one of exactly two places on this surface that is, the other being the voice room.';

-- ---------------------------------------------------------------------------
-- gedu_assignment_summaries
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gedu_assignment_summaries(p_gedu_id uuid, p_epoch_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN

  RETURN COALESCE((
    -- The gedu's SEATS on groups. Everything below the union is written
    -- against a (product, group) pair and a possible substitution DATE, and
    -- does not care which arm produced them.
    --
    --   * `assignment` — one row per CURRENT gedu_group_assignments period,
    --     with `substitution_date` null.
    --   * `substitution`      — one row per UNEXPIRED substitution date.
    --     gedu_holds_unexpired_substitution carries the whole of that: keyed to
    --     the gedu asked about, the holder still certified, and the window's END not yet
    --     passed. Deliberately not gedu_substitutes_session, which would also
    --     require the session to be within 48 hours — this arm feeds the substitution
    --     card a sub reads on My SOG, which exists from approval, where the
    --     workspace it links to opens at T-48h.
    --   * `ended_assignment` — one row per group the gedu was taken off and
    --     still holds through an ended assignment in its window
    --     (gedu_unexpired_ended_assignment_dates is empty for a gedu current
    --     on the group, so a role change or a re-add draws no second card).
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
         AND a0.ended_at IS NULL
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
      UNION ALL
      SELECT e0.product_id,
             e0.group_id,
             p_gedu_id AS gedu_id,
             'ended_assignment'::text AS kind,
             NULL::date               AS substitution_date
        FROM (
          SELECT DISTINCT ea.product_id, ea.group_id
            FROM public.gedu_group_assignments ea
           WHERE ea.gedu_id = p_gedu_id
             AND ea.ended_at IS NOT NULL
        ) e0
       WHERE EXISTS (
               SELECT 1
                 FROM public.gedu_unexpired_ended_assignment_dates(p_gedu_id, e0.group_id)
             )
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

      -- The venue, in-person and hybrid products only (see get_gedu_group_feed).
      LEFT JOIN LATERAL (
        SELECT l.name
          FROM public.locations l
         WHERE l.id = p.location_id AND p.delivery_mode <> 'online'
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
           -- A gedu owes only the sessions they were EXPECTED at
           -- (gedu_is_expected_at_session), whichever kind of seat this row
           -- is: one inside a period of theirs on the group, or the one they
           -- substitute — and never a date they filed a non-withdrawn request
           -- on, whether it is still open, already substituted, or a sub-of-sub
           -- chain's second link: they have said they cannot be there. So a
           -- gedu added mid-run owes nothing from before they were, and one
           -- taken off owes nothing from after. This has a TWIN IN TYPESCRIPT
           -- (see the comment below on the four conditions) and the twin
           -- learns the same rule.
           AND public.gedu_is_expected_at_session(p_gedu_id, g.id, occurrence.session_date)
           -- An ENDED row owes only the sessions still open to the gedu: one
           -- whose window has closed is out of their reach, and a count they
           -- cannot clear is no use to them.
           AND (a.kind <> 'ended_assignment'
                OR public.gedu_holds_unexpired_ended_assignment(p_gedu_id, g.id, occurrence.session_date))
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


COMMENT ON FUNCTION public.gedu_assignment_summaries(p_gedu_id uuid, p_epoch_date date) IS 'One row per gedu seat for the dashboard cards — a CURRENT assignment period, a substitution date, a trainee seat, or a group the gedu was taken off and still holds through an ended assignment in its window — group name, that group''s participant count (an active seat may be held by an adult as well as by a child), the venue name on in-person and hybrid products, and how many past sessions still need attention. A finished session on or after the epoch counts until ALL of: the register is in, a family-facing report is written, the mail telling the families it is there has been sent, and — on the run''s FINAL session of a product with requires_gamer_creations set — every current roster member has at least one creation. The register condition is scoped to the members who had JOINED the group before that occurrence ended: both the marks counted and the size they are compared against, off participations.group_joined_at against an end instant resolved once per occurrence (the stored row''s ends_at, else the planned end from derive_group_session_window, which is the same instant the "has it finished" test already used). group_participant_count deliberately keeps measuring the WHOLE current roster — a card''s headcount is not a per-occurrence question. The empty-group exemption is: an occurrence on which no member was expected owes nothing at all, so a group whose first members joined after its first sessions had run owes no register, report or mail for those sessions. The report and mail conditions are unscoped because a session owes those whoever was in the room. The creations condition carries the SAME join-date scoping as the register condition, on the owner''s principle that a gedu owes a creation for every gamer who was in the group at the time of the last session — so a seat placed into the group after the final session ended owes nothing, and one occurrence cannot answer "who was this for" two different ways. Only the JOIN half of that principle is expressible: a member who has since LEFT owes nothing, because the roster is active seats and a departure leaves no trace. The final session is group_final_session_date: the last planned date on or before end_date that the group has not cancelled, derived rather than stored — so a cancelled last session hands the creations condition to the one before it; an open-ended product (end_date NULL) has none and therefore never owes creations, which is documented behaviour rather than an error. A gedu owes only the occurrences they were EXPECTED at (gedu_is_expected_at_session): inside an assignment period of theirs on the group or the date they substitute, and never a date they filed a non-withdrawn request on — so a gedu added mid-run owes nothing from before their period began and one taken off nothing from after it ended. A CANCELLED occurrence is never owed, by group_session_is_cancelled — including a cancelled record the schedule no longer projects, which the stored-row arm would otherwise reach: nothing ran, and a record kept under a cancellation is frozen. The badge''s unit is the SESSION: it counts sessions needing attention, and the final one simply has one more way to need it. The enforcement epoch travels in as an argument because it is a code constant, not a column. This count has a twin in TypeScript — the gedu feed''s entry-state derivation, which answers the same question for one card — and the two must be changed together, on all four conditions, on who a session is for, which scopes two of them, and on whether the viewer was expected at it. A SECOND KIND OF SEAT feeds the same machinery: a `substitution` row per substitution date, carrying `kind` and `substitution_date`, whose owed count is the same four conditions applied to a set of one occurrence — so it is 0 or 1 and never a term''s worth. That arm asks gedu_holds_unexpired_substitution rather than gedu_substitutes_session: the card stands from approval, where the workspace behind it opens 48 hours before the substituted session, and a card that waited for the workspace would hide from a sub the afternoon they had agreed to take. A substitution still locked owes nothing by construction, because every occurrence this count ranges over has already ended. A FOURTH KIND, `ended_assignment`: a row per group on which gedu_unexpired_ended_assignment_dates is non-empty — the gedu held it in an ended period, holds no current one, and some session they were expected at there still has its substitute window open — with substitution_date null, whose owed count is the same four conditions over just those still-open sessions. A THIRD KIND, `trainee`: a row per gedu_group_trainees seat with substitution_date null, the group name, participant count and venue name like an assignment row, and an attention_count that is always 0 — what a session owes is the staff''s work, so no staff-only aggregate is computed for a trainee seat.';
