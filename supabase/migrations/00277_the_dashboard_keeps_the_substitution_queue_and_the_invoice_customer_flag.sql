-- The dashboard keeps the substitution queue AND the invoice-customer flag.
--
-- WHY
--
-- Two branches replaced `get_admin_dashboard` in the same fortnight, and each
-- wrote its new body over a copy taken before the other's landed. 00269 added
-- the seventh kind of wrong to the attention queue — `missing_invoice_customer`,
-- a municipality club naming no Fennoa buyer — over the body 00256 left. The
-- substitution-request work added the fifth member, `substitution_requests`, and then its
-- schedule slots, over the same 00256 body. Neither replacement is wrong on its
-- own; together, the one that runs LAST wins the whole body, and that is 00275.
--
-- So in every database built from `migrations/` in order — CI's DB tests, and
-- the production release — 00275 silently reverts 00269, the dashboard document
-- comes back without `missing_invoice_customer`, and the client contract that
-- REQUIRES the field fails the whole page with "Could not load the dashboard".
-- Nothing catches it earlier: the two migrations touch no common line, so
-- neither merge nor a diff of them says anything, and only a from-scratch build
-- runs both.
--
-- WHAT THIS MIGRATION IS
--
-- The merge, as a new migration, because an applied migration is never edited
-- (supabase/CLAUDE.md, "Never amend a pushed migration"). The body below is
-- 00275's verbatim with exactly the two things 00269 added to the attention
-- queue put back into it, derived by diffing 00269 against 00256 — the body it
-- replaced — rather than retyped:
--
--   * `missing_invoice_customer` beside `missing_municipality_fee` in each
--     attention candidate's document, and
--   * the matching test in the candidate FILTER, so a club whose ONLY problem is
--     the missing buyer is in the list rather than merely flagged once something
--     else has already put it there.
--
-- Nothing else moves. Every other line is 00275's, and the grants and the
-- comment are restated because a recreated function can come back
-- PUBLIC-executable and the REVOKE is what closes that.
--
-- The five substitution migrations were renumbered when this branch was rebased,
-- so that they sort above everything `dev`, `main` and staging already held. That
-- is also why this migration is needed and not merely tidy: moving the
-- substitution work above 00269 is exactly what guarantees 00275 runs after it.
--
-- Any later change to this function starts from the body below, which is the
-- only one that carries both branches' work.

-- ---------------------------------------------------------------------------
-- 1. The dashboard read: the substitution queue's body, with the seventh kind of
--    wrong put back into the attention queue.
-- ---------------------------------------------------------------------------

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
          OR (c.product_type = 'municipality_club'
              AND c.invoice_customer_id IS NULL)
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

-- ---------------------------------------------------------------------------
-- 2. The grants, restated.
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE keeps the existing ACL, so these are a re-assertion rather
-- than a change. They are written out anyway because a recreated function has
-- been observed coming back PUBLIC-executable, and this one is SECURITY
-- DEFINER: the REVOKE is the load-bearing line.

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_admin_dashboard() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The comment, extended rather than restated.
-- ---------------------------------------------------------------------------
-- The comment this function carries when this migration runs is already the sum
-- of both branches: the last full restatement wrote the invoice-customer
-- sentence, and each substitution migration appended its own to whatever it found. A
-- CREATE OR REPLACE keeps it, so the merge has nothing to repair there and one
-- sentence to add. Restating several hundred words by hand is the failure
-- supabase/CLAUDE.md names; the read is from the catalog and the write is one
-- format(). The assertion below proves both branches' sentences survived.

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
    ' Since 00277 this body is the MERGE of two replacements that were each'
    ' written over a copy of the same older body: the one that added'
    ' missing_invoice_customer to the attention queue, and the one that added the'
    ' substitution queue and its schedule slots. Run in order the later of the two'
    ' reverted the earlier, so the flag is restored here beside everything the'
    ' substitution work added, and every sentence above describes this one body.');
END $$;

