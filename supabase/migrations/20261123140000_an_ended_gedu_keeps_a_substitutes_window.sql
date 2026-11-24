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
-- Owner's ruling (2026-11-24): decertifying is the off switch for both kinds of
-- temporary seat. The window holds only while the gedu is certified, exactly as
-- a substitution's does, so decertifying an ended gedu closes the workspace, the
-- card, the session writes and the report mail at once.
--
-- Second ruling of 2026-11-23: a gedu owes only the sessions they were expected
-- at. The summaries' owed count was every session of the group since the epoch,
-- less the dates the gedu filed against; it is now the sessions the gedu was
-- expected at (gedu_is_expected_at_session), so a gedu added mid-run, a
-- substitute and an ended gedu each owe their own sessions and no others.
--
-- The run is no longer an ended gedu's, so they write only the sessions still
-- in their window. The session writes (report and gedu note, register, photos)
-- ask a session-scoped gate, gedu_writes_group_session: a current period on the
-- group or a live substitution on it writes every session — a substitute writing
-- group-wide and mailing only their own date is the substitution design — and
-- an ended assignment writes only its windowed dates. The group-level writes
-- (group and site notes, member flair, game accounts) stay on
-- gedu_teaches_group, where an ended gedu is treated like a substitute.
--
-- The workspace learns that scope from its document: get_gedu_group_feed
-- carries `viewer_temporary_seat`, which says whether the reader writes every
-- session, which session dates are theirs to write and mail, which dates' voice
-- rooms admit them (their substitution dates alone — voice admits an ended
-- assignment to no room) and whether a current period elsewhere on the product
-- admits them to every room of it. The page offers Edit, Send and Join from the
-- database's dates rather than a second window definition.
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
           -- Still certified, as a substitute must be: decertifying ends the
           -- window mid-way, for both kinds of temporary seat.
           AND EXISTS (
             SELECT 1
               FROM public.gedu_profiles gp
              WHERE gp.user_id = p_gedu_id
                AND gp.certified
           )
           -- The substitute window's END, its one definition.
           AND now() < public.group_session_access_ends_at(p_group_id, p_session_date),
           false
         );
$$;

COMMENT ON FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS 'Internal predicate, the sibling of gedu_holds_unexpired_substitution: does this gedu still hold this (group, date) through an ENDED assignment? True when they held the group at that session (group_assignments_at asked at group_session_starts_at) and hold no current period on it now, were expected at it (gedu_is_expected_at_session — so not a date they filed an absence for), it is not cancelled, they are still certified, and the substitute window has not closed (now() before group_session_access_ends_at). The certification test is gedu_holds_unexpired_substitution''s: decertifying ends the window at once, for an ended gedu as for a substitute. A gedu still current on the group is answered false: the current period already reaches everything this would. Takes the gedu as an argument because the seat reads ask it about the gedu they were handed. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) TO service_role;

COMMENT ON COLUMN public.gedu_profiles.certified IS 'Whether an admin has vouched for this educator. Gates three things and nothing else: group assignment (UI-only, because assignment is admin-driven), instant-voice-room moderation (server-side, because it is gedu-initiated), and OFFERING AND HOLDING A TEMPORARY SEAT (server-side, twice over: gedu_may_substitute_session refuses an uncertified offerer or sub, and gedu_holds_unexpired_substitution and gedu_holds_unexpired_ended_assignment re-check this column on every access test, so de-certifying an educator ends a live substitution''s reach into the group, and an ended assignment''s window, mid-window rather than only barring the next one). It is the ONLY eligibility test the substitution pool applies — coverage area, language and schedule clash are deliberately follow-ups — which is why an uncertified gedu sees an empty "Sessions needing a substitute" list rather than a refusal. An uncertified gedu still has broad platform access by design. Distinct from profiles.email_verified_at, which is about an address rather than a person.';

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

COMMENT ON FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) IS 'Internal: the dates of this group on which the gedu still holds it through an ended assignment — gedu_holds_unexpired_ended_assignment asked of every date whose window can still be open: the planned dates from 16 product-local days back to today, and the stored rows over those days or whose report was mailed in the last 24 hours. The group-wide form of that predicate: EXISTS over it is "an ended assignment still in its window", the arm gedu_substitutes_group and the seat reads compose, so the card and the workspace stay open until the LATEST of those windows closes, or until the gedu is decertified. Empty for a gedu still current on the group. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- gedu_holds_live_substitution_on_group
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.gedu_holds_live_substitution_on_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.session_substitution_requests r
     WHERE r.group_id      = p_group_id
       AND r.substitute_id = (SELECT auth.uid())
       AND r.status        = 'substituted'::public.substitution_request_status
       AND public.gedu_substitutes_session(r.group_id, r.session_date)
  );
