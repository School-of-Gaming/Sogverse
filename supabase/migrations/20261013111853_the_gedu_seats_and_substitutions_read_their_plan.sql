-- The gedu's seats and every substitution surface read their sessions from the
-- database's plan.
--
-- The gedu My SOG cards, the absence picker (web and Discord /sub) and the
-- session facts every substitution surface draws walked the product's weekly
-- slots in TypeScript — forwards from now for the cards and the picker, and
-- backwards from a stored date for a request. This hands them the plan instead:
--
--   * each standing seat (assignment or trainee) of gedu_assigned_products
--     carries its group's planned sessions from the day before the
--     product-local today to the group's plan horizon, each flagged when the
--     group cancelled it;
--   * each substitution seat carries the instants of its substituted session;
--   * the pool, the admin queue, the gedu's own live requests and the
--     notification snapshot carry the instants of each request's session.
--
-- A session's instants are derive_group_session_window's bounds: NULL when the
-- plan has no session on the date — an orphaned date, after the schedule moved
-- off its weekday, or one outside the product's term.
--
-- `cancelled_dates` stays on the seat rows for now; nothing reads it.


-- A standing seat's planned sessions ------------------------------------------

CREATE FUNCTION public.group_upcoming_planned_sessions(p_group_id uuid)
    RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'session_date', planned.session_date,
               'starts_at',    planned.starts_at,
               'ends_at',      planned.ends_at,
               'cancelled',    g.id = ANY (planned.cancelled_group_ids)
             )
             ORDER BY planned.session_date, planned.starts_at
           ),
           '[]'::jsonb
         )
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   CROSS JOIN LATERAL public.planned_group_sessions(
         p.id,
         -- The day before the product-local today, so a session still running
         -- past midnight is in.
         (now() AT TIME ZONE p.timezone)::date - 1,
         public.session_plan_horizon(p.id, g.id)
       ) AS planned
   WHERE g.id = p_group_id;
$$;

COMMENT ON FUNCTION public.group_upcoming_planned_sessions(p_group_id uuid) IS 'Internal: a group''s planned sessions (planned_group_sessions) from the day before the product-local today to session_plan_horizon for the group, as a jsonb array of {session_date, starts_at, ends_at, cancelled}, soonest first, `cancelled` true where the group has cancelled that date. The day before so a session still running past midnight is in; the horizon so an open-ended product''s list holds its first eight sessions that have not ended plus the group''s next running one. A gedu''s standing seat reads it, through gedu_assigned_products, to name the next session and to list the sessions an absence can be filed for. An empty array for a group that does not exist. Dates and the flag only: never who cancelled or why. SECURITY INVOKER, reached from inside SECURITY DEFINER readers.';

REVOKE ALL ON FUNCTION public.group_upcoming_planned_sessions(p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_upcoming_planned_sessions(p_group_id uuid) TO service_role;


-- The gedu's seats ----------------------------------------------------------------

DROP FUNCTION public.get_my_assigned_products();
DROP FUNCTION public.get_assigned_products_for_discord_user(text);
DROP FUNCTION public.gedu_assigned_products(uuid);

CREATE FUNCTION public.gedu_assigned_products(p_gedu_id uuid)
    RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean, upcoming_sessions jsonb, substitution_starts_at timestamptz, substitution_ends_at timestamptz)
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
    false,
    public.group_upcoming_planned_sessions(a.group_id),
    NULL::timestamptz,
    NULL::timestamptz
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
    public.group_session_is_cancelled(r.group_id, r.session_date),
    -- A substitution is one afternoon, not a run: its card and the picker read
    -- the substituted session's own instants below, never the group's plan.
    '[]'::jsonb,
    lower(sw.session_window),
    upper(sw.session_window)
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
    public.group_upcoming_cancelled_dates(t.group_id),
    false,
    public.group_upcoming_planned_sessions(t.group_id),
    NULL::timestamptz,
    NULL::timestamptz
  FROM public.gedu_group_trainees t
  JOIN public.products p ON p.id = t.product_id
  WHERE t.gedu_id = p_gedu_id;
END;
$$;