-- ---------------------------------------------------------------------------
-- 4. Assert the end state.
-- ---------------------------------------------------------------------------
-- Section 1 replaced the whole body, so the invariants of BOTH migrations this
-- one supersedes are re-derived below from the body as this file leaves it —
-- and a superseded migration's DO block is otherwise the last place its
-- invariants were ever checked. From the invoice-customer replacement: the
-- function's posture (guard-first, not STRICT, SECURITY DEFINER, STABLE, empty
-- search_path), the flag emitted AND tested in the candidate filter, every key
-- the client contract parses, the contract-BASE and live-seat-offer clauses
-- that no key name would reveal, the dropped product_status column, and the
-- grants. From the substitution-queue replacement: two emitted schedule_slots keys
-- from two reads of the slots table, the fifth top-level member, and the same
-- grants.
--
-- plpgsql bodies are not validated at DDL time, so a body naming a column that
-- is not there compiles fine here and fails in front of an admin. That is
-- exactly what a merge of two bodies risks, which is why the checks below are
-- counts and not existence tests wherever a half-done merge would still leave
-- one occurrence standing.

DO $$
DECLARE
  v_sig    constant text := 'public.get_admin_dashboard()';
  v_needle constant text := 'AND c.invoice_customer_id IS NULL';
  v_src     text;
  v_comment text;
  v_prov    "char";
  v_strict  boolean;
  v_secdef  boolean;
  v_config  text[];
  v_key     text;
  v_hits    integer;
  v_slots   integer;
  v_joins   integer;
