-- The invoicing documents carry their plan.
--
-- Both invoicing builders walked each product's weekly slots across the month
-- in TypeScript, clipped to the term, to find the dates a session was due.
-- Each club in the municipality invoicing document and each product in the
-- gedu invoicing document now carries `planned_dates`: the product's planned
-- session dates inside the month, from planned_session_dates, ascending. The builders read those dates instead of projecting.
--
-- `schedule_slots` stays on both documents.

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
               p.start_date IS NOT NULL
               AND p.start_date <= v_month_end
               AND (p.end_date IS NULL OR p.end_date >= p_month_start)
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
     WHERE l.id IN (
             SELECT c.location_id FROM candidate c WHERE c.location_id IS NOT NULL
           )
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
        LEFT JOIN public.locations l ON l.id = c.location_id
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
        -- appears there, and an inert cancellation appears in neither.
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


COMMENT ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) IS 'One calendar month of municipality-club invoicing, as a single document: every municipality club that either recorded a session in the month or could have (a term that overlaps it), each with its timezone, term dates, current municipality_fee_cents, the whole product_translations array, its weekly schedule slots (for the schedule summary), planned_dates — the club''s planned session dates inside the month, as planned_session_dates answers them over the month (so clipped to the term), ascending, which are the dates the club was due to meet — its own location row, the nearest ancestor-or-self location of type municipality, the FENNOA INVOICE CUSTOMER it is billed to, every stored group_sessions row in the month as a raw (group_id, session_date) pair, the month''s cancelled (group_id, session_date) pairs in effect, and every group id the club has. Admin-only, guard-first on assert_admin, and deliberately not STRICT so the guard cannot be skipped on NULL input. p_month_start must be the first day of a month; anything else raises check_violation. A stored row on a date a cancellation covers is left out of sessions, so no reader can bill a cancelled session. The candidate test is the TERM alone and the document carries no lifecycle column. The municipality walk climbs parent_id THROUGH retired rows and never filters them, because a school that has since closed still sat in its municipality. Every club in the document HAS a municipality: a club whose chain reaches none cannot be invoiced to anybody, so the whole read raises check_violation naming those product ids rather than shipping a null the caller would have to render somewhere outside every total. Each club also carries invoice_customer — the WHOLE customer row (number, invoice name, address, optional reference and invoice text, and the billing cadence that decides whether its file covers a month, a quarter or a half-year) rather than an id, because the caller turns it into a Finvoice file — or null where nobody has said who pays yet. A null customer is NOT refused, unlike a null municipality: such a club renders on the page perfectly well and only its own file is blocked, so refusing the month would take every other file down with it. The link is the club''s own column and is never derived from its location, because one city can be two customers and an association can buy clubs sited in a municipality it is not. The fee is the current column value with no snapshotting, and NULL means unset — the client shows that as a blank to fix, never as zero. A quarterly or half-yearly file is built by reading this document once per month of the period. Every array ships as [] rather than null.';


REVOKE ALL ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) TO service_role;


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
                        'schedule_slots', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'weekday',          ss.weekday,
                                     'start_time',       to_char(ss.start_time, 'HH24:MI'),
                                     'duration_minutes', ss.duration_minutes
                                   )
                                   ORDER BY ss.weekday, ss.start_time
                                 )
                            FROM public.schedule_slots ss
                           WHERE ss.product_id = sp.id
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


COMMENT ON FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) IS 'Internal builder behind gedu invoicing: one calendar month of the raw facts a gedu''s invoice is computed from, for one gedu (p_gedu_id) or for every gedu (NULL — only the admin wrapper passes that). Not granted to `authenticated`: the two guarded wrappers get_admin_gedu_invoicing and get_my_gedu_invoicing are its only client paths. p_month_start must be the first day of a month; anything else raises check_violation. Nothing is written or snapshotted — every figure is recomputed from today''s facts by a pure TypeScript builder, as municipality invoicing is. Per gedu it carries their id, name and email (the email on the gedu''s own entry only — on the gedu''s own read that is the caller''s address, and a counterpart is named but never addressed), and their SEATS: `assignments` (every group they are assigned to whose product''s term overlaps the month or which stored a session row in it, with the assignment role), `substitutions` (every `substituted` request inside the month naming them as the sub, with the role recorded on the request — the absent gedu''s at filing time — and the absent gedu''s id and name) and `absences` (their own non-withdrawn requests inside the month on a group they hold a seat on, with the seated sub''s id and name, or null while the request is open). Those are exactly the facts the substitution derivation needs to decide whether THIS gedu was expected at a (group, date); the builder runs the TypeScript twin of gedu_is_expected_at_session over them rather than this function re-deriving it. WHO covered for whom is named on both sides, so an admin can see why one gedu is not paid for a session another was, and a gedu can see who covered for them: that follows the substitution feature''s disclosure rule (src/services/session-substitution/CLAUDE.md) — the absent gedu is named to admins, to the requester, and to staff on the group, which a seated sub is; only the volunteer pool withholds it, and an unseated volunteer never reaches invoicing. A request''s REASON — its category and note — never appears. STAFFING IS TODAY''S: assignments carry no history (removing one deletes the row, a role change overwrites it), so a past month is computed from current assignments — a known, accepted limitation of v1, not an oversight. Beside the gedus ride every group their seats touch (with its stored group_sessions dates in the month that no cancellation in effect covers — the evidence a session ran — and the month''s cancelled dates in effect, both by group_session_is_cancelled, so a date is never in both) and every product of those groups (type, timezone, term, both current gedu fees — NULL means not set, never zero — the whole product_translations array, weekly schedule slots, planned_dates — the product''s planned session dates inside the month, as planned_session_dates answers them over the month (so clipped to the term), ascending, which are the dates its seats were due — its own location and the nearest ancestor-or-self municipality, null where the chain reaches none). Every array ships as [] rather than null.';


REVOKE ALL ON FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) TO service_role;
