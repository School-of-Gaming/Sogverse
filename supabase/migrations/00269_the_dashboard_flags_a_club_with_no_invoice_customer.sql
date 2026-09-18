-- The dashboard flags a municipality club with no invoice customer.
--
-- WHAT THIS IS FOR
--
-- 00268 made a municipality club name the Fennoa customer its invoice is
-- addressed to, and left the link nullable: a club is created before anybody
-- has agreed who pays for it, so a NOT NULL would stop an admin saving a club
-- at all. The gap was reported in exactly one place — the monthly invoicing
-- ledger, which flags the club and refuses to write its file.
--
-- That is where the gap COSTS something, and it is not where it is found. The
-- CFO meets it on the day the invoices go out, and the admin who could have
-- fixed it is not the person reading that page.
--
-- OWNER RULING (2026-09-15)
--
-- Every municipality club should have both its fee and its invoice customer set
-- by the time it starts. A missing customer is an admin omission of exactly the
-- same kind as a missing fee, so it belongs in the same queue: the admin
-- dashboard's attention list, which is the surface an admin opens their day in.
--
-- WHERE IT RANKS
--
-- Last, directly below the missing municipality fee, which is the bottom of the
-- ranking today. Both are a blank field on one form with one consequence — a
-- month's invoice file that cannot be written — and the fee ranks a hair higher
-- only because it additionally leaves the ledger's own total short. The order
-- between the two is not load-bearing; what is load-bearing is that they sit
-- together, at the bottom, below everything about a child or an educator.
--
-- WHAT THIS MIGRATION DOES
--
-- One thing: `get_admin_dashboard` gains `missing_invoice_customer` beside
-- `missing_municipality_fee` in every attention candidate, and the filter that
-- decides whether a product is a candidate at all gains the same test — so a
-- club whose ONLY problem is the missing buyer is now in the list, where before
-- it was absent. The body is otherwise the one `schema.sql` holds, unchanged.
--
-- The function is replaced rather than dropped, so its grants survive; they are
-- restated below anyway, because a recreated function can come back
-- PUBLIC-executable and the REVOKE is what closes that.

-- ---------------------------------------------------------------------------
-- 1. The dashboard read, with the seventh kind of wrong.
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

  RETURN jsonb_build_object(
    'users',              v_users,
    'certification_queue', v_queue,
    'attention_products', v_attention,
    'schedule_products',  v_schedule
  );
END;
$$;

-- The description, restated whole: a COMMENT ON is replaced rather than
-- appended to, so the sentence this migration adds ships with every sentence
-- before it.

COMMENT ON FUNCTION public.get_admin_dashboard() IS 'The whole admin dashboard in one document: per-role user counts (email-verified and, for gedus, certified — either can be NULL, where the stat has no meaning: certified only means something for an educator, and verified is NULL for a role none of whose accounts holds a real address, which is every gamer unless their parent chose sign-in mode email), the uncertified-gedu queue, live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Since 00201 each queue candidate also carries contract_accepted_at — when they accepted the current gedu contract, or NULL — which informs the certification decision without gating it; since 00202 that standing is judged on the version''s BASE, so either equally binding language of the current version counts, and a candidate holding both carries the earlier of the two signatures. Since 00213 each candidate additionally carries criminal_record_check_at — when an admin recorded seeing their criminal record extract, or NULL — which informs the same decision on the same terms and gates nothing either; the flag beside it is not shipped because the stamp is non-NULL exactly when the flag is true. Since 00207 the waitlist attention item asks whether there is something for an admin to DO rather than what state the product is in: an open seat that already carries a live seat offer is subtracted, so a product whose every open seat has been offered drops out of the queue, and a decline or an expiry raises it again on its own. The count rides in the emitted object as live_offer_count so the page can explain the absence. Since 00241 an unstaffed group with NO active member is named too, in its own empty_groups_without_gedu array beside groups_without_gedu, and can put a product in the queue by itself: the empty group used to be carved out of the group check entirely, on the reasoning that an admin pre-building next term has not made a mistake, and that reasoning now decides its RANK on the page rather than hiding it. The two arrays are disjoint by construction and neither holds a group somebody is assigned to. Both product sections ask effective_status() and nothing else: since 00256 there is no stored status to pre-filter on, so the derived answer is the only lifecycle test either candidate set makes, and every date window is computed in the product''s own timezone. Since 00269 each attention candidate also carries missing_invoice_customer — municipality clubs only, true when the club names no Fennoa invoice customer, and false everywhere else by construction because the CHECK forbids the column on any other product type. It puts a club in the queue on its own, exactly as the municipality fee beside it does: the link is nullable because a club is created before anybody has agreed who pays for it, and by the time it starts both the fee and the buyer are meant to be set, so a club still missing one is an admin omission rather than an ordinary state. The two are the bottom of the page''s ranking and sit together there, because both are a blank field on one form with one consequence — a month of invoices that cannot be written for that buyer. Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';

