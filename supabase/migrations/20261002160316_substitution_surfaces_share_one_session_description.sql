-- Every substitution surface describes the session the same way.
--
-- Three reads state a substituted session: the gedus' pool, the admin
-- Substitutions page, and the approved sub's own card on My SOG (the
-- `substitution` arm of the gedu's seat read). Each built its own product shell
-- by hand, and they had drifted: the admin page's carried no venue, no topic and
-- no language, so the office could not tell an online session from an
-- in-person one, or where the in-person one was.
--
-- One internal function, `session_product_document`, now builds that shell from
-- a product row — type, topic, spoken language, timezone, the remote flag, the
-- venue on an in-person product, the term dates, the translations and the
-- schedule slots — and every one of the three reads calls it. A fact about the
-- session added there reaches every reader at once. It carries nothing about a
-- person, so calling it can never widen what a read discloses: anonymity, the
-- reason, offers and the fee all stay where they were, in each read's own body.
--
-- The seat read is RETURNS TABLE, so its product columns are replaced by one
-- `product` column holding the same document, and the function is dropped and
-- recreated. Its assignment and trainee arms take the same document: they are
-- arms of one UNION and describe the same products.

-- ---------------------------------------------------------------------------
-- The shared shell
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.session_product_document(p_product public.products)
RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'id',                   p_product.id,
    'product_type',         p_product.product_type,
    'topic',                p_product.topic,
    'spoken_language_code', p_product.spoken_language_code,
    'timezone',             p_product.timezone,
    'is_remote',            p_product.is_remote,
    'start_date',           p_product.start_date,
    'end_date',             p_product.end_date,
    -- The venue, on in-person products only. The test is the remote flag and
    -- never the presence of a location: a remote municipality club carries a
    -- location_id (a municipality, by CHECK) and has no building.
    'site_name', (
      SELECT l.name
        FROM public.locations l
       WHERE l.id = p_product.location_id
         AND p_product.is_remote = false
    ),
    -- `description` is the short teaser; the output key predates the column's
    -- `short_description` name and every reader parses it under this one.
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
               ORDER BY pt.locale
             )
        FROM public.product_translations pt
       WHERE pt.product_id = p_product.id
    ), '[]'::jsonb),
    -- Slots and never an instant: the client owns the calendar maths on every
    -- surface, so the reader is handed the date's product, not its start.
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM public.schedule_slots ss
       WHERE ss.product_id = p_product.id
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.session_product_document(public.products) IS 'Internal: the ONE description of the product a session belongs to, as every substitution surface states it — id, type, topic, spoken language, timezone, the remote flag, the venue (site_name, the location''s name on an in-person product and null on a remote one, tested on is_remote because a remote municipality club still carries a location), the term dates, the translations (locale, name, and the short teaser as `description`) and the schedule slots. Called by get_open_substitution_requests, get_admin_substitution_requests and get_my_assigned_products, so the gedus'' pool, the admin Substitutions page and the sub''s own card on My SOG cannot disagree about the session, and a fact added here reaches all three. It carries NOTHING about a person, which is what makes it safe to share: who is absent, why, who offered and what the role pays stay in each reader''s own body under that reader''s own rules. Slots and never an instant — the client owns the calendar maths. SECURITY INVOKER and reached only from inside SECURITY DEFINER readers, so it reads as their owner; not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.session_product_document(public.products) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.session_product_document(public.products) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_product_document(public.products) TO service_role;