$$;

COMMENT ON FUNCTION public.gedu_holds_live_substitution_on_group(p_group_id uuid) IS 'Internal predicate: does the CALLER hold a live substitution on ANY date of this group — an EXISTS over gedu_substitutes_session, so the access window and the certification test have one definition? The substitution half of gedu_substitutes_group, named on its own because the session writes and the workspace document ask it alone: a live substitution writes every session of the group (gedu_writes_group_session), where an ended assignment writes only its windowed dates. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.gedu_holds_live_substitution_on_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_holds_live_substitution_on_group(p_group_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- gedu_substitutes_group
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gedu_substitutes_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- A temporary seat: a live substitution on any date of the group…
  SELECT public.gedu_holds_live_substitution_on_group(p_group_id)
  -- …or an ended assignment still in its window.
  OR EXISTS (
    SELECT 1
      FROM public.gedu_unexpired_ended_assignment_dates((SELECT auth.uid()), p_group_id)
  );
$$;

COMMENT ON FUNCTION public.gedu_substitutes_group(p_group_id uuid) IS 'Internal-by-intent predicate: does the CALLER hold a TEMPORARY seat on this group — a live substitution on ANY of its dates (an EXISTS over gedu_substitutes_session, so the access window has exactly one definition), or an ENDED assignment still in its window on any of its dates (gedu_unexpired_ended_assignment_dates, which closes on the same window end and on the same certification test, so decertifying ends both kinds)? This is the arm added to every GROUP-WIDE gate on gedu_group_assignments — the workspace, the feed, notes, roster, member flair, the game-account editors and the site notes — on the owner''s rule that a sub sees everything the main gedu sees for as long as their window is open, and that a gedu taken off a group is treated like one. It is NOT the arm used by the two date-scoped exceptions (the voice room and the family report mail): the voice room is current-only for an ended gedu, and the report mail asks about the claimed date itself. EXPOSED TO `authenticated`, unlike the other substitution predicates, and for one reason: the gedus_read_assigned_groups policy on product_groups calls it, and an RLS policy is evaluated as the querying role, so it cannot call a private helper. Inlining the EXISTS instead would have needed a table SELECT grant AND a read policy on session_substitution_requests — strictly more Data API surface than one boolean. Self-scoping: it answers only about the caller, no argument can name a different asker, and it is total, so a USING clause is never handed a three-valued answer.';

-- ---------------------------------------------------------------------------
-- gedu_writes_group_session
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.gedu_writes_group_session(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- A current period on the group writes every session of it…
  SELECT EXISTS (
           SELECT 1
             FROM public.gedu_group_assignments ga
            WHERE ga.group_id = p_group_id
              AND ga.gedu_id  = (SELECT auth.uid())
              AND ga.ended_at IS NULL
         )
      -- …so does a live substitution, which writes group-wide and mails only
      -- its own date…
      OR public.gedu_holds_live_substitution_on_group(p_group_id)
      -- …and an ended assignment writes only the sessions still in its window.
      OR public.gedu_holds_unexpired_ended_assignment((SELECT auth.uid()), p_group_id, p_session_date);
$$;

COMMENT ON FUNCTION public.gedu_writes_group_session(p_group_id uuid, p_session_date date) IS 'Internal predicate: may the caller write THIS session of the group — its report and gedu note, its register, its photos? A CURRENT assignment period on the group, or a live substitution on any of its dates (gedu_holds_live_substitution_on_group), writes every session, as gedu_teaches_group admits them; a gedu taken off the group writes only a date they still hold through the ended assignment (gedu_holds_unexpired_ended_assignment), never the group''s other sessions and never one ahead. The gate behind set_group_session_notes, record_attendance, add_group_session_image, delete_group_session_image and assert_can_delete_session_image; the group-level writes stay on gedu_teaches_group, and the report mail asks its own date-scoped gate. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.gedu_writes_group_session(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_writes_group_session(p_group_id uuid, p_session_date date) TO service_role;

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

COMMENT ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) IS 'Every product the given gedu has a seat on, one row per seat, with the product as session_product_document describes it — the one shell every substitution surface shares, slots included — how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). FOUR KINDS OF SEAT, discriminated by `kind`: an `assignment` row per CURRENT gedu_group_assignments period, with `substitution_date` null; a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides; a `trainee` row per gedu_group_trainees seat, shaped like an assignment row (substitution_date null, substitution_cancelled false); and an `ended_assignment` row per group the gedu was taken off and still holds through gedu_unexpired_ended_assignment_dates — some session they were expected at in an ended period whose substitute window is still open, while they are still certified — with `last_session_date` the latest such date, never for a group the gedu is current on. gedu_holds_unexpired_substitution rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: the product shell, a date, two head counts; `substitution_cancelled` — whether the substituted date itself is cancelled (group_session_is_cancelled), asked of the date because the substitution card stands for days after it, and false on the other kinds; and `substitution_starts_at`/`substitution_ends_at` — the instants of the session the row is dated by (the substituted date, or an ended assignment''s `last_session_date`), derive_group_session_window''s bounds, NULL where the plan has no session on the date and NULL on the other kinds. `upcoming_sessions` is the standing seat''s group''s plan (group_upcoming_planned_sessions: {session_date, starts_at, ends_at, cancelled} from the day before the product-local today to the group''s plan horizon), which the card names its next session from and the absence picker lists; the empty array on a substitution or an ended row, neither of which is a run. `last_session_date` is NULL on every kind but `ended_assignment`. One RPC rather than four because the kinds share every product fact and the dashboard card differs in its chrome rather than in the facts it needs.';

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


