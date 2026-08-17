-- One question for the whole admin dashboard.
--
-- WHY ONE RPC
--
-- The redesigned admin dashboard is four panels — a users strip, a gedu
-- certification queue, a product attention queue and a schedule with a coming-up
-- feed — and every one of them is a *platform-wide* aggregate. Asked separately
-- they would be four round trips whose answers are only meaningful together (the
-- schedule marks a chip because the attention queue flagged that product), and
-- four independently-cached queries that can disagree about what the platform
-- looks like. One document, one cache entry, one moment in time.
--
-- WHAT IT SENDS, AND WHAT IT DELIBERATELY DOES NOT
--
-- Facts, not views. The page resolves weeks, holiday breaks and the coming-up
-- feed itself from `schedule_slots`, `start_date`/`end_date` and the product's
-- holiday dates, because that arithmetic is what week navigation *is* — stepping
-- it server-side would mean a round trip per week. So sections 1-3, which are
-- pure counting, arrive counted, and section 4 arrives as the raw calendar facts
-- the client needs to compute against.
--
-- Names are the one thing not resolved here: a product's name lives in
-- `product_translations`, one row per locale, and which one an admin should read
-- is a property of the *reader*. Every other admin surface ships the whole array
-- and picks in the client against the UI locale; this one does the same rather
-- than inventing a server-side locale guess.
--
-- WHICH PRODUCTS COUNT AS "NOW"
--
-- Both product sections ask `effective_status()` rather than reading
-- `products.status`, because a stored 'pending' whose start date has passed is
-- running in every sense an admin cares about, and a stored 'running' whose end
-- date has passed is over. The attention queue is exactly the effectively
-- pending-or-running set. The schedule set is that plus a tail: a run whose end
-- date fell in the last thirty days is effectively 'expired' but still has
-- occurrences in the two weeks of history the week view can step back through,
-- and dropping it would empty those rows for no reason the reader could see. A
-- product stored 'cancelled' or 'completed' is excluded from both outright — it
-- is history, whatever its slots still say.
--
-- Every date window is computed in the *product's own* timezone, the same way
-- `effective_status` computes its own, so a product does not enter or leave the
-- window at a boundary belonging to some other product's zone.

