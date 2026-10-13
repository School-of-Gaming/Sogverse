-- The cancellation reads nothing asks for any more are retired.
--
-- Every surface now reads its sessions from the database's plan, which folds in
-- the dates each group cancelled, so the separate reads of cancelled dates have
-- no reader: the family's `get_my_session_cancellations`, the gedu seats'
-- `cancelled_dates` column with the `group_upcoming_cancelled_dates` helper
-- behind it, and the admin dashboard schedule's `cancelled_sessions`. The gedu
-- invoicing document's `schedule_slots` go with them: the gedu invoice is
-- built from the products' planned dates and never read the slots.
--
-- `get_session_cancellations_in_effect` stays; the partner API reads it.


-- The gedu's seats ----------------------------------------------------------------

DROP FUNCTION public.get_my_assigned_products();
DROP FUNCTION public.get_assigned_products_for_discord_user(text);
DROP FUNCTION public.gedu_assigned_products(uuid);

CREATE FUNCTION public.gedu_assigned_products(p_gedu_id uuid) RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, substitution_cancelled boolean, upcoming_sessions jsonb, substitution_starts_at timestamp with time zone, substitution_ends_at timestamp with time zone)
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
    -- Asked of the substituted date itself: the card stands for days after
    -- its date, so the flag has to hold once the date is behind today.
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
    false,
    public.group_upcoming_planned_sessions(t.group_id),
    NULL::timestamptz,
    NULL::timestamptz
  FROM public.gedu_group_trainees t
  JOIN public.products p ON p.id = t.product_id
  WHERE t.gedu_id = p_gedu_id;
END;
$$;

COMMENT ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) IS 'Every product the given gedu has a seat on, one row per seat, with the product as session_product_document describes it — the one shell every substitution surface shares, slots included — how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). THREE KINDS OF SEAT, discriminated by `kind`: an `assignment` row per gedu_group_assignments row, with `substitution_date` null; a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides; and a `trainee` row per gedu_group_trainees seat, shaped like an assignment row (substitution_date null, substitution_cancelled false). gedu_holds_unexpired_substitution rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: the product shell, a date, two head counts; `substitution_cancelled` — whether the substituted date itself is cancelled (group_session_is_cancelled), asked of the date because the substitution card stands for days after it, and false on the other kinds; and `substitution_starts_at`/`substitution_ends_at` — the substituted session''s instants, derive_group_session_window''s bounds, NULL where the plan has no session on the date (an orphaned date, or one outside the term) and NULL on the other kinds. `upcoming_sessions` is the standing seat''s group''s plan (group_upcoming_planned_sessions: {session_date, starts_at, ends_at, cancelled} from the day before the product-local today to the group''s plan horizon), which the card names its next session from and the absence picker lists; the empty array on a substitution row, which is one afternoon rather than a run. One RPC rather than three because the kinds share every product fact and the dashboard card differs in its chrome rather than in the facts it needs.';

REVOKE ALL ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) FROM PUBLIC;

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, substitution_cancelled boolean, upcoming_sessions jsonb, substitution_starts_at timestamp with time zone, substitution_ends_at timestamp with time zone)
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

CREATE FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, substitution_cancelled boolean, upcoming_sessions jsonb, substitution_starts_at timestamp with time zone, substitution_ends_at timestamp with time zone)
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


-- The cancelled-date reads -------------------------------------------------------

DROP FUNCTION public.group_upcoming_cancelled_dates(uuid);
DROP FUNCTION public.get_my_session_cancellations();


-- The admin dashboard's schedule ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_users     jsonb;
  v_queue     jsonb;
  v_attention jsonb;
  v_schedule  jsonb;