COMMENT ON FUNCTION public.gedu_assignment_summaries(p_gedu_id uuid, p_epoch_date date) IS 'One row per gedu seat for the dashboard cards — a CURRENT assignment period, a substitution date, a trainee seat, or a group the gedu was taken off and still holds through an ended assignment in its window — group name, that group''s participant count (an active seat may be held by an adult as well as by a child), the venue name on in-person and hybrid products, and how many past sessions still need attention. A finished session on or after the epoch counts until ALL of: the register is in, a family-facing report is written, the mail telling the families it is there has been sent, and — on the run''s FINAL session of a product with requires_gamer_creations set — every current roster member has at least one creation. The register condition is scoped to the members who had JOINED the group before that occurrence ended: both the marks counted and the size they are compared against, off participations.group_joined_at against an end instant resolved once per occurrence (the stored row''s ends_at, else the planned end from derive_group_session_window, which is the same instant the "has it finished" test already used). group_participant_count deliberately keeps measuring the WHOLE current roster — a card''s headcount is not a per-occurrence question. The empty-group exemption is: an occurrence on which no member was expected owes nothing at all, so a group whose first members joined after its first sessions had run owes no register, report or mail for those sessions. The report and mail conditions are unscoped because a session owes those whoever was in the room. The creations condition carries the SAME join-date scoping as the register condition, on the owner''s principle that a gedu owes a creation for every gamer who was in the group at the time of the last session — so a seat placed into the group after the final session ended owes nothing, and one occurrence cannot answer "who was this for" two different ways. Only the JOIN half of that principle is expressible: a member who has since LEFT owes nothing, because the roster is active seats and a departure leaves no trace. The final session is group_final_session_date: the last planned date on or before end_date that the group has not cancelled, derived rather than stored — so a cancelled last session hands the creations condition to the one before it; an open-ended product (end_date NULL) has none and therefore never owes creations, which is documented behaviour rather than an error. A gedu owes only the occurrences they were EXPECTED at (gedu_is_expected_at_session): inside an assignment period of theirs on the group or the date they substitute, and never a date they filed a non-withdrawn request on — so a gedu added mid-run owes nothing from before their period began and one taken off nothing from after it ended. A CANCELLED occurrence is never owed, by group_session_is_cancelled — including a cancelled record the schedule no longer projects, which the stored-row arm would otherwise reach: nothing ran, and a record kept under a cancellation is frozen. The badge''s unit is the SESSION: it counts sessions needing attention, and the final one simply has one more way to need it. The enforcement epoch travels in as an argument because it is a code constant, not a column. This count has a twin in TypeScript — the gedu feed''s entry-state derivation, which answers the same question for one card — and the two must be changed together, on all four conditions, on who a session is for, which scopes two of them, and on whether the viewer was expected at it. A SECOND KIND OF SEAT feeds the same machinery: a `substitution` row per substitution date, carrying `kind` and `substitution_date`, whose owed count is the same four conditions applied to a set of one occurrence — so it is 0 or 1 and never a term''s worth. That arm asks gedu_holds_unexpired_substitution rather than gedu_substitutes_session: the card stands from approval, where the workspace behind it opens 48 hours before the substituted session, and a card that waited for the workspace would hide from a sub the afternoon they had agreed to take. A substitution still locked owes nothing by construction, because every occurrence this count ranges over has already ended. A FOURTH KIND, `ended_assignment`: a row per group on which gedu_unexpired_ended_assignment_dates is non-empty — the gedu held it in an ended period, holds no current one, is still certified, and some session they were expected at there still has its substitute window open — with substitution_date null, whose owed count is the same four conditions over just those still-open sessions. A THIRD KIND, `trainee`: a row per gedu_group_trainees seat with substitution_date null, the group name, participant count and venue name like an assignment row, and an attention_count that is always 0 — what a session owes is the staff''s work, so no staff-only aggregate is computed for a trainee seat.';

