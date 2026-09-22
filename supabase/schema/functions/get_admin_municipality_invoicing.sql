--
-- Name: get_admin_municipality_invoicing(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_municipality_invoicing(p_month_start date) RETURNS jsonb
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
                             'invoice_text',       ic.invoice_text
                           )
                 END,
               'sessions',               se.items
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
                 ), '[]'::jsonb) AS items
        ) se
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


--
-- Name: FUNCTION get_admin_municipality_invoicing(p_month_start date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) IS 'One calendar month of municipality-club invoicing, as a single document: every municipality club that either recorded a session in the month or could have (a term that overlaps it), each with its timezone, term dates, current municipality_fee_cents, the whole product_translations array, its weekly schedule slots, its own location row, the nearest ancestor-or-self location of type municipality, the FENNOA INVOICE CUSTOMER it is billed to, and every stored group_sessions row in the month as a raw (group_id, session_date) pair. Admin-only, guard-first on assert_admin, and deliberately not STRICT so the guard cannot be skipped on NULL input. p_month_start must be the first day of a month; anything else raises check_violation. A session RAN iff a group_sessions row exists — those rows are lazily materialized when an educator records a report, note or attendance, so a row is the evidence somebody was there — and the client counts one session per club per calendar date, because a club with two groups meeting on one day ran one session. The schedule ships so the client can project what was supposed to run and flag a scheduled date with no row; a projection is never counted and never billed, and a stored row on an unscheduled date still counts. Since 00256 the candidate test is the term alone and the document carries no lifecycle column: the second arm used to demand a stored running/completed state as well, which no club ever held, so a club with no recorded session never reached the invoice and nothing was ever flagged as missed. The municipality walk climbs parent_id THROUGH retired rows and never filters them, because a school that has since closed still sat in its municipality. Every club in the document HAS a municipality: a club whose chain reaches none cannot be invoiced to anybody, so the whole read raises check_violation naming those product ids rather than shipping a null the caller would have to render somewhere outside every total. Since 00268 each club also carries invoice_customer — the WHOLE customer row (number, invoice name, address, optional reference and invoice text) rather than an id, because the caller turns it into a Finvoice file — or null where nobody has said who pays yet. A null customer is NOT refused, unlike a null municipality: such a club renders on the page perfectly well and only its own file is blocked, so refusing the month would take every other file down with it. The link is the club''s own column and is never derived from its location, because one city can be two customers and an association can buy clubs sited in a municipality it is not. The fee is the current column value with no snapshotting, and NULL means unset — the client shows that as a blank to fix, never as zero. Every array ships as [] rather than null.';


--
-- Name: FUNCTION get_admin_municipality_invoicing(p_month_start date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) TO service_role;


