-- A gedu presents a criminal record extract, and the platform remembers that
-- somebody looked at it.
--
-- WHY
--
-- Finnish law (504/2002, laki lasten kanssa työskentelevien rikostaustan
-- selvittämisestä) requires that a person working with children present a
-- criminal record extract — a rikostaustaote — before the work begins. Two
-- properties of that law decide the whole of this schema:
--
--   * THE PERSON OBTAINS IT THEMSELVES. The extract is issued to the applicant
--     by the Legal Register Centre; we do not request it, receive it, or hold a
--     copy of it at any point.
--   * WE MAY NOT KEEP IT. The law permits recording only that an acceptable
--     extract was PRESENTED and WHEN. Storing the document, or anything out of
--     it, is not merely unnecessary here — it is the thing the statute forbids.
--
-- So there is no file, no reference number, no issue date, no offence data and
-- no place to put any of them. What the platform records is an admin's
-- statement that they saw a valid extract, the moment they said so, and which
-- admin it was. That is the entire fact, and the columns are shaped so nothing
-- more can be written even by accident.
--
-- Three columns, one reason each:
--
--   * `criminal_record_check_passed` — the flag itself: an admin has seen an
--     acceptable extract. NOT NULL DEFAULT false, because "nobody has recorded
--     this yet" and "it was recorded as not passing" are the same operational
--     state — the check has not been satisfied — and a nullable tri-state would
--     invite a third reading of a fact that only has two.
--   * `criminal_record_check_at` — WHEN it was presented, which is half of what
--     the law says may be recorded. Stamped server-side by the RPC and by
--     nothing else: a timestamp a client can choose proves nothing.
--   * `criminal_record_check_by` — which admin's statement this is. Audit only.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- It gates nothing. Exactly like contract acceptance (00201), a missing or
-- failed check does not narrow a gedu's access, does not hide a surface and does
-- not fail a call anywhere. Admin CERTIFICATION remains the platform's only
-- blocking lever over an educator (00187), and keeping it the only one is the
-- point: independent gates on the same person are how an account ends up in a
-- state nobody can explain. What the flag buys an admin is VISIBILITY — the
-- certification queue says whether the candidate in front of them has presented
-- an extract, and when — so it INFORMS the certification decision rather than
-- pre-empting it.
--
-- WHY WRITES GO THROUGH ONE RPC
--
-- The same argument `set_gedu_certified` makes about the same table: every
-- field a forger would want — the flag, the moment, the admin — is derived
-- server-side from the session and the server clock. `gedu_profiles` carries no
-- write grant for any Data API role, so the RPC below is the only door in, and
-- the audit stamps cannot be written by the person they are about.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.gedu_profiles
  ADD COLUMN criminal_record_check_passed boolean NOT NULL DEFAULT false,
  ADD COLUMN criminal_record_check_at     timestamptz,
  ADD COLUMN criminal_record_check_by     uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.gedu_profiles.criminal_record_check_passed IS
  'Whether an admin has seen an acceptable criminal record extract '
  '(rikostaustaote) for this educator. The DOCUMENT IS NEVER STORED: Finnish '
  'law 504/2002 has the person obtain the extract themselves and permits the '
  'employer to record only that it was presented and when, so this flag plus '
  'criminal_record_check_at is the whole of what the platform may hold. Gates '
  'NOTHING — exactly like contract acceptance, it informs the certification '
  'decision and does not pre-empt it; admin certification remains the only '
  'blocking lever over an educator. false covers both "not recorded yet" and '
  '"recorded as not passing", which are the same operational state.';

COMMENT ON COLUMN public.gedu_profiles.criminal_record_check_at IS
  'When the extract was presented, stamped server-side by '
  'set_gedu_criminal_record_check and NULL whenever the flag is false. It is '
  'the second half of what the law allows us to record, and a client never '
  'supplies it — a moment the subject could choose would prove nothing about '
  'when anybody saw anything.';