COMMENT ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) IS 'Every product the given gedu has a seat on, one row per seat, with the product as session_product_document describes it — the one shell every substitution surface shares, slots included — how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). THREE KINDS OF SEAT, discriminated by `kind`: an `assignment` row per gedu_group_assignments row, with `substitution_date` null; a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides; and a `trainee` row per gedu_group_trainees seat, shaped like an assignment row (substitution_date null, substitution_cancelled false). gedu_holds_unexpired_substitution rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: the product shell, a date, two head counts, `cancelled_dates` (group_upcoming_cancelled_dates, dates only); `substitution_cancelled` — whether the substituted date itself is cancelled (group_session_is_cancelled), asked of the date because the substitution card stands for days after it, and false on the other kinds; and `substitution_starts_at`/`substitution_ends_at` — the substituted session''s instants, derive_group_session_window''s bounds, NULL where the plan has no session on the date (an orphaned date, or one outside the term) and NULL on the other kinds. `upcoming_sessions` is the standing seat''s group''s plan (group_upcoming_planned_sessions: {session_date, starts_at, ends_at, cancelled} from the day before the product-local today to the group''s plan horizon), which the card names its next session from and the absence picker lists; the empty array on a substitution row, which is one afternoon rather than a run. One RPC rather than three because the kinds share every product fact and the dashboard card differs in its chrome rather than in the facts it needs.';

REVOKE ALL ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) FROM PUBLIC;

CREATE FUNCTION public.get_my_assigned_products()
    RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean, upcoming_sessions jsonb, substitution_starts_at timestamptz, substitution_ends_at timestamptz)
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
REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_assigned_products() TO service_role;

CREATE FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text)
    RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean, upcoming_sessions jsonb, substitution_starts_at timestamptz, substitution_ends_at timestamptz)
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
REVOKE ALL ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) FROM anon;
REVOKE ALL ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) TO service_role;


-- The gedu's own live requests -----------------------------------------------

CREATE OR REPLACE FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           jsonb_agg(
             -- The request as its requester reads it, plus the session it is
             -- on: the group's name, the product as session_product_document
             -- describes it — the one shell every substitution surface shares —
             -- the session's instants from the plan, and whether that session
             -- is cancelled. A cancelled session's request stays in this list,
             -- because the filing write still refuses a second one there; a
             -- surface that describes requests hides it, as the pool and the
             -- admin page do.
             public.substitution_request_document(r, false, p_gedu_id)
               || jsonb_build_object(
                    'group_name',        g.name,
                    'product',           public.session_product_document(p),
                    'starts_at',         lower(sw.session_window),
                    'ends_at',           upper(sw.session_window),
                    'session_cancelled', public.group_session_is_cancelled(r.group_id, r.session_date)
                  )
             ORDER BY r.session_date, r.group_id
           ),
           '[]'::jsonb
         )
    FROM public.session_substitution_requests r
    JOIN public.product_groups g ON g.id = r.group_id
    JOIN public.products p       ON p.id = g.product_id
   CROSS JOIN LATERAL public.derive_group_session_window(r.group_id, r.session_date) AS sw(session_window)
   WHERE r.requested_by = p_gedu_id
     -- The first clause of gedu_is_expected_at_session: a non-withdrawn
     -- request, open or substituted, means its filer is not coming.
     AND r.status <> 'withdrawn'::public.substitution_request_status
     -- The filing write's own past-session bound, in the product's zone.
     AND r.session_date >= (now() AT TIME ZONE p.timezone)::date;
$$;

COMMENT ON FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) IS 'Internal: the given gedu''s LIVE substitution requests — every request they filed whose status is not withdrawn (open or substituted), dated today or later in the product''s timezone — as an array of request documents read as the requester reads their own (substitution_request_document with no reason, the viewer being the gedu, so the offer count and the substitute''s name travel), each extended with `group_name`, `product` — the session''s product as session_product_document describes it — `starts_at`/`ends_at`, the session''s instants (derive_group_session_window''s bounds, NULL where the plan has no session on the date), and `session_cancelled` (group_session_is_cancelled), ordered by date then group. The Substitutions page draws its "Your requests" cards from them, leaving out a cancelled session''s request as the pool and the admin page do. "Live" is the first clause of gedu_is_expected_at_session, so a (group, date) here is exactly one file_session_substitution_request refuses with 42501, and a withdrawn request, which lets the gedu ask again, is never here. A request on a cancelled session is included, because cancelling hides a request rather than withdrawing it and the write still refuses a second filing there. The lower bound is the write''s own past-session bound. Behind get_my_live_substitution_requests (the web, for auth.uid()) and get_live_substitution_requests_for_discord_user (the Discord bot, for the linked gedu); makes no role test of its own. Granted to nobody.';