BEGIN
  PERFORM public.assert_admin();

  -- ---------------------------------------------------------------------------
  -- 1. The users strip: one tile per role, always all of them.
  --
  -- Driven by `enum_range` rather than by what `profiles` happens to contain, so
  -- a role with no accounts renders a zero tile instead of vanishing — and a
  -- role added to the enum later arrives here without an edit.
  --
  -- Two stats can be NULL rather than 0, and the difference is the point.
  -- `verified` is NULL for a role none of whose accounts holds a REAL address: a
  -- gamer in sign-in mode `parent` or `username` carries a synthetic
  -- @gamer.sogverse.internal handle nobody will ever click a link in, so "0
  -- verified" would report a problem that does not exist. A gamer in mode
  -- `email` holds a real mailbox and counts exactly like everyone else — which
  -- is why the test below is the ADDRESS and not the role. `certified`
  -- is the same NULL-means-no-meaning shape for a simpler reason: only an
  -- educator can be certified.
  --
  -- A role with no accounts at all still reports 0 rather than NULL — the
  -- addressable test only speaks about accounts that exist, and an empty tile
  -- has nothing to say either way.
  -- ---------------------------------------------------------------------------
  SELECT jsonb_agg(
           jsonb_build_object(
             'role',      r.role_name,
             'total',     COALESCE(c.total, 0),
             'verified',  CASE WHEN COALESCE(c.total, 0) > 0
                                 AND COALESCE(c.addressable, 0) = 0 THEN NULL
                               ELSE COALESCE(c.verified, 0) END,
             'certified', CASE WHEN r.role_name = 'gedu' THEN COALESCE(c.certified, 0)
                               ELSE NULL END
           )
           ORDER BY r.ord
         )
    INTO v_users
    FROM unnest(enum_range(NULL::public.user_role))
           WITH ORDINALITY AS r(role_name, ord)
    LEFT JOIN (
      SELECT pr.role,
             count(*)                                                 AS total,
             -- "Holds an address a human reads." True of every non-gamer, and
             -- of a gamer exactly when their parent chose sign-in mode `email`.
             -- A gamer row missing from gamer_profiles is a data error and
             -- lands on the conservative side: not addressable.
             count(*) FILTER (
               WHERE pr.role <> 'gamer' OR gmr.sign_in = 'email'
             )                                                        AS addressable,
             count(*) FILTER (
               WHERE pr.email_verified_at IS NOT NULL
                 AND (pr.role <> 'gamer' OR gmr.sign_in = 'email')
             )                                                        AS verified,
             count(*) FILTER (WHERE gp.certified)                      AS certified
        FROM public.profiles pr
        LEFT JOIN public.gedu_profiles gp   ON gp.user_id  = pr.id
        LEFT JOIN public.gamer_profiles gmr ON gmr.user_id = pr.id
       GROUP BY pr.role
    ) c ON c.role = r.role_name;

  -- ---------------------------------------------------------------------------
  -- 2. The certification queue: educators waiting on an admin's decision.
  --
  -- An INNER JOIN, deliberately. A gedu with no `gedu_profiles` row is a data
  -- error, and a LEFT JOIN would read that missing row as `certified = false` —
  -- putting a broken account in a queue whose only action (certify) writes to the
  -- row that is not there. Missing means excluded; the queue is for accounts that
  -- exist and are waiting.
  --
  -- `contract_accepted_at` is the candidate's standing against the
  -- CURRENT contract version, or NULL. It informs the certification decision and
  -- does not gate it — an unsigned candidate is still certifiable, and the admin
  -- is the one who decides what to make of the gap.
  --
  -- Standing is judged on the BASE version: a version string is
  -- `<base>/<language>` and the languages of one version are the same agreement,
  -- so signing either makes a candidate current. min() because a candidate may
  -- hold both languages' rows — the first signature is the moment they agreed,
  -- and a scalar subquery would error rather than answer.
  --
  -- `criminal_record_check_at` is when an admin recorded seeing this
  -- candidate's criminal record extract, or NULL if none has been recorded. The
  -- flag beside it is deliberately not shipped: the stamp is non-NULL exactly
  -- when the flag is true, so a second field could only ever contradict the
  -- first. It informs the decision on the same terms as the contract stamp and
  -- gates nothing either.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         pr.id,
               'first_name', pr.first_name,
               'last_name',  pr.last_name,
               'created_at', pr.created_at,
               'contract_accepted_at', (
                 SELECT min(ca.accepted_at)
                   FROM public.gedu_contract_acceptances ca
                  WHERE ca.gedu_id = pr.id
                    AND split_part(ca.contract_version, '/', 1) = (
                          SELECT split_part(v.version, '/', 1)
                            FROM public.gedu_contract_versions v
                           ORDER BY v.created_at DESC, v.version DESC
                           LIMIT 1
                        )
               ),
               'criminal_record_check_at', gp.criminal_record_check_at
             )
             ORDER BY pr.created_at, pr.id
           ),
           '[]'::jsonb
         )
    INTO v_queue
    FROM public.profiles pr
    JOIN public.gedu_profiles gp ON gp.user_id = pr.id
   WHERE pr.role = 'gedu'
     AND gp.certified = false;

  -- ---------------------------------------------------------------------------
  -- 3. The attention queue: live products with at least one thing wrong.
  --
  -- Seven kinds of wrong, and each is stated as the fact rather than as a
  -- sentence — the page words them, because the wording is translated copy.
  --
  --   * `unassigned_count`  — active seats sitting in no group. A child enrolled
  --                           and nobody looking after them is the worst of these.
  --   * `groups_without_gedu` — a group with members and no educator assigned.
  --   * `waitlist`          — people queueing while seats stand open AND those
  --                           seats have not all been offered to somebody. Only
  --                           meaningful on a capped product with the queue
  --                           switched on. NULL when there is nothing to say.
  --   * `empty_groups_without_gedu` — a group with no educator AND no active
  --                           member. An admin pre-building next term's groups
  --                           has not made a mistake, which is why this is a
  --                           SEPARATE and LOWER-ranked kind rather than part
  --                           of the one above — but it is still a loose end
  --                           somebody has to come back to, so it is named
  --                           rather than carved out of the group check.
  --   * `missing_gedu_fee`  — NULL, not zero. Zero is a volunteer session, which
  --                           is a decision somebody made; NULL is a blank field.
  --                           The assistant fee is never flagged — NULL there
  --                           means "no assistant", which is the ordinary case.
  --   * `missing_municipality_fee` — municipality clubs only; the CHECK already
  --                           forbids the column elsewhere.
  --   * `missing_invoice_customer` — municipality clubs only, on the same terms
  --                           as the fee beside it: the link is nullable because
  --                           a club is created before anybody has agreed who
  --                           pays for it, and by the time it starts both the
  --                           fee and the buyer are meant to be set. A club with
  --                           neither is one nobody can raise an invoice for, so
  --                           the omission belongs in the same queue as the fee's.
  --
  -- A product with none of them is not in the list at all.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(a.doc ORDER BY a.product_id), '[]'::jsonb)
    INTO v_attention
    FROM (
      WITH candidate AS (
        SELECT p.*
          FROM public.products p
         WHERE public.effective_status(p.id) IN ('pending', 'running')
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',                  c.id,
               'product_type',        c.product_type,
               'translations',        tr.items,
               'unassigned_count',    ua.n,
               'groups_without_gedu', gw.items,
               'empty_groups_without_gedu', eg.items,
               'waitlist',
                 CASE WHEN wl.open_seats IS NOT NULL
                      THEN jsonb_build_object(
                             'waitlist_count',   wl.waitlist_count,
                             'open_seats',       wl.open_seats,
                             -- How many of those open seats already have a
                             -- family thinking about them. Emitted so
                             -- the page can say why the number of open seats
                             -- and the size of the queue do not by themselves
                             -- explain the flag.
                             'live_offer_count', wl.live_offer_count
                           )
                 END,
               'missing_gedu_fee', (c.primary_gedu_fee_cents IS NULL),
               'missing_municipality_fee',
                 (c.product_type = 'municipality_club'
                  AND c.municipality_fee_cents IS NULL),
               'missing_invoice_customer',
                 (c.product_type = 'municipality_club'
                  AND c.invoice_customer_id IS NULL)
             ) AS doc
        FROM candidate c
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
          SELECT count(*) AS n
            FROM public.participations pa
           WHERE pa.product_id = c.id
             AND pa.status = 'active'
             AND pa.group_id IS NULL
        ) ua
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                          )
                 ), '[]'::jsonb) AS items
        ) gw
        -- The same question asked of the OTHER half of the unstaffed groups:
        -- no educator, and nobody in it either. Deliberately a second
        -- lateral with an inverted membership test rather than a flag on the one
        -- above, because the page ranks the two differently and one wire fact per
        -- kind of wrong is what its ranking maps over. The EXISTS / NOT EXISTS
        -- pair is what makes the two arrays disjoint: no group can be in both,
        -- and a group somebody teaches is in neither.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND NOT EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                          )
                 ), '[]'::jsonb) AS items
        ) eg
        -- The waitlist flag asks "is there something for an admin to do here",
        -- not "is this product in an interesting state". An open seat
        -- that has already been offered to a family is being dealt with, so it
        -- is subtracted before the comparison; a product whose every open seat
        -- carries a live offer drops out of the queue entirely. When that family
        -- declines, or the five days run out, the live count falls and the flag
        -- comes back on its own — which is exactly why the count is derived
        -- from the stamp rather than stored anywhere.
        LEFT JOIN LATERAL (
          SELECT psc.waitlist_count,
                 c.seat_count - psc.active_count AS open_seats,
                 lo.n                            AS live_offer_count
            FROM public.product_seat_counts psc
            CROSS JOIN LATERAL (
              SELECT count(*)::integer AS n
                FROM public.participations po
               WHERE po.product_id = c.id
                 AND po.status = 'waitlisted'
                 AND po.seat_offer_sent_at IS NOT NULL
                 AND po.seat_offer_sent_at + interval '5 days' > now()
            ) lo
           WHERE psc.product_id = c.id
             AND c.waitlist_enabled
             AND psc.waitlist_count > 0
             AND c.seat_count IS NOT NULL
             AND psc.active_count < c.seat_count
             AND (c.seat_count - psc.active_count) > lo.n
        ) wl ON true
       WHERE ua.n > 0
          OR jsonb_array_length(gw.items) > 0
          OR jsonb_array_length(eg.items) > 0
          OR wl.open_seats IS NOT NULL
          OR c.primary_gedu_fee_cents IS NULL
          OR (c.product_type = 'municipality_club'
              AND c.municipality_fee_cents IS NULL)
          OR (c.product_type = 'municipality_club'
              AND c.invoice_customer_id IS NULL)
    ) a;

  -- ---------------------------------------------------------------------------
  -- 4. The schedule set: the calendar facts the page resolves weeks from.
  --
  -- Slots carry the weekday exactly as the column stores it (0 = Monday) and the
  -- start time as a bare HH:MM wall clock in the product's own zone — the admin
  -- schedule is deliberately read in the zone it was authored in.
  --
  -- The sessions themselves are `planned_sessions`: planned_group_sessions over
  -- the product's window, [window_start, window_end), as rows of
  -- {session_date, starts_at, ends_at, cancelled_group_ids}. Cancellation is per
  -- (group, date) and the schedule is per product, so each product also carries
  -- `group_ids`, every group the product has (not only groups some other fact
  -- mentions), and the page decides each date from the two: a date every group
  -- cancelled is a cancelled date; a date some cancelled still runs for the rest.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(s.doc ORDER BY s.product_id), '[]'::jsonb)
    INTO v_schedule
    FROM (
      WITH candidate AS (
        SELECT p.*, w.window_start, w.window_end
          FROM public.products p
          CROSS JOIN LATERAL (
            SELECT (now() AT TIME ZONE p.timezone)::date - 30 AS window_start,
                   ((now() AT TIME ZONE p.timezone)::date
                     + INTERVAL '4 months')::date             AS window_end
          ) w
         WHERE (
                 public.effective_status(p.id) IN ('pending', 'running')
              OR (p.end_date IS NOT NULL
                  AND p.end_date >= w.window_start
                  AND p.end_date <  w.window_end)
               )
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',             c.id,
               'product_type',   c.product_type,
               'translations',   tr.items,
               'timezone',       c.timezone,
               'start_date',     c.start_date,
               'end_date',       c.end_date,
               'seat_count',     c.seat_count,
               'active_count',   COALESCE(psc.active_count, 0),
               'waitlist_count', COALESCE(psc.waitlist_count, 0),
               'schedule_slots', sl.items,
               'group_ids',      gr.items,
               'planned_sessions', pl.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.product_seat_counts psc ON psc.product_id = c.id
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
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(g.id ORDER BY g.id)
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) gr
        -- The window's end is exclusive and the plan's span is inclusive.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'session_date',        planned.session_date,
                              'starts_at',           planned.starts_at,
                              'ends_at',             planned.ends_at,
                              'cancelled_group_ids', to_jsonb(planned.cancelled_group_ids)
                            )
                            ORDER BY planned.session_date, planned.starts_at
                          )
                     FROM public.planned_group_sessions(
                            c.id, c.window_start, c.window_end - 1
                          ) AS planned
                 ), '[]'::jsonb) AS items
        ) pl
    ) s;

  RETURN jsonb_build_object(
    'users',              v_users,
    'certification_queue', v_queue,
    'attention_products', v_attention,
    'schedule_products',  v_schedule
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_dashboard() IS 'The whole admin dashboard in one document: per-role user counts (email-verified and, for gedus, certified — either can be NULL, where the stat has no meaning: certified only means something for an educator, and verified is NULL for a role none of whose accounts holds a real address, which is every gamer unless their parent chose sign-in mode email), the uncertified-gedu queue, live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Each queue candidate also carries contract_accepted_at — when they accepted the current gedu contract, or NULL — which informs the certification decision without gating it; that standing is judged on the version''s BASE, so either equally binding language of the current version counts, and a candidate holding both carries the earlier of the two signatures. Each candidate additionally carries criminal_record_check_at — when an admin recorded seeing their criminal record extract, or NULL — which informs the same decision on the same terms and gates nothing either; the flag beside it is not shipped because the stamp is non-NULL exactly when the flag is true. The waitlist attention item asks whether there is something for an admin to DO rather than what state the product is in: an open seat that already carries a live seat offer is subtracted, so a product whose every open seat has been offered drops out of the queue, and a decline or an expiry raises it again on its own. The count rides in the emitted object as live_offer_count so the page can explain the absence. An unstaffed group with NO active member is named too, in its own empty_groups_without_gedu array beside groups_without_gedu, and can put a product in the queue by itself: an admin pre-building next term has not made a mistake, and that reasoning decides the item''s RANK on the page rather than hiding it. The two arrays are disjoint by construction and neither holds a group somebody is assigned to. Both product sections ask effective_status() and nothing else: there is no stored status to pre-filter on, so the derived answer is the only lifecycle test either candidate set makes, and every date window is computed in the product''s own timezone. Each attention candidate also carries missing_invoice_customer — municipality clubs only, true when the club names no Fennoa invoice customer, and false everywhere else by construction because the CHECK forbids the column on any other product type. It puts a club in the queue on its own, exactly as the municipality fee beside it does: the link is nullable because a club is created before anybody has agreed who pays for it, and by the time it starts both the fee and the buyer are meant to be set, so a club still missing one is an admin omission rather than an ordinary state. The two are the bottom of the page''s ranking and sit together there, because both are a blank field on one form with one consequence — a month of invoices that cannot be written for that buyer. Each schedule product also carries group_ids, every group it has, and planned_sessions, planned_group_sessions over its window [product-local today - 30 days, + 4 months) as {session_date, starts_at, ends_at, cancelled_group_ids} rows, soonest first, so the page places each session at its start instant and can tell a date every group cancelled from one only some did. Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';



-- The gedu invoicing document ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_month_end date;
  v_doc       jsonb;
BEGIN
  -- The month is named by its first day and nothing else, exactly as the
  -- municipality invoicing read demands: a mid-month argument would answer
  -- for a month-long span that matches no calendar month.
  IF p_month_start IS NULL
     OR p_month_start <> date_trunc('month', p_month_start::timestamp)::date THEN
    RAISE EXCEPTION
      'gedu invoicing: p_month_start must be the first day of a month (got %)',
      p_month_start
      USING ERRCODE = 'check_violation';
  END IF;

  v_month_end := (p_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH RECURSIVE
  -- Standing seats: every group a gedu is assigned to TODAY whose month says
  -- anything — its product's term overlaps the month, or it stored a session
  -- row inside it (a stored row on an unscheduled date still ran). Assignments
  -- carry no history, so a past month is read against today's staffing.
  assigned AS (
    SELECT a.gedu_id, a.group_id, a.role
      FROM public.gedu_group_assignments a
      JOIN public.product_groups g ON g.id = a.group_id
      JOIN public.products p       ON p.id = g.product_id
     WHERE (p_gedu_id IS NULL OR a.gedu_id = p_gedu_id)
       AND (
             (p.start_date <= v_month_end
              AND (p.end_date IS NULL OR p.end_date >= p_month_start))
          OR EXISTS (
               SELECT 1
                 FROM public.group_sessions gs
                WHERE gs.group_id = a.group_id
                  AND gs.session_date >= p_month_start
                  AND gs.session_date <= v_month_end
             )
           )
  ),
  -- Dated seats: every live substitution inside the month, in the role the
  -- request records — the absent gedu's role when it was filed — and naming
  -- the absent gedu the sub stood in for.
  subbed AS (
    SELECT r.id, r.substitute_id AS gedu_id, r.group_id, r.session_date, r.role,
           r.requested_by AS absent_gedu_id
      FROM public.session_substitution_requests r
     WHERE r.status = 'substituted'::public.substitution_request_status
       AND r.substitute_id IS NOT NULL
       AND (p_gedu_id IS NULL OR r.substitute_id = p_gedu_id)
       AND r.session_date >= p_month_start
       AND r.session_date <= v_month_end
  ),
  seat AS (
    SELECT s.gedu_id, s.group_id FROM assigned s
    UNION
    SELECT s.gedu_id, s.group_id FROM subbed s
  ),
  -- The gedu's OWN live absences inside the month, on groups they hold a seat
  -- on — the first half of the derivation, which takes them out of those
  -- sessions — naming the sub who covered, once one is seated. Never the
  -- reason: the document does not say why anybody was away.
  absent AS (
    SELECT r.id, r.requested_by AS gedu_id, r.group_id, r.session_date,
           r.role, r.status, r.substitute_id
      FROM public.session_substitution_requests r
      JOIN seat s ON s.gedu_id = r.requested_by AND s.group_id = r.group_id
     WHERE r.status <> 'withdrawn'::public.substitution_request_status
       AND r.session_date >= p_month_start
       AND r.session_date <= v_month_end
  ),
  seat_group AS (
    SELECT DISTINCT g.id, g.product_id, g.name
      FROM seat s
      JOIN public.product_groups g ON g.id = s.group_id
  ),
  seat_product AS (
    SELECT p.*
      FROM public.products p
     WHERE p.id IN (SELECT sg.product_id FROM seat_group sg)
  ),
  -- The ancestor-or-self walk to the nearest municipality, the same walk the
  -- municipality invoicing read makes, so a club can be labelled by its town.
  -- A consumer club may reach none, and then carries null.
  walk AS (
    SELECT l.id AS origin_id, l.id, l.parent_id, l.type, l.name, l.name_i18n,
           0 AS depth
      FROM public.locations l
     WHERE l.id IN (
             SELECT sp.location_id FROM seat_product sp
              WHERE sp.location_id IS NOT NULL
           )
     UNION ALL
    SELECT w.origin_id, l.id, l.parent_id, l.type, l.name, l.name_i18n,
           w.depth + 1
      FROM walk w
      JOIN public.locations l ON l.id = w.parent_id
     WHERE w.type <> 'municipality'
       AND w.depth < 16
  ),
  municipality AS (
    SELECT DISTINCT ON (w.origin_id)
           w.origin_id, w.id, w.name, w.name_i18n
      FROM walk w
     WHERE w.type = 'municipality'
     ORDER BY w.origin_id, w.depth
  )
  SELECT jsonb_build_object(
           'month_start', to_char(p_month_start, 'YYYY-MM-DD'),
           'gedus', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',         pr.id,
                        'first_name', pr.first_name,
                        'last_name',  pr.last_name,
                        -- The gedu's own address, so an admin can find them by
                        -- it. Only here: a counterpart below is named, never
                        -- addressed.
                        'email',      pr.email,
                        'assignments', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'group_id', a.group_id,
                                     'role',     a.role
                                   )
                                   ORDER BY a.group_id
                                 )
                            FROM assigned a
                           WHERE a.gedu_id = pr.id
                        ), '[]'::jsonb),
                        'substitutions', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'request_id',   s.id,
                                     'group_id',     s.group_id,
                                     'session_date', s.session_date,
                                     'role',         s.role,
                                     'absent_gedu',  jsonb_build_object(
                                                       'id',         ap.id,
                                                       'first_name', ap.first_name,
                                                       'last_name',  ap.last_name
                                                     )
                                   )
                                   ORDER BY s.session_date, s.group_id, s.id
                                 )
                            FROM subbed s
                            JOIN public.profiles ap ON ap.id = s.absent_gedu_id
                           WHERE s.gedu_id = pr.id
                        ), '[]'::jsonb),
                        'absences', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'request_id',   ab.id,
                                     'group_id',     ab.group_id,
                                     'session_date', ab.session_date,
                                     'role',         ab.role,
                                     'status',       ab.status,
                                     -- Null while the request is open.
                                     'substitute',
                                       CASE WHEN sp.id IS NULL THEN NULL
                                            ELSE jsonb_build_object(
                                                   'id',         sp.id,
                                                   'first_name', sp.first_name,
                                                   'last_name',  sp.last_name
                                                 )
                                       END
                                   )
                                   ORDER BY ab.session_date, ab.group_id, ab.id
                                 )
                            FROM absent ab
                            LEFT JOIN public.profiles sp ON sp.id = ab.substitute_id
                           WHERE ab.gedu_id = pr.id
                        ), '[]'::jsonb)
                      )
                      ORDER BY pr.id
                    )
               FROM public.profiles pr
              WHERE pr.id IN (SELECT s.gedu_id FROM seat s)
           ), '[]'::jsonb),
           'groups', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',         sg.id,
                        'product_id', sg.product_id,
                        'name',       sg.name,
                        -- Stored rows in the month with no cancellation in
                        -- effect: the evidence a session ran. A row kept
                        -- under a cancellation is not one, and is left out
                        -- here so no reader can count it.
                        'sessions', COALESCE((
                          SELECT jsonb_agg(gs.session_date ORDER BY gs.session_date)
                            FROM public.group_sessions gs
                           WHERE gs.group_id = sg.id
                             AND gs.session_date >= p_month_start
                             AND gs.session_date <= v_month_end
                             AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
                        ), '[]'::jsonb),
                        -- The month's cancellations in effect, by the same
                        -- predicate, so a date here never also appears above
                        -- and an inert cancellation appears in neither.
                        'cancelled_sessions', COALESCE((
                          SELECT jsonb_agg(sc.session_date ORDER BY sc.session_date)
                            FROM public.session_cancellations sc
                           WHERE sc.group_id = sg.id
                             AND sc.session_date >= p_month_start
                             AND sc.session_date <= v_month_end
                             AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
                        ), '[]'::jsonb)
                      )
                      ORDER BY sg.id
                    )
               FROM seat_group sg
           ), '[]'::jsonb),
           'products', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',                       sp.id,
                        'product_type',             sp.product_type,
                        'timezone',                 sp.timezone,
                        'start_date',               sp.start_date,
                        'end_date',                 sp.end_date,
                        'primary_gedu_fee_cents',   sp.primary_gedu_fee_cents,
                        'assistant_gedu_fee_cents', sp.assistant_gedu_fee_cents,
                        'product_translations', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object('locale', pt.locale, 'name', pt.name)
                                   ORDER BY pt.locale
                                 )
                            FROM public.product_translations pt
                           WHERE pt.product_id = sp.id
                        ), '[]'::jsonb),
                        -- The plan: every date planned_session_dates puts
                        -- inside the month, clipped to the term by that
                        -- function — the dates a seat was due.
                        'planned_dates', COALESCE((
                          SELECT jsonb_agg(psd.session_date ORDER BY psd.session_date)
                            FROM public.planned_session_dates(sp.id, p_month_start, v_month_end) psd
                        ), '[]'::jsonb),
                        'location',
                          CASE WHEN l.id IS NULL THEN NULL
                               ELSE jsonb_build_object(
                                      'id',        l.id,
                                      'name',      l.name,
                                      'name_i18n', l.name_i18n,
                                      'type',      l.type
                                    )
                          END,
                        'municipality',
                          CASE WHEN m.id IS NULL THEN NULL
                               ELSE jsonb_build_object(
                                      'id',        m.id,
                                      'name',      m.name,
                                      'name_i18n', m.name_i18n
                                    )
                          END
                      )
                      ORDER BY sp.id
                    )
               FROM seat_product sp
               LEFT JOIN public.locations l ON l.id = sp.location_id
               LEFT JOIN municipality m     ON m.origin_id = sp.location_id
           ), '[]'::jsonb)
         )
    INTO v_doc;

  RETURN v_doc;
