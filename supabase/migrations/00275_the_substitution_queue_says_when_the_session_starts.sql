-- The substitution queue says WHEN the session is, not only which day.
--
-- WHY
--
-- 00272 gave the admin dashboard its fifth member, `substitution_requests`, and shipped
-- each row's product as { id, product_type, timezone, is_remote, translations }.
-- That is a timezone with nothing to convert: the row states a calendar date and
-- no clock face, so an admin staffing a group that meets twice on a Friday
-- cannot tell from the queue which of the two is short-staffed, and the page's
-- own schedule two panels below states a time for every other occurrence it
-- draws.
--
-- The missing input is the SLOTS. The plan's rule for every substitution surface is
-- that the database emits the date plus the product's slots and timezone and the
-- client computes the instants — which is what `get_open_substitution_requests` (the
-- gedu pool) already does, and what both session feeds have always done. The
-- dashboard's member is the one that was written without them.
--
-- WHY NOT JOIN IN THE BROWSER
--
-- The same document already carries `schedule_products`, each with its slots, so
-- the panel could in principle look the product up there. It must not, and the
-- reason is the one case this queue exists to tolerate: an ORPHANED request — an
-- admin moved the schedule's weekday after the request was filed — is deliberately
-- still in the list, and `schedule_products` is a DIFFERENT set (it is bounded by
-- its own -30-day/+4-month window and drops cancelled and completed products), so
-- a browser-side join would silently print a time for some rows, nothing for
-- others, and no row would say which it was. Carrying the slots on the request's
-- own product shell makes "no slot names this weekday" the only absence there is,
-- and that absence is exactly the orphan.
--
-- WHY A SEPARATE MIGRATION
--
-- 00272 is applied to staging, and an applied migration is never edited
-- (supabase/CLAUDE.md, "Never amend a pushed migration"): the CLI matches on
-- version, so an edit there would never run on staging and only CI's
-- fresh-from-migrations database would ever see it.
--
-- The body below is 00272's verbatim, with one key added to one jsonb object and
-- the paragraph in section 5 that explains it. The GRANTs are re-issued because
-- the rule does not ask which kind of recreation happened: a recreated function
-- can come back PUBLIC-executable, so a migration that touches one pairs its
-- per-role GRANTs with an explicit REVOKE.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_users     jsonb;
  v_queue     jsonb;
  v_attention jsonb;
  v_schedule  jsonb;
  v_substitutions    jsonb;
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
  -- is why the test below is the ADDRESS and not the role (00235). `certified`
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
  -- `contract_accepted_at` (00201) is the candidate's standing against the
  -- CURRENT contract version, or NULL. It informs the certification decision and
  -- does not gate it — an unsigned candidate is still certifiable, and the admin
  -- is the one who decides what to make of the gap.
  --
  -- Standing is judged on the BASE version (00202): a version string is
  -- `<base>/<language>` and the languages of one version are the same agreement,
  -- so signing either makes a candidate current. min() because a candidate may
  -- hold both languages' rows — the first signature is the moment they agreed,
  -- and a scalar subquery would error rather than answer.
  --
  -- `criminal_record_check_at` (00213) is when an admin recorded seeing this
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
  -- Six kinds of wrong, and each is stated as the fact rather than as a sentence
  -- — the page words them, because the wording is translated copy.
  --
  --   * `unassigned_count`  — active seats sitting in no group. A child enrolled
  --                           and nobody looking after them is the worst of these.
  --   * `groups_without_gedu` — a group with members and no educator assigned.
  --   * `waitlist`          — people queueing while seats stand open AND those
  --                           seats have not all been offered to somebody. Only
  --                           meaningful on a capped product with the queue
  --                           switched on. NULL when there is nothing to say.
  --   * `empty_groups_without_gedu` (00241) — a group with no educator AND no
  --                           active member. An admin pre-building next term's
  --                           groups has not made a mistake, which is why this is
  --                           a SEPARATE and LOWER-ranked kind rather than part
  --                           of the one above — but it is still a loose end
  --                           somebody has to come back to, so it is named rather
  --                           than carved out of the group check, which is what
  --                           it was before this migration.
  --   * `missing_gedu_fee`  — NULL, not zero. Zero is a volunteer session, which
  --                           is a decision somebody made; NULL is a blank field.
  --                           The assistant fee is never flagged — NULL there
  --                           means "no assistant", which is the ordinary case.
  --   * `missing_municipality_fee` — municipality clubs only; the CHECK already
  --                           forbids the column elsewhere.
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
                             -- family thinking about them (00207). Emitted so
                             -- the page can say why the number of open seats
                             -- and the size of the queue do not by themselves
                             -- explain the flag.
                             'live_offer_count', wl.live_offer_count
                           )
                 END,
               'missing_gedu_fee', (c.primary_gedu_fee_cents IS NULL),
               'missing_municipality_fee',
                 (c.product_type = 'municipality_club'
                  AND c.municipality_fee_cents IS NULL)
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
        -- The same question asked of the OTHER half of the unstaffed groups
        -- (00241): no educator, and nobody in it either. Deliberately a second
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
        -- not "is this product in an interesting state" (00207). An open seat
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
    ) a;

  -- ---------------------------------------------------------------------------
  -- 4. The schedule set: the calendar facts the page resolves weeks from.
  --
  -- Slots carry the weekday exactly as the column stores it (0 = Monday) and the
  -- start time as a bare HH:MM wall clock in the product's own zone — the admin
  -- schedule is deliberately read in the zone it was authored in.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(s.doc ORDER BY s.product_id), '[]'::jsonb)
    INTO v_schedule
    FROM (
      WITH candidate AS (
        SELECT p.*
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
               'schedule_slots', sl.items
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
    ) s;

  -- ---------------------------------------------------------------------------
  -- 5. The substitution queue: open substitution requests an admin has to staff.
  --
  -- Dated TODAY OR LATER in the product's own timezone — a request whose date
  -- has passed is UNFILLED, which is a derived state of an open request and not
  -- something an admin can still act on, so it drops out on its own with no
  -- clock anywhere. The whole reason travels here (category and note), because
  -- this is the one surface the reason was collected for; everywhere else it is
  -- admin-only or absent.
  --
  -- Each offer ships the certification queue's own two standing facts —
  -- certified and criminal_record_check_at — so the panel draws the same chips
  -- it draws there rather than inventing a second vocabulary for the same two
  -- questions. An empty array is the all-clear, exactly as the attention queue
  -- reads its own.
  --
  -- An orphaned request (the schedule's weekday moved after it was filed) is
  -- still here, and that is deliberate: it orders by DATE and never by a
  -- derived instant, so a date the schedule no longer projects sorts like any
  -- other and an admin can clear it.
  --
  -- The product shell carries the SCHEDULE SLOTS beside the timezone, in the
  -- same shape the schedule set above emits them, because a row that states a
  -- date and no clock face cannot tell an admin which of Friday's two sessions
  -- is short-staffed. Slots rather than a start INSTANT, for the reason every
  -- other substitution surface emits them: the client owns the calendar maths, exactly
  -- as both session feeds do, and SQL holds no expansion. It is also what keeps
  -- the orphan case honest — a date the schedule no longer projects resolves to
  -- no slot at all on the client, which falls back to the bare date rather than
  -- printing a time the schedule would not produce.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(q.doc ORDER BY q.session_date, q.product_id, q.id), '[]'::jsonb)
    INTO v_substitutions
    FROM (
      SELECT r.id,
             r.session_date,
             p.id AS product_id,
             jsonb_build_object(
               'id',           r.id,
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
               'product', jsonb_build_object(
                 'id',           p.id,
                 'product_type', p.product_type,
                 'timezone',     p.timezone,
                 'is_remote',    p.is_remote,
                 'translations', COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = p.id
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
                    WHERE ss.product_id = p.id
                 ), '[]'::jsonb)
               ),
               'offers', COALESCE((
                 SELECT jsonb_agg(
                          jsonb_build_object(
                            'id',         o.id,
                            'gedu_id',    o.gedu_id,
                            'first_name', op.first_name,
                            'last_name',  op.last_name,
                            'certified',  COALESCE(ogp.certified, false),
                            'criminal_record_check_at', ogp.criminal_record_check_at,
                            'created_at', o.created_at
                          )
                          ORDER BY o.created_at, o.id
                        )
                   FROM public.session_substitution_offers o
                   JOIN public.profiles op ON op.id = o.gedu_id
                   LEFT JOIN public.gedu_profiles ogp ON ogp.user_id = o.gedu_id
                  WHERE o.request_id = r.id
               ), '[]'::jsonb)
             ) AS doc
        FROM public.session_substitution_requests r
        JOIN public.product_groups g ON g.id = r.group_id
        JOIN public.products p       ON p.id = g.product_id
        JOIN public.profiles rq      ON rq.id = r.requested_by
       WHERE r.status = 'open'::public.substitution_request_status
         AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
    ) q;

  RETURN jsonb_build_object(
    'users',              v_users,
    'certification_queue', v_queue,
    'attention_products', v_attention,
    'schedule_products',  v_schedule,
    'substitution_requests',     v_substitutions
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_admin_dashboard() TO service_role;

-- Extended rather than restated, for the reason 00272 gives where it does the
-- same thing: this comment runs to several hundred words, every sentence of
-- which is still true, and supabase/CLAUDE.md names the exact failure a hand
-- copy invites. The read is from the catalog and the write is one format().
DO $$
DECLARE
  v_existing text;
BEGIN
  SELECT obj_description(p.oid, 'pg_proc')
    INTO v_existing
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_admin_dashboard';

  IF v_existing IS NULL THEN
    RAISE EXCEPTION
      'get_admin_dashboard carries no comment to extend — restate it in full instead';
  END IF;

  EXECUTE format(
    'COMMENT ON FUNCTION public.get_admin_dashboard() IS %L',
    v_existing ||
    ' Since 00275 each substitution request''s product shell additionally carries'
    ' schedule_slots — {weekday, start_time, duration_minutes}, byte for byte the'
    ' schedule set''s own — so the queue can state a session''s clock face and not'
    ' only its date. Slots and not an instant: the client owns the calendar maths'
    ' on every substitution surface, exactly as both session feeds do. They ride on the'
    ' REQUEST''s product rather than being looked up in schedule_products, which'
    ' is a different and narrower set: an orphaned request may name a product that'
    ' set has dropped, and the one absence worth reading is "no slot names this'
    ' weekday".');
END $$;

-- ---------------------------------------------------------------------------
-- What this migration asserts about its own end state
--
-- Structural, because the behavioural proof cannot be made from here: the
-- function is guard-first on assert_admin and there is no session to be an admin
-- in, and a staging database holding no open request would make any query over
-- its output pass vacuously. The behaviour is proved in CI instead —
-- tests/db/session-substitution.test.ts parses this document's real output through the
-- client's own zod contract, which is where the key being present and shaped
-- right is a failing test rather than a missing sentence.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_src   text;
  v_slots integer;
  v_joins integer;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_admin_dashboard';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'get_admin_dashboard is missing';
  END IF;

  -- Exactly one of it. A signature that had moved would leave the old function
  -- behind and PostgREST would resolve a call by argument names in a way nobody
  -- wrote down.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_admin_dashboard') <> 1 THEN
    RAISE EXCEPTION 'get_admin_dashboard has been overloaded rather than replaced';
  END IF;

  -- TWO emitted schedule_slots keys, from TWO reads of the slots table: the
  -- schedule set's and, new here, the substitution queue's. One would mean this
  -- migration's key never landed; one would equally mean it landed by displacing
  -- the schedule set's, which is the shape a careless copy of the body takes.
  v_slots := (length(v_src) - length(replace(v_src, '''schedule_slots''', ''))) / length('''schedule_slots''');
  v_joins := (length(v_src) - length(replace(v_src, 'public.schedule_slots', ''))) / length('public.schedule_slots');

  IF v_slots <> 2 OR v_joins <> 2 THEN
    RAISE EXCEPTION
      'get_admin_dashboard emits % schedule_slots keys from % reads of the slots table, expected 2 and 2',
      v_slots, v_joins;
  END IF;

  IF has_function_privilege('anon', 'public.get_admin_dashboard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_dashboard is reachable by anon';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_admin_dashboard()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_admin_dashboard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_dashboard lost a grant it is called through';
  END IF;
END $$;