-- The pool --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_open_substitution_requests() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- The pool list: every open request the caller could actually take. The
  -- exclusion is the `may substitute` predicate itself rather than a hand-written
  -- copy of its clauses, so the list and the offer button can never disagree —
  -- a session the gedu is expected at, one they have their own request on, and
  -- their own absence are all out by construction. The qualification, language
  -- and coverage predicates are the offer's other three tests and are asked
  -- here for the same reason: a request on a product the caller is not
  -- qualified for, that is run in a language they have not listed, or whose
  -- site is outside their coverage areas, is not in their pool.
  --
  -- A request the caller DECLINED stays in the list, marked by my_response, so
  -- they can still change their mind and offer.
  --
  -- The ABSENT GEDU IS NOT NAMED. Naming them half-reveals a private reason
  -- (everybody knows who is off sick), and the seat being substituted belongs to the
  -- group rather than to a person the volunteer needs to know about.
  --
  -- No upper bound on the date: the list matches the notification DMs, which go
  -- out when a request is filed, however far ahead its session is.
  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'request_id',   r.id,
               'group_id',     r.group_id,
               'group_name',   g.name,
               'session_date', r.session_date,
               -- The session's instants from the plan; NULL on a date the plan
               -- no longer has.
               'starts_at',    lower(sw.session_window),
               'ends_at',      upper(sw.session_window),
               'role',         r.role,
               -- The fee for THIS role, and null when the product has not set
               -- one. Null is a blank field rather than a volunteer session: the
               -- surface shows nothing and flags nothing, which is the existing
               -- treatment of a missing assistant fee.
               'fee_cents',
                 CASE r.role
                   WHEN 'primary'::public.gedu_assignment_role
                     THEN p.primary_gedu_fee_cents
                   ELSE p.assistant_gedu_fee_cents
                 END,
               -- The caller's own answer — 'offer', 'decline' or null when
               -- they have not answered — and never anybody else's.
               'my_response', (
                 SELECT o.response
                   FROM public.session_substitution_offers o
                  WHERE o.request_id = r.id
                    AND o.gedu_id    = v_caller
               ),
               -- The session, described exactly as every other substitution
               -- surface describes it.
               'product', public.session_product_document(p)
             )
             ORDER BY r.session_date, p.id, g.name, r.id
           )
      FROM public.session_substitution_requests r
      JOIN public.product_groups g ON g.id = r.group_id
      JOIN public.products p       ON p.id = g.product_id
     CROSS JOIN LATERAL public.derive_group_session_window(r.group_id, r.session_date) AS sw(session_window)
     WHERE r.status = 'open'::public.substitution_request_status
       AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
       AND public.gedu_may_substitute_session(
             v_caller, r.group_id, r.session_date, r.requested_by
           )
       AND public.gedu_holds_session_qualifications(v_caller, r.group_id)
       AND public.gedu_speaks_session_language(v_caller, r.group_id)
       AND public.gedu_covers_product_site(v_caller, p.id)
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_open_substitution_requests() IS 'The gedu dashboard''s "Sessions needing a substitute": every `open` request dated today or later in the product''s timezone, however far ahead, that the CALLER could actually take. The exclusion is the offer''s own four tests — gedu_may_substitute_session, gedu_holds_session_qualifications, gedu_speaks_session_language and gedu_covers_product_site — rather than a copy of their clauses, so this list and the offer button can never disagree: a request on a product whose qualifications the caller does not hold, that is run in a language the caller has not listed, or that is in person at a site outside the caller''s coverage areas, is not in their pool. A gedu who has listed no language sees none, and one who has ticked no coverage area sees online sessions only. Each line carries the session''s product as session_product_document describes it — the one shell every substitution surface shares — plus the group name, the date, the session''s instants `starts_at`/`ends_at` (derive_group_session_window''s bounds, NULL where the plan has no session on the date), the role and THAT ROLE''s fee (null when the product has not set one — a blank field, not a volunteer session), and my_response: the caller''s own answer, `offer`, `decline` or null. A request the caller declined stays in the list, so they can still offer. The ABSENT GEDU IS DELIBERATELY NOT NAMED: naming them half-reveals a private reason, and the seat belongs to the group. Gedu-gated on its first statement; an uncertified gedu gets an empty list, because certification is one of the may-substitute predicate''s refusals.';