-- ---------------------------------------------------------------------------
-- The session writes ask the session-scoped gate. Bodies otherwise unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
  IF NOT public.is_admin() AND NOT public.gedu_writes_group_session(p_group_id, p_session_date) THEN
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

CREATE OR REPLACE FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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

  IF NOT public.is_admin() AND NOT public.gedu_writes_group_session(p_group_id, p_session_date) THEN
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

CREATE OR REPLACE FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
  v_count      integer;
  v_image_id   uuid;
BEGIN
  -- An admin, or a gedu. Written as one guard call rather than a branch around
  -- one so the authorization spine can read it, exactly as every other session
  -- writer is.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The assignment half of the gate, which is what an admin is exempt from.
  -- Any gedu assigned to the group may attach and remove photos, matching how
  -- the report itself is edited: there is no per-photo ownership.
  IF NOT public.is_admin() AND NOT public.gedu_writes_group_session(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The HARD sanity ceiling on a cap the caller supplies. The product cap lives
  -- in one constant in the contracts module and is passed in from there; this is
  -- only here so a buggy caller cannot ask for something absurd.
  IF p_max_images IS NULL OR p_max_images < 1 OR p_max_images > 24 THEN
    RAISE EXCEPTION
      'A photo cap of % is outside the 1..24 a caller may ask for',
      COALESCE(p_max_images::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  -- One refusal for every implausible dimension, rather than a 23514 from the
  -- CHECK for an out-of-range value and a 23502 from the NOT NULL for a missing
  -- one. The table's constraints still stand behind this and are what make the
  -- bound a guarantee rather than a convention.
  IF p_width IS NULL OR p_height IS NULL
     OR p_width  <= 0 OR p_width  > 4096
     OR p_height <= 0 OR p_height > 4096 THEN
    RAISE EXCEPTION
      'Image dimensions % x % are not a plausible session photo',
      COALESCE(p_width::text, 'NULL'), COALESCE(p_height::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_session_id := public.ensure_group_session(p_group_id, p_session_date);

  -- Take the session row's lock BEFORE counting, so two tabs uploading at once
  -- serialize here and the second one sees the first one's row. Without it both
  -- would count four and both would insert a fifth.
  PERFORM 1 FROM public.group_sessions WHERE id = v_session_id FOR UPDATE;

  SELECT count(*) INTO v_count
    FROM public.group_session_images
   WHERE session_id = v_session_id;

  IF v_count >= p_max_images THEN
    RAISE EXCEPTION
      'This session already holds % photos, which is the cap', v_count
      USING ERRCODE = 'P0023';
  END IF;

  INSERT INTO public.group_session_images (
    session_id, width, height, created_by
  )
  VALUES (v_session_id, p_width, p_height, v_uid)
  RETURNING id INTO v_image_id;

  RETURN v_image_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_group_session_image(p_image_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_group_id     uuid;
  v_session_date date;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  SELECT s.group_id, s.session_date
    INTO v_group_id, v_session_date
    FROM public.group_session_images i
    JOIN public.group_sessions s ON s.id = i.session_id
   WHERE i.id = p_image_id;

  -- No row and somebody else's row answer the same way. Deliberate: the caller
  -- has no right to learn which of the two it was.
  IF v_group_id IS NULL
     OR (NOT public.is_admin() AND NOT public.gedu_writes_group_session(v_group_id, v_session_date))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Cancellation: a photo on a cancelled session is frozen with the rest of
  -- the record, and comes back with it on a restore. Asked under the lock
  -- cancel_session takes, so a removal cannot land past a cancellation.
  PERFORM public.lock_group_session_key(v_group_id, v_session_date);

  IF public.group_session_is_cancelled(v_group_id, v_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', v_session_date
      USING ERRCODE = 'P0026';
  END IF;

  DELETE FROM public.group_session_images WHERE id = p_image_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_can_delete_session_image(p_image_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_group_id     uuid;
  v_session_date date;
BEGIN
  -- An admin, or a gedu. Guard-first on the first statement, in the shape the
  -- authorization spine reads and every other session RPC carries.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  SELECT s.group_id, s.session_date
    INTO v_group_id, v_session_date
    FROM public.group_session_images i
    JOIN public.group_sessions s ON s.id = i.session_id
   WHERE i.id = p_image_id;

  -- No row and somebody else's row answer the same way, exactly as they do in
  -- delete_group_session_image. The caller has no right to learn which it was.
  IF v_group_id IS NULL
     OR (NOT public.is_admin() AND NOT public.gedu_writes_group_session(v_group_id, v_session_date))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Cancellation: a photo on a cancelled session is frozen with the rest of
  -- the record. Asked here as well as on the delete, because the route removes
  -- the object between the two and must not start on one it cannot finish.
  IF public.group_session_is_cancelled(v_group_id, v_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', v_session_date
      USING ERRCODE = 'P0026';
  END IF;

  -- The id it validated, so a caller has a positive answer rather than the
  -- absence of an error. Returning it discloses nothing: it is the id the caller
  -- just sent, and it comes back only on the path where they were allowed.
  RETURN p_image_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_gedu_group_feed: the reader's temporary seat
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
  v_gedus      jsonb;
  v_substitutions     jsonb;
  v_cancellations     jsonb;
  v_trainees          jsonb;
  v_temporary_seat    jsonb;
  v_viewer     uuid    := (SELECT auth.uid());
  v_is_admin   boolean;
  v_start_date date;
  v_horizon    date;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright — the admin group details
  -- page renders this same document for any group of any product, which is what
  -- makes it the same surface as the gedu workspace rather than a second one.
  --
  -- For a GEDU this is unchanged: v1 shows them only their OWN group's feed.
  -- Peer-group feeds are not a schema restriction — relaxing this to "any group
  -- on a product the caller is assigned to" is a change to this predicate alone,
  -- and nothing downstream assumes the caller teaches the group they are
  -- reading, which is exactly what the admin path above now relies on.
  v_is_admin := public.is_admin();

  IF NOT v_is_admin
     AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id, p.start_date INTO v_product_id, v_start_date
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- The plan's span, which the holiday breaks share.
  v_horizon := public.session_plan_horizon(v_product_id, p_group_id);

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'delivery_mode', p.delivery_mode,
    'voice_room_mode', p.voice_room_mode,
    'external_voice_url', p.external_voice_url,
    -- Gedu-only, and stored somewhere only this function and an admin can
    -- reach. This document is never served to a parent or a gamer.
    'material_url', psd.material_url,
    -- Staff-facing only, and the one thing a client needs before it can
    -- decide that the final session owes creations: the condition is derived on
    -- the client from this flag, the schedule and the roster's creations, so no
    -- document carries an "owed" field of its own.
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

  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note,
    'gedu_note',   g.gedu_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue, on in-person and hybrid products. An online municipality club carries a
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
    AND p.delivery_mode <> 'online';

  -- The current roster. There is deliberately no joined-by-date machinery and
  -- no enrollment-at-the-time derivation: "who was enrolled then" is knowledge
  -- we do not have and choose not to fake. `signed_up_at` travels with each row
  -- so the client can tell someone who joined last week from one who has been
  -- here all term.
  --
  -- The identity key is `participant_id`. Every row on this roster is whoever
  -- holds the seat, and that can be an adult — the
  -- birth year and month / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel, and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
  --
  -- `signed_up_at` and `group_joined_at` answer two different questions and
  -- both travel: the first is when this seat was taken on the PRODUCT,
  -- the second when it entered THIS GROUP, and a member moved between two
  -- groups of one product has a fresh second and an unchanged first.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'birth_year',         gprof.birth_year,
        'birth_month',        gprof.birth_month,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so on a CHILD row this is non-null in practice. An ADULT row
        -- has no parent link at all, so it is NULL there and the wire contract
        -- allows it — the address for that row is the one below.
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
        -- check is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END,
        -- The staff-only flair, in parity with
        -- get_gedu_assigned_product's roster — the two shapes are kept
        -- identical on purpose, and this is the copy the page renders.
        'group_joined_at',            part.group_joined_at,
        'note',                       gn.note,
        'note_updated_by_first_name', ned.first_name,
        -- The one field on this roster that is NOT staff-only: the
        -- member's own family reads the same list on their product page. It
        -- rides here because the roster is where the per-gamer dialog is opened
        -- from, and because the client derives the final session's fourth
        -- completeness condition by tallying it against this same roster.
        -- Always an array, never null.
        'creations',                  COALESCE(gc.creations, '[]'::jsonb)
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
        -- Keyed on exactly (group_id, participant_id), so this cannot fan the
        -- row out; profiles.id behind it is a primary key.
        LEFT JOIN public.gamer_group_notes gn
               ON gn.group_id       = part.group_id
              AND gn.participant_id = part.participant_id
        LEFT JOIN public.profiles ned           ON ned.id        = gn.updated_by
        -- Same key, same guarantee.
        LEFT JOIN public.gamer_group_creations gc
               ON gc.group_id       = part.group_id
              AND gc.participant_id = part.participant_id
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
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- When this session's report was mailed to the group's families, and
        -- NULL until it has been. The card renders the sent line from
        -- it and decides whether to offer the button, so it has to travel with
        -- the session rather than be read separately.
        --
        -- Its partner column `report_emailed_by` deliberately stays OFF the
        -- wire: it is an audit trail for staff, nothing renders it, and the
        -- card's author chip is `updated_by_first_name` above.
        'report_emailed_at', s.report_emailed_at,
        -- The last editor's first name, for the author chip on the card.
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
        -- The session's photos. `created_by` is deliberately NOT on the
        -- wire — it is safeguarding audit, it gates nothing and nothing renders
        -- it, exactly like report_emailed_by above. Ordered by (created_at, id):
        -- the stamp is clock_timestamp() taken under the session row's lock and
        -- the id breaks a sub-tick tie, so every surface draws the same order.
        -- The URL is derived from the id by one helper rather than stored.
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
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
         -- A row on a holiday does not travel: that date carries its break
         -- and nothing else, and the row is back as it was when the break goes.
         AND NOT public.group_session_date_is_holiday(s.group_id, s.session_date)
    ) AS session_rows;

  -- The group's STAFF: every assignment period it has had, ended ones
  -- included, each with its role and its bounds. The client's staffing
  -- derivation needs two inputs — who was assigned at the session and in what
  -- role, and the non-withdrawn requests for the date — and this is the first
  -- of them; it places each session in the period containing its start, so a
  -- past session keeps the gedu who held the group then. First name only,
  -- exactly as every other staff list on this surface: a workspace names
  -- colleagues, it does not carry their records.
  SELECT COALESCE(
           jsonb_agg(entry ORDER BY first_name, started_at, period_id),
           '[]'::jsonb
         )
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name,
        'role',       ga.role,
        'started_at', ga.started_at,
        'ended_at',   ga.ended_at
      ) AS entry,
      pr.first_name,
      ga.started_at,
      ga.id AS period_id
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = p_group_id
    ) AS gedu_rows;

  -- Every NON-WITHDRAWN substitution request on the group, unbounded — exactly as this
  -- document already returns every stored session row. A withdrawn request is
  -- history that changes nothing about who is expected, so it is the one status
  -- that does not travel. The client merges these onto its entries by date; a
  -- projected date with no session row carries its requests like any other.
  --
  -- `reason` and `reason_note` ride only for an ADMIN. This document is served
  -- to an admin too (the admin group details page renders the gedu workspace's
  -- body), so the flag is the CALLER's role rather than a property of the RPC —
  -- which is what keeps a `sick` category, which is health data about a
  -- contractor, off a colleague's screen while the one document stays one
  -- document.
  SELECT COALESCE(
           jsonb_agg(
             public.substitution_request_document(r, v_is_admin, v_viewer, true)
             ORDER BY r.session_date DESC, r.created_at, r.id
           ),
           '[]'::jsonb
         )
    INTO v_substitutions
    FROM public.session_substitution_requests r
   WHERE r.group_id = p_group_id
     AND r.status <> 'withdrawn'::public.substitution_request_status;

  -- Cancellation: the group's cancelled sessions in effect, newest first —
  -- including one over a kept record the schedule no longer projects, which
  -- the feed draws as cancelled in the record's place rather than as the
  -- record. The reason, who cancelled and when ride for an ADMIN caller
  -- only, keyed to the caller exactly as a substitution reason is: a gedu
  -- learns that the session is off and nothing about why. One on a holiday is
  -- not listed: that date carries its break alone.
  SELECT COALESCE(
           jsonb_agg(
             public.session_cancellation_document(sc, v_is_admin)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = p_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
     AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date);

  -- The group's trainees in the order they were placed, drawn as
  -- Trainee-marked chips after the gedus. A trainee is not staff, so they
  -- are not in `gedus` above and never in the staffing derivation.
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

  -- The reader's TEMPORARY SEAT on the group, or NULL where they hold it
  -- outright: an admin, or a gedu with a current period on it, may write and
  -- mail every session. Anyone else reached this document through
  -- gedu_substitutes_group, and the page offers them only what the database
  -- admits:
  --
  -- * `writes_every_session` — whether a live substitution writes every
  --   session of the group (gedu_writes_group_session).
  -- * `session_dates` — the dates they may mail, and the only ones they may
  --   write unless a substitution writes every session: the dates they
  --   substitute (gedu_holds_unexpired_substitution, the card's own test) and
  --   the dates they still hold through an ended assignment
  --   (gedu_unexpired_ended_assignment_dates).
  -- * `voice_dates` — the dates whose room admits them, which are the
  --   substitution dates alone. is_voice_group_member and the voice token
  --   route admit a current period on the product, a live substitution on its
  --   date and a trainee seat; an ended assignment is none of them, so its
  --   windowed dates are writes and mail, never a room.
  -- * `teaches_product` — whether they hold a current period on any group of
  --   the product, which admits them to every room of it, this one included,
  --   whatever their seat on this group.
  --
  -- The window is the database's; the page never derives one.
  IF NOT v_is_admin
     AND NOT EXISTS (
           SELECT 1
             FROM public.gedu_group_assignments ga
            WHERE ga.group_id = p_group_id
              AND ga.gedu_id  = v_viewer
              AND ga.ended_at IS NULL
         ) THEN
    WITH substituted AS (
      SELECT DISTINCT r.session_date
        FROM public.session_substitution_requests r
       WHERE r.group_id      = p_group_id
         AND r.substitute_id = v_viewer
         AND r.status        = 'substituted'::public.substitution_request_status
         AND public.gedu_holds_unexpired_substitution(v_viewer, p_group_id, r.session_date)
    ),
    held AS (
      SELECT s.session_date FROM substituted s
      UNION
      SELECT e.session_date
        FROM public.gedu_unexpired_ended_assignment_dates(v_viewer, p_group_id) e
    )
    SELECT jsonb_build_object(
             'writes_every_session',
             public.gedu_holds_live_substitution_on_group(p_group_id),
             'session_dates',
             COALESCE(
               (SELECT jsonb_agg(h.session_date ORDER BY h.session_date) FROM held h),
               '[]'::jsonb
             ),
             'voice_dates',
             COALESCE(
               (SELECT jsonb_agg(s.session_date ORDER BY s.session_date) FROM substituted s),
               '[]'::jsonb
             ),
             'teaches_product',
             EXISTS (
               SELECT 1
                 FROM public.gedu_group_assignments ga
                WHERE ga.product_id = v_product_id
                  AND ga.gedu_id    = v_viewer
                  AND ga.ended_at IS NULL
             )
           )
      INTO v_temporary_seat;
  END IF;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions,
    'gedus',    v_gedus,
    'substitutions',   v_substitutions,
    'cancellations', v_cancellations,
    'trainees',      v_trainees,
    -- The plan from the product's start to this group's horizon: the end
    -- date of a dated product, the eighth unfinished session the group has
    -- not cancelled on an open-ended one. Plain plan rows; the cancellations
    -- above are laid over them by date.
    'planned_sessions', public.planned_sessions_document(v_product_id, v_horizon),
    -- The holiday breaks over the same span, each with the sessions it
    -- withdrew from the plan above.
    'holiday_breaks',   public.holiday_breaks_document(v_product_id, v_start_date, v_horizon),
    -- The run's last session the group has not cancelled, NULL on an
    -- open-ended product: the session that owes creations.
    'final_session_date', public.group_final_session_date(p_group_id),
    -- NULL, or what the reader's temporary seat reaches; see above.
    'viewer_temporary_seat', v_temporary_seat
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS 'One round trip for a group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person and hybrid products, the current roster, and every stored session row with its sparse attendance map and its photos — except a row on a holiday date, which carries its break and nothing else. Carries the product''s planned sessions beside its schedule parameters: `planned_sessions`, the plan from start_date to this group''s session_plan_horizon (planned_sessions_document), so the group''s next running session is inside however many dates ahead of it the group cancelled, as plain {session_date, starts_at, ends_at} rows with no cancellation folded in; `holiday_breaks`, holiday_breaks_document over the same span — each break of a calendar the product follows, with its name in every locale and the plan rows it withdrew; and `final_session_date`, this group''s group_final_session_date — NULL on an open-ended product. `cancellations` lists the cancellations in effect, none on a holiday date. Open to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s page body unchanged: one body fed by one document is what keeps the two surfaces one surface, where a second admin-shaped RPC would have started drifting field by field. An admin passes the ownership half outright; a gedu is shown only their OWN group''s feed, and a customer or a gamer is refused on the first statement, which is what keeps the material link and the three staff notes off every family surface. Each roster row is keyed by participant_id (whoever holds the seat, child or adult), carries both game identities (minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, independent of each other and drawn according to the product''s topic, which this document does not carry), and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox). Each roster row also carries the staff-only flair — group_joined_at (when the seat entered THIS group, as against signed_up_at, which is when it was taken on the product), note and note_updated_by_first_name — in deliberate parity with get_gedu_assigned_product''s roster, which is the parity the page depends on because it renders this copy. Each roster row additionally carries `creations` (always an array, [] when there is no row) — the one roster field that is NOT staff-only, since the member''s own family reads the same list — and the product shell carries requires_gamer_creations, because the final session''s fourth completeness condition is derived on the CLIENT from that flag, the schedule and this roster''s creations; no document carries an "owed" field. Each session row carries report_emailed_at — when its report was mailed to the families, NULL until it was — and never report_emailed_by, which is audit and renders nowhere. Each session row also carries `images`: {id, width, height} per photo, ordered by (created_at, id), with the uploader deliberately off the wire for the same reason the sender is. The key sits directly on the session rather than under a versioned name, because the gedu contracts schema is tolerant of unknown keys. The document carries two more members, both of them inputs to the client-side staffing derivation rather than answers from it: `gedus`, every assignment period the group has had, ended ones included, as {id, first_name, role, started_at, ended_at}, so the client places each session in the period containing its start and a past session keeps the gedu who held the group then; and `substitutions`, every NON-WITHDRAWN substitution request on the group, unbounded, in the one shape substitution_request_document defines and every substitution write returns. Withdrawn is the one status that does not travel, because it changes nothing about who is expected. The client merges substitutions onto its entries by date, and a projected date with no session row carries its requests like any other. `reason` and `reason_note` ride for an ADMIN caller only — this document is served to an admin too, so the flag is the CALLER''s role rather than a property of the RPC, which is what keeps a `sick` category off a colleague''s screen while the one document stays one document. `offer_count` rides for an admin and for the requester themselves. The GATE is gedu_teaches_group, which admits a live substitution on the group, so a sub opens the workspace they are substituting. It is the ONE caller that asks substitution_request_document to reveal the requester explicitly. The workspace is reached only by staff on the group and its session card''s staffing line names who is away; the REASON rides on the admin flag alone, so a colleague learns that somebody is absent and never that it was `sick`. `trainees` names the group''s trainee seats as {id, first_name} in placement order, drawn as Trainee-marked chips after the group''s gedus on every workspace shell; a trainee is not in `gedus`, and a trainee cannot read this document — gedu_teaches_group has no trainee arm, and their own read is get_trainee_group_feed. `viewer_temporary_seat` is NULL for an admin and for a gedu holding a current period on the group, who write and mail every session; for anyone else — a substitute, or a gedu taken off the group and still in its window — it is {writes_every_session, session_dates, voice_dates, teaches_product}: whether a live substitution lets them write every session (gedu_writes_group_session); the dates they hold the group for — the dates they substitute and the dates their ended assignment still holds — which are the only sessions they may mail; the dates whose voice room admits them, which are the substitution dates alone, because is_voice_group_member admits an ended assignment to no room; and whether they hold a current period on any group of the product, which admits them to every room of it, this one included. The page reads the window from here and never derives one.';

REVOKE ALL ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) TO service_role;
