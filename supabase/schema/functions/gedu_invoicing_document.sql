--
-- Name: gedu_invoicing_document(date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) RETURNS jsonb
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
  -- request records — the absent gedu's role when it was filed.
  subbed AS (
    SELECT r.id, r.substitute_id AS gedu_id, r.group_id, r.session_date, r.role
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
  -- sessions. No reason and no sub: the document never says why anybody was
  -- away, and a gedu's absence is carried only on that gedu's own entry.
  absent AS (
    SELECT r.id, r.requested_by AS gedu_id, r.group_id, r.session_date,
           r.role, r.status
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
                                     'role',         s.role
                                   )
                                   ORDER BY s.session_date, s.group_id, s.id
                                 )
                            FROM subbed s
                           WHERE s.gedu_id = pr.id
                        ), '[]'::jsonb),
                        'absences', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'request_id',   ab.id,
                                     'group_id',     ab.group_id,
                                     'session_date', ab.session_date,
                                     'role',         ab.role,
                                     'status',       ab.status
                                   )
                                   ORDER BY ab.session_date, ab.group_id, ab.id
                                 )
                            FROM absent ab
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


--
-- Name: FUNCTION gedu_invoicing_document(p_month_start date, p_gedu_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) IS 'Internal builder behind gedu invoicing: one calendar month of the raw facts a gedu''s invoice is computed from, for one gedu (p_gedu_id) or for every gedu (NULL — only the admin wrapper passes that). Not granted to `authenticated`: the two guarded wrappers get_admin_gedu_invoicing and get_my_gedu_invoicing are its only client paths. p_month_start must be the first day of a month; anything else raises check_violation. Nothing is written or snapshotted — every figure is recomputed from today''s facts by a pure TypeScript builder, as municipality invoicing is. Per gedu it carries their SEATS: `assignments` (every group they are assigned to whose product''s term overlaps the month or which stored a session row in it, with the assignment role), `substitutions` (every `substituted` request inside the month naming them as the sub, with the role recorded on the request — the absent gedu''s at filing time) and `absences` (their own non-withdrawn requests inside the month on a group they hold a seat on). Those are exactly the facts the substitution derivation needs to decide whether THIS gedu was expected at a (group, date); the builder runs the TypeScript twin of gedu_is_expected_at_session over them rather than this function re-deriving it. A request''s REASON never appears, and neither does who else was absent: a substitution carries no requester and an absence no sub, so a gedu''s document names no other gedu''s absence. STAFFING IS TODAY''S: assignments carry no history (removing one deletes the row, a role change overwrites it), so a past month is computed from current assignments — a known, accepted limitation of v1, not an oversight. Beside the gedus ride every group their seats touch (with its stored group_sessions dates in the month that no cancellation in effect covers — the evidence a session ran — and the month''s cancelled dates in effect, both by group_session_is_cancelled, so a date is never in both) and every product of those groups (type, timezone, term, both current gedu fees — NULL means not set, never zero — the whole product_translations array, weekly schedule slots so the builder can project past and upcoming dates, its own location and the nearest ancestor-or-self municipality, null where the chain reaches none). Every array ships as [] rather than null.';


--
-- Name: FUNCTION gedu_invoicing_document(p_month_start date, p_gedu_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) TO service_role;