-- ---------------------------------------------------------------------------
-- 2. The grants, restated.
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE keeps the existing ACL, so these are a re-assertion rather
-- than a change. They are written out anyway because a created or recreated
-- function has been observed coming back PUBLIC-executable, and this function
-- is SECURITY DEFINER: the REVOKE is the load-bearing line, and the two GRANTs
-- are the exact pair 00256 last stated.

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Assert the end state.
-- ---------------------------------------------------------------------------
-- Section 1 replaced the whole body, so every invariant an earlier migration
-- pinned for this function is RE-DERIVED below from the body as this file leaves
-- it. Five migrations pinned one: 00191 (it exists, SECURITY DEFINER, not
-- STRICT, the grants), 00201 (contract_accepted_at, the guard, the four
-- sections), 00202 (the contract BASE comparison and the min() that survives a
-- gedu holding both languages), 00207 (live_offer_count) and 00213 (
-- criminal_record_check_at, and 00202's and 00207's clauses carried forward).
-- A superseded migration's DO block is otherwise the last place those
-- invariants were ever checked, and five replacements since 00213 have carried
-- none of them.
--
-- plpgsql bodies are not validated at DDL time, so a body naming a column that
-- is not there compiles fine here and fails in front of an admin. The key
-- checks below are what make the new flag safe to trust: one proves it is
-- emitted, and one proves the CANDIDATE FILTER tests it too — without the
-- second, a club whose only problem is the missing customer would still be
-- absent from the list and the flag would be true only for clubs something else
-- had already put there.

DO $$
DECLARE
  v_sig constant text := 'public.get_admin_dashboard()';
  v_needle constant text := 'AND c.invoice_customer_id IS NULL';
  v_src      text;
  v_prov     "char";
  v_strict   boolean;
  v_secdef   boolean;
  v_config   text[];
  v_key      text;
  v_hits     integer;
BEGIN
  SELECT pr.prosrc, pr.provolatile, pr.proisstrict, pr.prosecdef, pr.proconfig
    INTO v_src, v_prov, v_strict, v_secdef, v_config
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

  -- --- (b) The new flag is emitted. ----------------------------------------
  IF position('''missing_invoice_customer''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard does not emit missing_invoice_customer';
  END IF;

  -- --- (c) And the candidate filter asks the same question. ----------------
  -- Two occurrences: the one that builds the flag, and the one in the WHERE
  -- that decides whether the product is in the list at all. One occurrence is
  -- precisely the half-done state this check exists to refuse.
  v_hits := (length(v_src) - length(replace(v_src, v_needle, ''))) / length(v_needle);
  IF v_hits < 2 THEN
    RAISE EXCEPTION
      'get_admin_dashboard tests invoice_customer_id % time(s) — the emitted flag and the candidate filter both have to ask',
      v_hits;
  END IF;

  -- --- (d) Every key the client contract parses. ---------------------------
  -- Derived from the zod schemas the db tests parse live output through. Each
  -- is checked with its quotes so a key is not matched inside a longer one, and
  -- the point of listing the old ones beside the new one is that a future
  -- replacement copying a stale body would drop one silently.
  FOREACH v_key IN ARRAY ARRAY['''users''', '''certification_queue''',
                               '''attention_products''', '''schedule_products''',
                               '''contract_accepted_at''',
                               '''criminal_record_check_at''',
                               '''unassigned_count''', '''groups_without_gedu''',
                               '''empty_groups_without_gedu''',
                               '''live_offer_count''', '''missing_gedu_fee''',
                               '''missing_municipality_fee''',
                               '''missing_invoice_customer''',
                               '''schedule_slots''', '''timezone'''] LOOP
    IF position(v_key IN v_src) = 0 THEN
      RAISE EXCEPTION
        'get_admin_dashboard no longer emits %, which the client parses', v_key;
    END IF;
  END LOOP;

  -- --- (e) 00202's and 00207's clauses, re-derived. ------------------------
  -- Neither is visible in a key name, which is what makes them the two easiest
  -- things in this body to lose to a copy from a stale source: a dropped BASE
  -- comparison reads as an educator who never signed, and a dropped min() as an
  -- error on the one educator who signed twice.
  IF position('split_part(ca.contract_version' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard no longer compares contract BASES (00202)';
  END IF;

  IF position('min(ca.accepted_at)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard would error on a gedu holding both contract languages (00202)';
  END IF;

  IF position('seat_offer_sent_at' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard lost the live seat-offer subtraction (00207)';
  END IF;

  -- --- (f) 00256's sweep, re-derived for this body alone. ------------------
  -- Word-anchored, exactly as 00256 wrote it, so the effective_product_status
  -- this body legitimately never names is not what trips it. A replacement is
  -- precisely where a body copied from a pre-00256 source would reintroduce the
  -- dropped column, and plpgsql would not notice until an admin opened the page.
  IF v_src ~ '\mproduct_status\M' THEN
    RAISE EXCEPTION 'get_admin_dashboard names product_status — the column was dropped in 00256';
  END IF;

  -- --- (g) Reachable by an admin's own session, and by nobody's anon one. ---
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