COMMENT ON COLUMN public.gedu_profiles.criminal_record_check_by IS
  'The admin whose statement this was, stamped alongside '
  'criminal_record_check_at. Audit only — nothing renders it and no surface '
  'reads it. ON DELETE SET NULL, so a departed admin leaves the check recorded '
  'without the name; losing an account must never silently unrecord a check '
  'that was made.';

-- ---------------------------------------------------------------------------
-- 2. The one door in
-- ---------------------------------------------------------------------------
--
-- Mirrors set_gedu_certified statement for statement, because it is the same
-- shape of fact about the same table: an admin's verdict on one educator, with
-- the audit pair stamped from the session and the server clock. Un-setting
-- nulls both stamps rather than leaving them behind — a moment attached to a
-- check that is not recorded would be a record of nothing.

CREATE FUNCTION public.set_gedu_criminal_record_check(
  p_gedu_id uuid,
  p_passed  boolean
)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_criminal_record_check: % is not a gedu', p_gedu_id;
  END IF;

  UPDATE public.gedu_profiles
  SET criminal_record_check_passed = p_passed,
      criminal_record_check_at     = CASE WHEN p_passed THEN now() ELSE NULL END,
      criminal_record_check_by     = CASE WHEN p_passed THEN (SELECT auth.uid()) ELSE NULL END
  WHERE user_id = p_gedu_id;
END;
$$;

COMMENT ON FUNCTION public.set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean) IS
  'Record — or withdraw — that an admin has seen an acceptable criminal record '
  'extract (rikostaustaote) for one game educator. The document itself is never '
  'stored: Finnish law 504/2002 has the educator obtain it themselves and lets '
  'us keep only the fact that it was presented and when. Admin-only, guard-first '
  'on assert_admin, and it refuses a target that is not a gedu. It stamps '
  'criminal_record_check_at / criminal_record_check_by server-side so the audit '
  'trail cannot be forged — which is why gedu_profiles carries no write grant at '
  'all and this RPC is the only way in — and nulls both when the check is '
  'withdrawn. Recording it GATES NOTHING: like contract acceptance it informs '
  'the certification decision, and admin certification remains the only blocking '
  'lever over an educator. Called from the admin user-detail page through the '
  'admin''s own session, which is why authenticated is the only role granted '
  'EXECUTE.';

