-- A club that cannot be invoiced is a data error, not a bucket to render.
--
-- `get_admin_municipality_invoicing` shipped a `municipality` of null for any
-- municipality club whose location chain reached no municipality, and the page
-- gathered those clubs into a trailing "no municipality" bucket. This migration
-- replaces the function so that such a club stops the whole read: the document it
-- answers with now names a municipality for every club in it.
--
-- WHY A REFUSAL RATHER THAN A NULL
--
-- The invoice is *per municipality*. A municipality club with no municipality
-- above it is not an invoice line with a missing label — it is a club nobody can
-- be billed for, and there is no arithmetic that turns it into one. Two honest
-- answers were available and only one of them is cheap to keep true: render a
-- bucket for it on every surface that ever reads this document, forever, or
-- refuse the read and make somebody repoint one location. The schema already
-- forces every municipality club to carry a location; what it does not force is
-- that location's ancestor chain to reach a municipality, and this is the
-- boundary where the last step is enforced.
--
-- Refusing is also the only answer that cannot be misread. A bucket is a figure
-- printed outside every total on the page — the exact shape of a total that is
-- quietly short — and the reader has no way to tell a club that was never
-- invoiceable from one whose location was mistyped this morning. A read that
-- stops, naming the product id, sends the same person to the same repair, with
-- no invoice raised in the meantime.
--
-- The refusal sits after the admin guard and after the month check, for the same
-- reason the month check sits after the guard: an unauthorized caller learns
-- nothing about the data, not even which clubs are broken. It is checked against
-- the document that was actually built rather than against a second walk of the
-- location tree, so what it enforces is a claim about what would have been
-- emitted — the only thing a reader of this function's output cares about — and
-- it cannot drift from the join that produces it.
--
-- Everything else about the function is unchanged, and the essay in 00252 is
-- still the description of what a session is and what it is worth. The one
-- sentence of it this file supersedes is the last of WHICH MUNICIPALITY A CLUB
-- BELONGS TO: a chain reaching no municipality no longer ships null and is no
-- longer grouped separately by the page. The walk still climbs *through* retired
-- locations and still never filters them — which is precisely what keeps a school
-- that closed last term from becoming the data error this file now refuses.

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
             )
          OR (
               p.status IN ('running', 'completed')
               AND p.start_date IS NOT NULL
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
               'status',                 c.status,
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
               'sessions',               se.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.locations l ON l.id = c.location_id
        LEFT JOIN municipality m ON m.origin_id = c.location_id
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

COMMENT ON FUNCTION public.get_admin_municipality_invoicing(date) IS 'One calendar month of municipality-club invoicing, as a single document: every municipality club that either recorded a session in the month or could have (status running/completed with a term overlapping it), each with its status, timezone, term dates, current municipality_fee_cents, the whole product_translations array, its weekly schedule slots, its own location row, the nearest ancestor-or-self location of type municipality, and every stored group_sessions row in the month as a raw (group_id, session_date) pair. Admin-only, guard-first on assert_admin, and deliberately not STRICT so the guard cannot be skipped on NULL input. p_month_start must be the first day of a month; anything else raises check_violation. A session RAN iff a group_sessions row exists — those rows are lazily materialized when an educator records a report, note or attendance, so a row is the evidence somebody was there — and the client counts one session per club per calendar date, because a club with two groups meeting on one day ran one session. The schedule ships so the client can project what was supposed to run and flag a scheduled date with no row; a projection is never counted and never billed, and a stored row on an unscheduled date still counts. The municipality walk climbs parent_id THROUGH retired rows and never filters them, because a school that has since closed still sat in its municipality. Every club in the document HAS a municipality: a club whose chain reaches none cannot be invoiced to anybody, so the whole read raises check_violation naming those product ids rather than shipping a null the caller would have to render somewhere outside every total. The fee is the current column value with no snapshotting, and NULL means unset — the client shows that as a blank to fix, never as zero. Every array ships as [] rather than null.';

REVOKE EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(date) TO service_role;

-- The end state this file leaves, asserted against the catalog rather than
-- against the text above — so a clause lost while retyping the body fails here,
-- at the moment the migration runs, rather than in a test somebody has to think
-- to write. Re-derived rather than copied: a replacement function has to restate
-- the invariants of the one it supersedes, or the superseded migration's block is
-- the last place they were ever checked.

DO $$
DECLARE
  v_sig constant text := 'public.get_admin_municipality_invoicing(date)';
  v_src text;
  v_prov "char";
  v_strict boolean;
BEGIN
  SELECT pr.prosrc, pr.provolatile, pr.proisstrict
    INTO v_src, v_prov, v_strict
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public'
     AND pr.proname = 'get_admin_municipality_invoicing';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is missing after being replaced';
  END IF;

  IF (SELECT count(*) FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
       WHERE n.nspname = 'public' AND pr.proname = 'get_admin_municipality_invoicing') <> 1 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is overloaded — a call would be ambiguous';
  END IF;

  -- --- (a) Guard-first, and reachable. ------------------------------------
  IF position('assert_admin' IN v_src) = 0
     OR position('assert_admin' IN v_src) > position('check_violation' IN v_src) THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing does not gate on assert_admin before anything else';
  END IF;

  IF v_strict THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is STRICT — its guard would be skipped on NULL input';
  END IF;

  IF v_prov <> 's' THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is not STABLE';
  END IF;

  -- --- (b) The month argument is validated, not assumed. -------------------
  IF position('date_trunc(''month''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing no longer refuses a non-first-of-month argument';
  END IF;

  -- --- (c) The candidate set is both halves of the union. ------------------
  IF position('product_type = ''municipality_club''' IN v_src) = 0
     OR position('public.group_sessions' IN v_src) = 0
     OR position('status IN (''running'', ''completed'')' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing lost half of the set of clubs a month contains';
  END IF;

  -- --- (d) The municipality walk, and its refusal to filter retired rows. --
  IF position('w.type <> ''municipality''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing lost the ancestor-or-self municipality walk';
  END IF;

  IF position('retired_at' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing filters retired locations — the walk must pass through them';
  END IF;

  -- --- (e) A club with no municipality stops the read. ---------------------
  -- This file's own reason for existing: the emitted document is swept for a
  -- null municipality, and a hit raises rather than shipping a club nobody can
  -- be billed for.
  IF position('jsonb_typeof(club.value -> ''municipality'') = ''null''' IN v_src) = 0
     OR position('ancestor-or-self of the location of municipality club' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing no longer refuses a club with no municipality';
  END IF;

  -- --- (f) Every key the client contract parses. ---------------------------
  IF position('''municipality_fee_cents''' IN v_src) = 0
     OR position('''product_translations''' IN v_src) = 0
     OR position('''schedule_slots''' IN v_src) = 0
     OR position('''sessions''' IN v_src) = 0
     OR position('''month_start''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing no longer emits the document the client parses';
  END IF;

  -- --- (g) Reachable by an admin's own session, and by nobody's anon one. --
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing lost a grant it needs';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is executable by anon';
  END IF;
END $$;