BEGIN
  SELECT pr.prosrc, pr.provolatile, pr.proisstrict, pr.prosecdef, pr.proconfig,
         obj_description(pr.oid, 'pg_proc')
    INTO v_src, v_prov, v_strict, v_secdef, v_config, v_comment
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname = 'get_admin_dashboard';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'get_admin_dashboard is missing after being replaced';
  END IF;

  IF (SELECT count(*) FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
       WHERE n.nspname = 'public' AND pr.proname = 'get_admin_dashboard') <> 1 THEN
    RAISE EXCEPTION 'get_admin_dashboard is overloaded — a call would be ambiguous';
  END IF;

  -- --- (a) Guard-first, and the posture the guard depends on. --------------
  -- The guard has to precede every read, which for this body means the first
  -- SELECT: everything it does after the PERFORM is a query against a table an
  -- ordinary caller has no business reading.
  IF position('PERFORM public.assert_admin();' IN v_src) = 0
     OR position('PERFORM public.assert_admin();' IN v_src) > position('SELECT' IN v_src) THEN
    RAISE EXCEPTION 'get_admin_dashboard does not gate on assert_admin before anything else';
  END IF;

  IF v_strict THEN
    RAISE EXCEPTION 'get_admin_dashboard is STRICT — it would skip its body, and its guard';
  END IF;

  IF NOT v_secdef THEN
    RAISE EXCEPTION 'get_admin_dashboard is not SECURITY DEFINER — it reads every role''s rows on an admin''s behalf';
  END IF;

  IF v_prov <> 's' THEN
    RAISE EXCEPTION 'get_admin_dashboard is not STABLE';
  END IF;

  IF v_config IS NULL OR NOT (v_config @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'get_admin_dashboard does not pin an empty search_path';
  END IF;

  -- --- (b) The flag the later replacement dropped, emitted again. ----------
  IF position('''missing_invoice_customer''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard does not emit missing_invoice_customer';
  END IF;

  -- --- (c) And the candidate filter asks the same question. ----------------
  -- Two occurrences: the one that builds the flag, and the one in the WHERE
  -- that decides whether the product is in the list at all. One occurrence is
  -- precisely the half-done state this check exists to refuse — and a merge of
  -- two bodies is the likeliest way to reach it.
  v_hits := (length(v_src) - length(replace(v_src, v_needle, ''))) / length(v_needle);
  IF v_hits < 2 THEN
    RAISE EXCEPTION
      'get_admin_dashboard tests invoice_customer_id % time(s) — the emitted flag and the candidate filter both have to ask',
      v_hits;
  END IF;

  -- --- (d) The substitution queue the other replacement added. --------------------
  -- TWO emitted schedule_slots keys, from TWO reads of the slots table: the
  -- schedule set's and the substitution queue's. One would mean the substitution queue's key
  -- was lost in the merge; one would equally mean it landed by displacing the
  -- schedule set's, which is the shape a careless copy takes.
  v_slots := (length(v_src) - length(replace(v_src, '''schedule_slots''', ''))) / length('''schedule_slots''');
  v_joins := (length(v_src) - length(replace(v_src, 'public.schedule_slots', ''))) / length('public.schedule_slots');

  IF v_slots <> 2 OR v_joins <> 2 THEN
    RAISE EXCEPTION
      'get_admin_dashboard emits % schedule_slots keys from % reads of the slots table, expected 2 and 2',
      v_slots, v_joins;
  END IF;

  -- --- (e) Every key the client contract parses. ---------------------------
  -- Derived from the zod schemas the db tests parse live output through, and
  -- spanning both branches on purpose: this is the list a future replacement
  -- copying one branch's stale body would come up short against.
  FOREACH v_key IN ARRAY ARRAY['''users''', '''certification_queue''',
                               '''attention_products''', '''schedule_products''',
                               '''substitution_requests''',
                               '''contract_accepted_at''',
                               '''criminal_record_check_at''',
                               '''unassigned_count''', '''groups_without_gedu''',
                               '''empty_groups_without_gedu''',
                               '''live_offer_count''', '''missing_gedu_fee''',
                               '''missing_municipality_fee''',
                               '''missing_invoice_customer''',
                               '''schedule_slots''', '''timezone''',
                               '''session_date''', '''offers''',
                               '''reason''', '''reason_note'''] LOOP
    IF position(v_key IN v_src) = 0 THEN
      RAISE EXCEPTION
        'get_admin_dashboard no longer emits %, which the client parses', v_key;
    END IF;
  END LOOP;

  -- --- (f) The clauses no key name would reveal. ---------------------------
  -- None of these is visible as a key, which is what makes them the easiest
  -- things in this body to lose to a copy from a stale source: a dropped BASE
  -- comparison reads as an educator who never signed, a dropped min() as an
  -- error on the one educator who signed twice, and a dropped seat-offer
  -- subtraction as a waitlist flag nobody can clear.
  IF position('split_part(ca.contract_version' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard no longer compares contract BASES';
  END IF;

  IF position('min(ca.accepted_at)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard would error on a gedu holding both contract languages';
  END IF;

  IF position('seat_offer_sent_at' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard lost the live seat-offer subtraction';
  END IF;

  -- The substitution queue drops a request whose date has passed, in the product's own
  -- timezone, and that comparison is the whole clock the queue has.
  IF position('r.session_date >= (now() AT TIME ZONE p.timezone)::date' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard no longer bounds the substitution queue at today in the product''s zone';
  END IF;

  -- Word-anchored, so the effective_product_status this body legitimately never
  -- names is not what trips it. A replacement is precisely where a body copied
  -- from a source predating the column's removal would reintroduce it, and
  -- plpgsql would not notice until an admin opened the page.
  IF v_src ~ '\mproduct_status\M' THEN
    RAISE EXCEPTION 'get_admin_dashboard names product_status — the column no longer exists';
  END IF;

  -- --- (g) The comment still carries both branches' sentences. -------------
  -- Each half is a phrase only that branch's own migration wrote. The sentence
  -- appended above names missing_invoice_customer itself, so looking for that
  -- token would pass on a comment that had lost the flag's own sentence.
  IF v_comment IS NULL
     OR position('Since 00269' IN v_comment) = 0
     OR position('schedule_slots' IN v_comment) = 0 THEN
    RAISE EXCEPTION
      'get_admin_dashboard''s comment lost one of the two branches it describes';
  END IF;

  -- --- (h) Reachable by an admin's own session, and by nobody's anon one. ---
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_dashboard lost a grant it needs';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_dashboard is executable by anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
      CROSS JOIN LATERAL aclexplode(pr.proacl) acl
     WHERE n.nspname = 'public' AND pr.proname = 'get_admin_dashboard'
       AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'get_admin_dashboard is executable by PUBLIC';
  END IF;
END $$;
