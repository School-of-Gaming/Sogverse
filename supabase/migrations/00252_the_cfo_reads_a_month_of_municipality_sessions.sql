-- The CFO reads a month of municipality sessions.
--
-- Once a month School of Gaming invoices each Finnish municipality for the
-- clubs it runs. Until now that number was assembled by hand out of the session
-- feeds, one club at a time; this function answers the whole month in one
-- document, so the page that renders the invoice can be a pure mapping over it.
--
-- WHY SECURITY DEFINER
--
-- Reading a month of invoicing means reading `group_sessions` rows across every
-- municipality club on the platform — rows whose RLS is written around the
-- families and educators those sessions belong to, and which no single caller
-- is entitled to see the whole of. An admin is entitled to the *aggregate*, and
-- that is what this function is: a platform-wide read, gated at its own door.
-- The door is the first statement in the body — `PERFORM public.assert_admin()`
-- — which is the authorization spine's role-gated shape, and the reason the
-- function is deliberately NOT `STRICT`: a `STRICT` function skips its body on
-- NULL input, and a guard that can be skipped is not a guard.
--
-- WHAT A SESSION IS, AND WHAT IT IS WORTH
--
-- The counting rules the invoice stands on, stated here so a reader of this
-- file alone understands the number:
--
--   * **A session ran iff a `group_sessions` row exists** for one of the club's
--     groups with `session_date` inside the month. Those rows are lazily
--     materialized — one is written only when an educator records a report, a
--     note or an attendance mark — so the row is the evidence that somebody was
--     there. Nothing else counts.
--   * **Counting is per club, per calendar date.** A club may run several
--     groups; two groups meeting on the same date are one session of that club,
--     not two. This function ships the rows raw, one per (group, date), and the
--     page dedupes by date — the dedupe is a property of the invoice rather
--     than of the data, and shipping the rows lets the page also *show* which
--     groups met.
--   * **A schedule is a claim, not a session.** The weekly slots and the term
--     dates come along so the page can project what the club was supposed to
--     run and show a scheduled date with no stored row as something to
--     investigate. A projection is never counted and never billed; records beat
--     projections, which is the same rule every session feed in this app
--     follows. A stored row on a date the schedule does not project still
--     counts.
--   * **A projection is only offered for a club whose status is `running` or
--     `completed`.** A `pending` club has not started and a `cancelled` one did
--     not happen, so projecting sessions onto either would invent work. Such a
--     club can still appear here, on the strength of its stored rows alone.
--   * **The fee is the product's CURRENT `municipality_fee_cents`**, in integer
--     cents, and nothing is snapshotted: the invoice is computed at the moment
--     it is read. A NULL fee is a blank field, never a zero — the page says so
--     in as many words and excludes the club from the municipality's total
--     rather than billing nothing for it.
--
-- WHICH CLUBS ARE IN THE MONTH
--
-- Every `municipality_club` that either has at least one stored session row in
-- the month, or could have had one: status `running`/`completed` with a term
-- that overlaps the month. The union is deliberate. The first half alone would
-- hide a club that ran nothing and recorded nothing — exactly the club the CFO
-- most needs to see before invoicing. The second half alone would drop a club
-- whose term has been edited since, or whose status was moved, while its rows
-- stand.
--
-- WHICH MUNICIPALITY A CLUB BELONGS TO
--
-- The nearest ancestor-or-self of type `municipality` in the location tree,
-- found by walking `locations.parent_id` upward from the club's own location.
-- A municipality club normally points at a *site* (a school), whose parent is
-- the municipality; an online one points at the municipality directly, which is
-- why the walk is ancestor-or-**self**. Retired rows are walked *through* and
-- never filtered: a school that closed last term still sat in its municipality,
-- and dropping it from the chain would move every club it ran into the
-- no-municipality bucket. A club whose chain reaches no municipality ships
-- `null` and the page groups it separately rather than silently omitting it.
--
-- Arrays ship as `[]` and never as null, so the page never has to ask which
-- kind of nothing it received. Product names ship as the whole
-- `product_translations` array, exactly as `get_admin_dashboard` ships them:
-- which one to read is a property of the reader.

CREATE OR REPLACE FUNCTION public.get_admin_municipality_invoicing(p_month_start date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_month_end date;
  v_clubs     jsonb;
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

  RETURN jsonb_build_object(
    'month_start', to_char(p_month_start, 'YYYY-MM-DD'),
    'clubs',       v_clubs
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_municipality_invoicing(date) IS 'One calendar month of municipality-club invoicing, as a single document: every municipality club that either recorded a session in the month or could have (status running/completed with a term overlapping it), each with its status, timezone, term dates, current municipality_fee_cents, the whole product_translations array, its weekly schedule slots, its own location row, the nearest ancestor-or-self location of type municipality, and every stored group_sessions row in the month as a raw (group_id, session_date) pair. Admin-only, guard-first on assert_admin, and deliberately not STRICT so the guard cannot be skipped on NULL input. p_month_start must be the first day of a month; anything else raises check_violation. A session RAN iff a group_sessions row exists — those rows are lazily materialized when an educator records a report, note or attendance, so a row is the evidence somebody was there — and the client counts one session per club per calendar date, because a club with two groups meeting on one day ran one session. The schedule ships so the client can project what was supposed to run and flag a scheduled date with no row; a projection is never counted and never billed, and a stored row on an unscheduled date still counts. The municipality walk climbs parent_id THROUGH retired rows and never filters them, because a school that has since closed still sat in its municipality; a club whose chain reaches no municipality ships null rather than being omitted. The fee is the current column value with no snapshotting, and NULL means unset — the client shows that as a blank to fix, never as zero. Every array ships as [] rather than null.';

REVOKE EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(date) TO service_role;

-- The end state this file leaves, asserted against the catalog rather than
-- against the text above — so a clause lost while retyping the body fails here,
-- at the moment the migration runs, rather than in a test somebody has to think
-- to write.

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
    RAISE EXCEPTION 'get_admin_municipality_invoicing is missing after being created';
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

  -- --- (e) Every key the client contract parses. ---------------------------
  IF position('''municipality_fee_cents''' IN v_src) = 0
     OR position('''product_translations''' IN v_src) = 0
     OR position('''schedule_slots''' IN v_src) = 0
     OR position('''sessions''' IN v_src) = 0
     OR position('''month_start''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing no longer emits the document the client parses';
  END IF;

  -- --- (f) Reachable by an admin's own session, and by nobody's anon one. --
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing lost a grant it needs';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is executable by anon';
  END IF;
END $$;