-- The admin queue ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_substitution_requests() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN COALESCE((
    SELECT jsonb_agg(q.doc ORDER BY q.session_date, q.product_id, q.id)
      FROM (
        SELECT r.id,
               r.session_date,
               p.id AS product_id,
               jsonb_build_object(
                 'id',           r.id,
                 'status',       r.status,
                 'group_id',     r.group_id,
                 'group_name',   g.name,
                 'session_date', r.session_date,
                 -- The session's instants from the plan; NULL on a date the
                 -- plan no longer has, which the page sorts on its day.
                 'starts_at',    lower(sw.session_window),
                 'ends_at',      upper(sw.session_window),
                 'role',         r.role,
                 'reason',       r.reason,
                 'reason_note',  r.reason_note,
                 'created_at',   r.created_at,
                 'requested_by', r.requested_by,
                 'requested_by_first_name', rq.first_name,
                 'requested_by_last_name',  rq.last_name,
                 'substitute_id',           r.substitute_id,
                 'substitute_first_name',   sp.first_name,
                 'substitute_last_name',    sp.last_name,
                 'approved_at',             r.approved_at,
                 'approved_by',             r.approved_by,
                 'approved_by_first_name',  ap.first_name,
                 'approved_by_last_name',   ap.last_name,
                 -- The session, described exactly as every other substitution
                 -- surface describes it — venue or remote included.
                 'product', public.session_product_document(p),
                 -- Offers are the open question; a substituted row has had it
                 -- answered, so it carries none. Only the answers that ARE
                 -- offers: a decline cannot be approved.
                 'offers', CASE
                   WHEN r.status = 'open'::public.substitution_request_status
                   THEN COALESCE((
                     SELECT jsonb_agg(
                              jsonb_build_object(
                                'id',           o.id,
                                'gedu_id',      o.gedu_id,
                                'first_name',   op.first_name,
                                'last_name',    op.last_name,
                                'responded_at', o.responded_at
                              )
                              ORDER BY o.responded_at, o.id
                            )
                       FROM public.session_substitution_offers o
                       JOIN public.profiles op ON op.id = o.gedu_id
                      WHERE o.request_id = r.id
                        AND o.response = 'offer'::public.substitution_offer_response
                   ), '[]'::jsonb)
                   ELSE '[]'::jsonb
                 END,
                 -- Who said they cannot, on an open row — for the office to
                 -- read, with nothing to act on. Their ids and names only.
                 'declines', CASE
                   WHEN r.status = 'open'::public.substitution_request_status
                   THEN COALESCE((
                     SELECT jsonb_agg(
                              jsonb_build_object(
                                'gedu_id',      o.gedu_id,
                                'first_name',   op.first_name,
                                'last_name',    op.last_name,
                                'responded_at', o.responded_at
                              )
                              ORDER BY o.responded_at, o.id
                            )
                       FROM public.session_substitution_offers o
                       JOIN public.profiles op ON op.id = o.gedu_id
                      WHERE o.request_id = r.id
                        AND o.response = 'decline'::public.substitution_offer_response
                   ), '[]'::jsonb)
                   ELSE '[]'::jsonb
                 END
               ) AS doc
          FROM public.session_substitution_requests r
          JOIN public.product_groups g ON g.id = r.group_id
          JOIN public.products p       ON p.id = g.product_id
          JOIN public.profiles rq      ON rq.id = r.requested_by
          -- LEFT only because an open row has no substitute and no approver;
          -- chk_substitution_state sets both on every substituted row.
          LEFT JOIN public.profiles sp ON sp.id = r.substitute_id
          LEFT JOIN public.profiles ap ON ap.id = r.approved_by
         CROSS JOIN LATERAL public.derive_group_session_window(r.group_id, r.session_date) AS sw(session_window)
         WHERE r.status IN (
                 'open'::public.substitution_request_status,
                 'substituted'::public.substitution_request_status
               )
           AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
           -- Cancellation: a cancelled session needs no cover, so its requests
           -- leave both lists. They are kept, not withdrawn, so restoring the
           -- session brings them back as they were.
           AND NOT public.group_session_is_cancelled(r.group_id, r.session_date)
      ) q
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_admin_substitution_requests() IS 'The admin Substitutions page: a bare ARRAY of every OPEN and every SUBSTITUTED request dated today or later in its product''s timezone, ordered by date then product then id; the client splits it by `status` into the queue still to staff and the sessions that already have a substitute. Each row carries the group, the session''s product as session_product_document describes it — the one shell every substitution surface shares, so the remote flag, the venue, the topic and the language reach the office exactly as they reach a volunteer — the session''s instants `starts_at`/`ends_at` (derive_group_session_window''s bounds, NULL where the plan has no session on the date), the requester''s name, the role being substituted, the reason and note, and — on a substituted row — the substitute''s id and name, approved_at, and the approving admin''s id and name; those keys are JSON null on an open row, so the document keeps one shape. An open row carries every OFFER — {id, gedu_id, first_name, last_name, responded_at}, ordered by when it was given — and every DECLINE — {gedu_id, first_name, last_name, responded_at} — the offerer''s or decliner''s NAME AND NOTHING ELSE; a substituted row''s offers and declines are always the empty array, because the approval answered them. One read for both lists, so an approval moves a row between them in one refetch. An empty array is the all-clear. A request whose date has PASSED drops out on its own: "unfilled" is a derived state of an open request and not something an admin can still act on, and a past substitution is history the group''s own page carries. A request the plan no longer has a session for stays in, with NULL instants, because this orders by DATE and never by an instant. Withdrawn requests are history and never appear. An offer carries NO certified flag and NO criminal_record_check_at, and that is about the data rather than the design: an uncertified gedu cannot hold an offer, because gedu_may_substitute_session requires `certified` and guards every path that creates one, approval re-asks it under the request''s lock and set_session_substitution asks it too — so a "certified" chip was true by construction, and the one case it could have caught (an offerer de-certified after offering) is refused at approval with a message the admin reads. The extract stamp is children''s-safety data about a contractor and is not emitted to a surface that does not act on it. A bare array rather than an object of members, exactly as the gedu''s own pool read returns one. Admin-only, guard-first. The reason travels to admins only: here, in the admin session document, and in the notification snapshot, which is service-role only and is read to post the request to the admins'' Slack channel — a `sick` category is health data about a contractor.';


-- The notification snapshot ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_substitution_notification_snapshot(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row     public.session_substitution_requests;
  v_group   public.product_groups;
  v_product public.products;
  v_window  tstzrange;
BEGIN
  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_group FROM public.product_groups g WHERE g.id = v_row.group_id;
  SELECT * INTO v_product FROM public.products p WHERE p.id = v_group.product_id;
  -- The session's instants from the plan; NULL on a date the plan no longer has.
  v_window := public.derive_group_session_window(v_row.group_id, v_row.session_date);

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id',           v_row.id,
      'status',       v_row.status,
      'group_id',     v_row.group_id,
      'group_name',   v_group.name,
      'session_date', v_row.session_date,
      'starts_at',    lower(v_window),
      'ends_at',      upper(v_window),
      'role',         v_row.role,
      -- The fee for THIS role, null when the product has not set one — the
      -- pool's own rule.
      'fee_cents',
        CASE v_row.role
          WHEN 'primary'::public.gedu_assignment_role
            THEN v_product.primary_gedu_fee_cents
          ELSE v_product.assistant_gedu_fee_cents
        END,
      'reason',       v_row.reason,
      'reason_note',  v_row.reason_note,
      'created_at',   v_row.created_at,
      'approved_at',  v_row.approved_at,
      -- The requester is told when the request is filled, so they come with
      -- the locale that DM is written in and the Discord account it goes to —
      -- only the account that ACTS as them, as for every DM.
      'requester', (
        SELECT jsonb_build_object(
                 'id',         pr.id,
                 'first_name', pr.first_name,
                 'last_name',  pr.last_name,
                 'locale',     pr.locale,
                 'discord_user_id', (
                   SELECT l.discord_user_id
                     FROM public.discord_links l
                    WHERE l.profile_id = pr.id
                      AND public.discord_acting_gedu(l.discord_user_id) = pr.id
                 )
               )
          FROM public.profiles pr
         WHERE pr.id = v_row.requested_by
      ),
      'substitute', (
        SELECT jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name)
          FROM public.profiles pr
         WHERE pr.id = v_row.substitute_id
      ),
      'approver', (
        SELECT jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name)
          FROM public.profiles pr
         WHERE pr.id = v_row.approved_by
      )
    ),
    'product',                 public.session_product_document(v_product),
    'required_qualifications', to_jsonb(public.product_required_qualifications(v_product.product_type, v_product.tag)),
    'is_cancelled',            public.group_session_is_cancelled(v_row.group_id, v_row.session_date),
    'product_today',           (now() AT TIME ZONE v_product.timezone)::date,
    'candidates', COALESCE((
      WITH eligible AS (
        -- Exactly the pool's four tests, so a DM goes to exactly the gedus
        -- whose pool lists the request.
        SELECT pr.id
          FROM public.profiles pr
         WHERE pr.role = 'gedu'::public.user_role
           AND public.gedu_may_substitute_session(
                 pr.id, v_row.group_id, v_row.session_date, v_row.requested_by
               )
           AND public.gedu_holds_session_qualifications(pr.id, v_row.group_id)
           AND public.gedu_speaks_session_language(pr.id, v_row.group_id)
           AND public.gedu_covers_product_site(pr.id, v_product.id)
      ),
      candidate AS (
        SELECT e.id AS gedu_id FROM eligible e
        UNION
        SELECT o.gedu_id
          FROM public.session_substitution_offers o
         WHERE o.request_id = v_row.id
        UNION
        SELECT d.gedu_id
          FROM public.substitution_notification_dms d
         WHERE d.request_id = v_row.id
        UNION
        -- The seated substitute, who may never have answered or been sent a
        -- DM (an admin can seat anyone) and is no longer eligible once
        -- expected at the session — the sync still owes them their DM.
        SELECT v_row.substitute_id
         WHERE v_row.substitute_id IS NOT NULL
      )
      SELECT jsonb_agg(
               jsonb_build_object(
                 'gedu_id',    c.gedu_id,
                 'first_name', pr.first_name,
                 'last_name',  pr.last_name,
                 'locale',     pr.locale,
                 -- E.164 digits without the plus, or null; the staff channel
                 -- lists it so an admin can ring a gedu about the session.
                 'phone',      pr.phone,
                 -- Only the Discord account that ACTS as this gedu: one linked
                 -- to a second gedu account more recently answers for that
                 -- account, and a DM to it would be answered as the wrong
                 -- person.
                 'discord_user_id', (
                   SELECT l.discord_user_id
                     FROM public.discord_links l
                    WHERE l.profile_id = c.gedu_id
                      AND public.discord_acting_gedu(l.discord_user_id) = c.gedu_id
                 ),
                 'eligible',     EXISTS (SELECT 1 FROM eligible e WHERE e.id = c.gedu_id),
                 'response',     o.response,
                 'offer_id',     o.id,
                 'responded_at', o.responded_at
               )
               ORDER BY pr.first_name, pr.last_name, c.gedu_id
             )
        FROM candidate c
        JOIN public.profiles pr ON pr.id = c.gedu_id
        LEFT JOIN public.session_substitution_offers o
               ON o.request_id = v_row.id
              AND o.gedu_id    = c.gedu_id
    ), '[]'::jsonb),
    'notification', (
      SELECT to_jsonb(n)
        FROM public.substitution_notifications n
       WHERE n.request_id = v_row.id
    ),
    'dms', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.gedu_id)
        FROM public.substitution_notification_dms d
       WHERE d.request_id = v_row.id
    ), '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_substitution_notification_snapshot(p_request_id uuid) IS 'Everything the notification sync renders a substitution request''s Slack message and Discord DMs from, or NULL when the request does not exist. `request`: the row with its group name, the session''s instants `starts_at`/`ends_at` (derive_group_session_window''s bounds, NULL where the plan has no session on the date), the fee for its role (null when unset), the reason and note, the substitute and approver as {id, first_name, last_name} (null when unset), and the requester as {id, first_name, last_name, locale, discord_user_id}, the last non-null only when that Discord account acts as the requester (discord_acting_gedu). `product`: session_product_document, the shell every substitution surface shares. `required_qualifications`, `is_cancelled` (group_session_is_cancelled), and `product_today`, the date in the product''s zone, which tells a passed request from an open one. `candidates`: every gedu eligible now — exactly the pool''s four tests, gedu_may_substitute_session, gedu_holds_session_qualifications, gedu_speaks_session_language and gedu_covers_product_site — together with every gedu who has answered, every gedu who was sent a DM and the seated substitute, each with their name, locale, phone (E.164 digits, no plus; null when unset), `eligible`, their answer (response, offer_id, responded_at; null when none) and discord_user_id, which is non-null only when that Discord account acts as this gedu (discord_acting_gedu). `notification` and `dms`: the message records as stored. Carries the reason and phone numbers, so it is for the service role alone.';