END;
$$;

COMMENT ON FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) IS 'Internal builder behind gedu invoicing: one calendar month of the raw facts a gedu''s invoice is computed from, for one gedu (p_gedu_id) or for every gedu (NULL — only the admin wrapper passes that). Not granted to `authenticated`: the two guarded wrappers get_admin_gedu_invoicing and get_my_gedu_invoicing are its only client paths. p_month_start must be the first day of a month; anything else raises check_violation. Nothing is written or snapshotted — every figure is recomputed from today''s facts by a pure TypeScript builder, as municipality invoicing is. Per gedu it carries their id, name and email (the email on the gedu''s own entry only — on the gedu''s own read that is the caller''s address, and a counterpart is named but never addressed), and their SEATS: `assignments` (every group they are assigned to whose product''s term overlaps the month or which stored a session row in it, with the assignment role), `substitutions` (every `substituted` request inside the month naming them as the sub, with the role recorded on the request — the absent gedu''s at filing time — and the absent gedu''s id and name) and `absences` (their own non-withdrawn requests inside the month on a group they hold a seat on, with the seated sub''s id and name, or null while the request is open). Those are exactly the facts the substitution derivation needs to decide whether THIS gedu was expected at a (group, date); the builder runs the TypeScript twin of gedu_is_expected_at_session over them rather than this function re-deriving it. WHO covered for whom is named on both sides, so an admin can see why one gedu is not paid for a session another was, and a gedu can see who covered for them: that follows the substitution feature''s disclosure rule (src/services/session-substitution/CLAUDE.md) — the absent gedu is named to admins, to the requester, and to staff on the group, which a seated sub is; only the volunteer pool withholds it, and an unseated volunteer never reaches invoicing. A request''s REASON — its category and note — never appears. STAFFING IS TODAY''S: assignments carry no history (removing one deletes the row, a role change overwrites it), so a past month is computed from current assignments — a known, accepted limitation of v1, not an oversight. Beside the gedus ride every group their seats touch (with its stored group_sessions dates in the month that no cancellation in effect covers — the evidence a session ran — and the month''s cancelled dates in effect, both by group_session_is_cancelled, so a date is never in both) and every product of those groups (type, timezone, term, both current gedu fees — NULL means not set, never zero — the whole product_translations array, planned_dates — the product''s planned session dates inside the month, as planned_session_dates answers them over the month (so clipped to the term), ascending, which are the dates its seats were due — its own location and the nearest ancestor-or-self municipality, null where the chain reaches none). Every array ships as [] rather than null.';