CREATE FUNCTION public.get_admin_dashboard() RETURNS jsonb
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
  -- Two stats are NULL rather than 0, and the difference is the point. A gamer's
  -- address is a synthetic @gamer.sogverse.internal handle nobody will ever click
  -- a link in, so "0 verified" would report a problem that does not exist; NULL
  -- means the stat has no meaning for that role. `certified` is the same shape
  -- for the same reason — only an educator can be certified.
  -- ---------------------------------------------------------------------------
  SELECT jsonb_agg(
           jsonb_build_object(
             'role',      r.role_name,
             'total',     COALESCE(c.total, 0),
             'verified',  CASE WHEN r.role_name = 'gamer' THEN NULL
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
             count(*) FILTER (WHERE pr.email_verified_at IS NOT NULL)  AS verified,
             count(*) FILTER (WHERE gp.certified)                      AS certified
        FROM public.profiles pr
        LEFT JOIN public.gedu_profiles gp ON gp.user_id = pr.id
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
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         pr.id,
               'first_name', pr.first_name,
               'last_name',  pr.last_name,
               'created_at', pr.created_at
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
  -- Five kinds of wrong, and each is stated as the fact rather than as a sentence
  -- — the page words them, because the wording is translated copy.
  --
  --   * `unassigned_count`  — active seats sitting in no group. A child enrolled
  --                           and nobody looking after them is the worst of these.
  --   * `groups_without_gedu` — a group with members and no educator assigned. An
  --                           EMPTY group is not flagged: an admin building the
  --                           term's groups ahead of time has not made a mistake.
  --   * `waitlist`          — people queueing while seats stand open, which is
  --                           only meaningful on a capped product with the queue
  --                           switched on. NULL when there is nothing to say.
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
         WHERE p.status <> 'cancelled'
           AND public.effective_status(p.id) IN ('pending', 'running')
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',                  c.id,
               'product_type',        c.product_type,
               'translations',        tr.items,
               'unassigned_count',    ua.n,
               'groups_without_gedu', gw.items,
               'waitlist',
                 CASE WHEN wl.open_seats IS NOT NULL
                      THEN jsonb_build_object(
                             'waitlist_count', wl.waitlist_count,
                             'open_seats',     wl.open_seats
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
        LEFT JOIN LATERAL (
          SELECT psc.waitlist_count,
                 c.seat_count - psc.active_count AS open_seats
            FROM public.product_seat_counts psc
           WHERE psc.product_id = c.id
             AND c.waitlist_enabled
             AND psc.waitlist_count > 0
             AND c.seat_count IS NOT NULL
             AND psc.active_count < c.seat_count
        ) wl ON true
       WHERE ua.n > 0
          OR jsonb_array_length(gw.items) > 0
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
  --
  -- Holidays are bounded to the same window as the products themselves: a
  -- calendar can hold years of dates and only the ones a visible week could land
  -- on mean anything here.
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
         WHERE p.status NOT IN ('cancelled', 'completed')
           AND (
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
               'holidays',       hol.items
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
                   SELECT jsonb_agg(DISTINCT ch.date ORDER BY ch.date)
                     FROM public.product_holiday_calendars phc
                     JOIN public.calendar_holidays ch
                       ON ch.calendar_id = phc.calendar_id
                    WHERE phc.product_id = c.id
                      AND ch.date >= c.window_start
                      AND ch.date <  c.window_end
                 ), '[]'::jsonb) AS items
        ) hol
    ) s;

  RETURN jsonb_build_object(
    'users',              v_users,
    'certification_queue', v_queue,
    'attention_products', v_attention,
    'schedule_products',  v_schedule
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_dashboard() IS
  'The whole admin dashboard in one document: per-role user counts (email-verified '
  'and, for gedus, certified — both NULL where the stat has no meaning for the '
  'role), the uncertified-gedu queue, live products carrying at least one ops '
  'issue, and the calendar facts the schedule and coming-up feed resolve weeks '
  'from. Admin-only, guard-first on assert_admin. Both product sections ask '
  'effective_status() rather than products.status, and every date window is '
  'computed in the product''s own timezone. Product names are shipped as the whole '
  'product_translations array because which one to read is a property of the '
  'reader, exactly as every other admin surface treats them.';

-- A created function comes back PUBLIC-executable, so the REVOKE is load-bearing
-- rather than boilerplate. `authenticated` because the admin calls it with their
-- own session and the guard is what makes that safe; `service_role` to match the
-- other admin jsonb reader (get_product_groups_with_details).
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO service_role;

-- Assert the end state rather than trusting that the statements above did what
-- they look like they did. Apply-time protection: it says what was true when
-- 00191 ran, and nothing about later migrations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_admin_dashboard'
  ) THEN
    RAISE EXCEPTION 'get_admin_dashboard is missing';
  END IF;

  -- SECURITY DEFINER is what lets the function read across every family's rows
  -- once the guard has established the caller is an admin.
  IF NOT (
    SELECT p.prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_admin_dashboard'
  ) THEN
    RAISE EXCEPTION 'get_admin_dashboard is not SECURITY DEFINER';
  END IF;

  -- A STRICT function skips its body on NULL input, which would mean skipping
  -- the guard. This one takes no arguments, so it could only ever become STRICT
  -- by accident — which is exactly the kind of accident worth pinning.
  IF (
    SELECT p.proisstrict
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_admin_dashboard'
  ) THEN
    RAISE EXCEPTION 'get_admin_dashboard is STRICT — its guard would never run';
  END IF;

  IF NOT has_function_privilege(
       'authenticated', 'public.get_admin_dashboard()', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE get_admin_dashboard — the admin dashboard calls it through the admin''s own session';
  END IF;

  IF has_function_privilege('anon', 'public.get_admin_dashboard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE get_admin_dashboard — the REVOKE FROM PUBLIC did not take';
  END IF;
END;
$$;