-- ---------------------------------------------------------------------------
-- The gedus' pool
-- ---------------------------------------------------------------------------

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
  -- their own absence are all out by construction.
  --
  -- The ABSENT GEDU IS NOT NAMED. Naming them half-reveals a private reason
  -- (everybody knows who is off sick), and the seat being substituted belongs to the
  -- group rather than to a person the volunteer needs to know about.
  --
  -- Bounded to the next 60 days, which is a list bound and not a rule: a request
  -- further out than that exists and is staffable from the admin queue.
  --
  -- The client owns the calendar math, exactly as both feeds do — this emits the
  -- date plus the product's slots and timezone and computes no instant.
  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'request_id',   r.id,
               'group_id',     r.group_id,
               'group_name',   g.name,
               'session_date', r.session_date,
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
               'has_offered', EXISTS (
                 SELECT 1
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
     WHERE r.status = 'open'::public.substitution_request_status
       AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
       AND r.session_date <= (now() AT TIME ZONE p.timezone)::date + 60
       AND public.gedu_may_substitute_session(
             v_caller, r.group_id, r.session_date, r.requested_by
           )
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_open_substitution_requests() IS 'The gedu dashboard''s "Sessions needing a substitute": every `open` request dated today or later in the product''s timezone, within the next 60 days, that the CALLER could actually take. The exclusion is gedu_may_substitute_session itself rather than a copy of its clauses, so this list and the offer button can never disagree. Each line carries the session''s product as session_product_document describes it — the one shell every substitution surface shares — plus the group name, the date, the role and THAT ROLE''s fee (null when the product has not set one — a blank field, not a volunteer session), and whether the caller has already offered. The ABSENT GEDU IS DELIBERATELY NOT NAMED: naming them half-reveals a private reason, and the seat belongs to the group. Contains no schedule expansion — the client owns the calendar math, exactly as both feeds do. Gedu-gated on its first statement; an uncertified gedu gets an empty list, because certification is one of the predicate''s four refusals.';

-- ---------------------------------------------------------------------------
-- The admin Substitutions page
-- ---------------------------------------------------------------------------

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
                 -- answered, so it carries none.
                 'offers', CASE
                   WHEN r.status = 'open'::public.substitution_request_status
                   THEN COALESCE((
                     SELECT jsonb_agg(
                              jsonb_build_object(
                                'id',         o.id,
                                'gedu_id',    o.gedu_id,
                                'first_name', op.first_name,
                                'last_name',  op.last_name,
                                'created_at', o.created_at
                              )
                              ORDER BY o.created_at, o.id
                            )
                       FROM public.session_substitution_offers o
                       JOIN public.profiles op ON op.id = o.gedu_id
                      WHERE o.request_id = r.id
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

COMMENT ON FUNCTION public.get_admin_substitution_requests() IS 'The admin Substitutions page: a bare ARRAY of every OPEN and every SUBSTITUTED request dated today or later in its product''s timezone, ordered by date then product then id; the client splits it by `status` into the queue still to staff and the sessions that already have a substitute. Each row carries the group, the session''s product as session_product_document describes it — the one shell every substitution surface shares, so the remote flag, the venue, the topic and the language reach the office exactly as they reach a volunteer — the requester''s name, the role being substituted, the reason and note, and — on a substituted row — the substitute''s id and name, approved_at, and the approving admin''s id and name; those keys are JSON null on an open row, so the document keeps one shape. An open row carries every offer with its offerer''s NAME AND NOTHING ELSE; a substituted row''s offers are always the empty array, because the approval answered them. One read for both lists, so an approval moves a row between them in one refetch. An empty array is the all-clear. A request whose date has PASSED drops out on its own: "unfilled" is a derived state of an open request and not something an admin can still act on, and a past substitution is history the group''s own page carries. A request the schedule no longer projects stays in, because this orders by DATE and never by a derived instant. Withdrawn requests are history and never appear. An offer carries NO certified flag and NO criminal_record_check_at, and that is about the data rather than the design: an uncertified gedu cannot hold an offer, because gedu_may_substitute_session requires `certified` and guards every path that creates one, approve_session_substitution_offer re-asks it under the request''s lock and set_session_substitution asks it too — so a "certified" chip was true by construction, and the one case it could have caught (an offerer de-certified after offering) is refused at approval with a message the admin reads. The extract stamp is children''s-safety data about a contractor and is not emitted to a surface that does not act on it. A bare array rather than an object of members, exactly as the gedu''s own pool read returns one. Admin-only, guard-first. SLOTS and not an instant: the client owns the calendar maths on every substitution surface, exactly as both session feeds do. This is the ONLY gedu-visible-reason surface besides the admin session document — a `sick` category is health data about a contractor.';

-- ---------------------------------------------------------------------------
-- The gedu's seats, the substitution card's read among them
-- ---------------------------------------------------------------------------

-- RETURNS TABLE changes shape, which CREATE OR REPLACE cannot do.
DROP FUNCTION public.get_my_assigned_products();

CREATE FUNCTION public.get_my_assigned_products()
RETURNS TABLE(
  group_id uuid,
  product jsonb,
  group_count integer,
  participant_count integer,
  kind text,
  substitution_date date,
  cancelled_dates date[],
  substitution_cancelled boolean
)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

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
  WHERE r.substitute_id = v_gedu_id
    AND r.status     = 'substituted'::public.substitution_request_status
    AND public.gedu_holds_unexpired_substitution(r.group_id, r.session_date)

  UNION ALL

  -- The caller's TRAINEE seats, one row per seat, shaped like an assignment
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
  WHERE t.gedu_id = v_gedu_id;
END;
$$;

COMMENT ON FUNCTION public.get_my_assigned_products() IS 'Every product the calling gedu has a seat on, one row per seat, with the product as session_product_document describes it — the one shell every substitution surface shares, slots included — how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). Gedu-gated on its first statement. THREE KINDS OF SEAT, discriminated by `kind`: an `assignment` row per gedu_group_assignments row, with `substitution_date` null; a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides; and a `trainee` row per gedu_group_trainees seat, shaped like an assignment row (substitution_date null, substitution_cancelled false). gedu_holds_unexpired_substitution rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: the product shell, a date, two head counts, and `cancelled_dates` — the row''s group''s upcoming cancelled dates (group_upcoming_cancelled_dates), dates only, which the card skips when naming the next session and the absence picker never offers; and `substitution_cancelled` — whether the substituted date itself is cancelled (group_session_is_cancelled), asked of the date rather than of that window because the substitution card stands for days after it, and false on an assignment row. One RPC rather than three because the kinds share every product fact and the dashboard card differs in its chrome rather than in the facts it needs.';

REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_assigned_products() TO service_role;