-- A created function comes back PUBLIC-executable, so the REVOKE is load-bearing
-- rather than boilerplate. `authenticated` only: the admin calls it with their
-- own session and the guard is what makes that safe. No `service_role` grant —
-- nothing server-side records a criminal record check, and a function whose
-- whole meaning is "an admin looked at a document" has no sensible backend
-- caller.
REVOKE EXECUTE ON FUNCTION public.set_gedu_criminal_record_check(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_gedu_criminal_record_check(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The certification queue reports the check
-- ---------------------------------------------------------------------------
--
-- The body below is the CURRENT definition of get_admin_dashboard (as
-- supabase/schema.sql holds it, which is what 00207 left behind) with ONE
-- change: each candidate in section 2 additionally carries
-- `criminal_record_check_at`. Everything else is verbatim.
--
-- Only the moment travels, and not the flag beside it. The RPC above maintains
-- the invariant that the stamp is non-NULL exactly when the flag is true, so a
-- second field would be derivable from the first and could only ever disagree
-- with it. NULL therefore reads as "no check recorded", which is the same thing
-- the flag says.
--
-- It is a plain column read off the row the queue already joins — no subquery,
-- no extra scan — because the fact lives on gedu_profiles rather than in a
-- table of its own. That is the whole difference between this and
-- contract_accepted_at above it: a check is one admin's current verdict, not a
-- version-keyed history.

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
  -- Five kinds of wrong, and each is stated as the fact rather than as a sentence
  -- — the page words them, because the wording is translated copy.
  --
  --   * `unassigned_count`  — active seats sitting in no group. A child enrolled
  --                           and nobody looking after them is the worst of these.
  --   * `groups_without_gedu` — a group with members and no educator assigned. An
  --                           EMPTY group is not flagged: an admin building the
  --                           term's groups ahead of time has not made a mistake.
  --   * `waitlist`          — people queueing while seats stand open AND those
  --                           seats have not all been offered to somebody. Only
  --                           meaningful on a capped product with the queue
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

-- CREATE OR REPLACE keeps the function's ACL, but the repo restates grants on
-- every recreation so a future DROP/CREATE cycle cannot silently drop them —
-- and the REVOKE is what closes the PUBLIC-executable window if one ever does.
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO service_role;

COMMENT ON FUNCTION public.get_admin_dashboard() IS
  'The whole admin dashboard in one document: per-role user counts (email-verified and, for gedus, certified — both NULL where the stat has no meaning for the role), the uncertified-gedu queue, live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Since 00201 each queue candidate also carries contract_accepted_at — when they accepted the current gedu contract, or NULL — which informs the certification decision without gating it; since 00202 that standing is judged on the version''s BASE, so either equally binding language of the current version counts, and a candidate holding both carries the earlier of the two signatures. Since 00213 each candidate additionally carries criminal_record_check_at — when an admin recorded seeing their criminal record extract, or NULL — which informs the same decision on the same terms and gates nothing either; the flag beside it is not shipped because the stamp is non-NULL exactly when the flag is true. Since 00207 the waitlist attention item asks whether there is something for an admin to DO rather than what state the product is in: an open seat that already carries a live seat offer is subtracted, so a product whose every open seat has been offered drops out of the queue, and a decline or an expiry raises it again on its own. The count rides in the emitted object as live_offer_count so the page can explain the absence. Both product sections ask effective_status() rather than products.status, and every date window is computed in the product''s own timezone. Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';

-- ---------------------------------------------------------------------------
-- 4. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Everything below runs against the database this file was just applied to, so a
-- silent no-op (an already-claimed version number, a grant that did not take)
-- fails here rather than three weeks later. Apply-time protection: it says what
-- was true when 00213 ran, and nothing about later migrations.

DO $assert$
DECLARE
  v_column text;
  v_count  integer;
  v_src    text;
BEGIN
  -- --- (a) The three columns exist, with the shape the RPC assumes. ---------
  SELECT count(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'gedu_profiles'
     AND column_name IN (
           'criminal_record_check_passed',
           'criminal_record_check_at',
           'criminal_record_check_by'
         );

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'gedu_profiles carries % of the 3 criminal_record_check* columns', v_count;
  END IF;

  -- The flag is the only one of the three that is NOT NULL, and its default is
  -- what makes every gedu that predates this migration read as unchecked rather
  -- than as unknown.
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'gedu_profiles'
       AND column_name = 'criminal_record_check_passed'
       AND is_nullable = 'NO'
       AND column_default = 'false'
  ) THEN
    RAISE EXCEPTION 'criminal_record_check_passed is not NOT NULL DEFAULT false';
  END IF;

  -- ON DELETE SET NULL on the audit reference: a departed admin must leave the
  -- check recorded rather than take the row with them.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.gedu_profiles'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'public.profiles'::regclass
       AND c.confdeltype = 'n'  -- SET NULL
       AND (
         SELECT array_agg(a.attname::text)
           FROM pg_attribute a
          WHERE a.attrelid = c.conrelid
            AND a.attnum = ANY (c.conkey)
       ) = ARRAY['criminal_record_check_by']
  ) THEN
    RAISE EXCEPTION 'criminal_record_check_by has no ON DELETE SET NULL foreign key to profiles';
  END IF;

  -- --- (b) The write posture: readable, and writable by nobody. ------------
  --
  -- The columns inherit gedu_profiles' ACL, which carries no write grant at
  -- all. Asserted per column rather than once, because a column-level grant is
  -- exactly the thing that would slip past a table-level check.
  FOREACH v_column IN ARRAY ARRAY[
    'criminal_record_check_passed',
    'criminal_record_check_at',
    'criminal_record_check_by'
  ] LOOP
    IF has_column_privilege('authenticated', 'public.gedu_profiles', v_column, 'UPDATE') THEN
      RAISE EXCEPTION 'authenticated can UPDATE gedu_profiles.% — the audit stamp would be forgeable', v_column;
    END IF;

    IF has_column_privilege('authenticated', 'public.gedu_profiles', v_column, 'INSERT') THEN
      RAISE EXCEPTION 'authenticated can INSERT gedu_profiles.% — every write goes through the RPC', v_column;
    END IF;

    IF NOT has_column_privilege('authenticated', 'public.gedu_profiles', v_column, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated cannot SELECT gedu_profiles.% — the admin surfaces read it under RLS', v_column;
    END IF;
  END LOOP;

  -- --- (c) The RPC: exists, guards first, and is exposed to one role. ------
  IF to_regprocedure('public.set_gedu_criminal_record_check(uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'set_gedu_criminal_record_check was not created';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'set_gedu_criminal_record_check';

  IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'set_gedu_criminal_record_check does not guard on assert_admin';
  END IF;

  -- SECURITY DEFINER with an empty search_path: the function bypasses RLS to
  -- write a table nobody may write, so an inherited search_path would be the
  -- one thing standing between that and a hijacked unqualified name.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'set_gedu_criminal_record_check'
       AND p.prosecdef
       AND p.proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'set_gedu_criminal_record_check is not SECURITY DEFINER with search_path set to the empty string';
  END IF;

  -- A STRICT function skips its body on NULL input, which would skip the guard
  -- with it — the authorization spine calls every exposed RPC with all-NULL
  -- arguments and requires 42501.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'set_gedu_criminal_record_check'
       AND p.proisstrict
  ) THEN
    RAISE EXCEPTION 'set_gedu_criminal_record_check is STRICT — its guard would not run on NULL arguments';
  END IF;

  IF NOT has_function_privilege(
    'authenticated', 'public.set_gedu_criminal_record_check(uuid, boolean)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE set_gedu_criminal_record_check — the admin UI calls it through the admin''s own session';
  END IF;

  IF has_function_privilege(
    'anon', 'public.set_gedu_criminal_record_check(uuid, boolean)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon can EXECUTE set_gedu_criminal_record_check — the REVOKE FROM PUBLIC did not take';
  END IF;

  IF has_function_privilege(
    'service_role', 'public.set_gedu_criminal_record_check(uuid, boolean)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role can EXECUTE set_gedu_criminal_record_check — nothing server-side records a criminal record check';
  END IF;

  -- --- (d) The dashboard took the new field and kept everything else. ------
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_admin_dashboard';

  IF position('criminal_record_check_at' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard did not take the criminal_record_check_at field';
  END IF;

  IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard lost its assert_admin guard';
  END IF;

  -- This file retyped the whole body, so the invariants of the migrations it
  -- supersedes are re-derived here rather than assumed: a lost section reads as
  -- an empty panel rather than as an error, and a lost contract clause reads as
  -- an unsigned educator.
  IF position('certification_queue' IN v_src) = 0
     OR position('attention_products' IN v_src) = 0
     OR position('schedule_products' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard lost one of its four sections';
  END IF;

  IF position('split_part(ca.contract_version' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard no longer compares contract BASES (00202)';
  END IF;

  IF position('min(ca.accepted_at)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard would error on a gedu holding both contract languages (00202)';
  END IF;

  IF position('live_offer_count' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard lost the live seat-offer subtraction (00207)';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_admin_dashboard()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_admin_dashboard()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'get_admin_dashboard lost an EXECUTE grant';
  END IF;

  IF has_function_privilege('anon', 'public.get_admin_dashboard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE get_admin_dashboard — the REVOKE FROM PUBLIC did not take';
  END IF;
END
$assert$;
