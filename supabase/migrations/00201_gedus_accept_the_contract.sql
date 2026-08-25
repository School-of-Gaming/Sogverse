-- Gedus accept the contract, and the platform remembers who signed what.
--
-- WHY
--
-- A gedu is an independent contractor, and the terms they work under
-- (Pelikasvattajan sopimusehdot) have never existed anywhere the platform can
-- see. Acceptance happened off-system or not at all, so there is no answer to
-- the only three questions that matter when it is later disputed: WHICH version
-- of the terms was agreed, WHEN, and BY WHOM. The lawyer's requirement is
-- exactly those three facts, and this migration is the smallest schema that
-- holds them honestly.
--
-- Each of the three has a column and a reason:
--
--   * `contract_version` — the version accepted, as a foreign key into a
--     whitelist rather than free text. Acceptance is VERSION-KEYED: the product
--     re-prompts when a gedu's accepted version is not the current one, so the
--     stored value has to be a thing the platform knows about, not a string
--     whoever called the RPC happened to send.
--   * `accepted_at` — stamped server-side by the RPC and by nothing else. A
--     timestamp a client can choose is a timestamp that proves nothing.
--   * `signed_name` — a SNAPSHOT of the signer's name as it stood at the moment
--     they signed, not a join to `profiles`. A name is editable by its owner, so
--     resolving it at read time would answer "what is this person called today"
--     when the question is "who signed this". The snapshot is the identity half
--     of the lawyer's requirement and it must not drift.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- It gates nothing. An unaccepted contract does not narrow a gedu's access, does
-- not hide a surface and does not fail a call anywhere. Admin CERTIFICATION
-- remains the platform's only blocking lever over an educator (00187), and
-- keeping it the only one is the point: two independent gates on the same person
-- is how an account ends up in a state nobody can explain. What acceptance buys
-- an admin is VISIBILITY — the certification queue now says whether the
-- candidate in front of them has signed, and when — so it informs the decision
-- rather than pre-empting it.
--
-- WHY THE VERSION WHITELIST IS A TABLE AND NOT AN ENUM
--
-- Versions arrive over time and only ever by migration, which is an enum's
-- shape too — but an enum carries no `created_at`, and "the CURRENT version" has
-- to be derivable from the data rather than from a constant in the app. A table
-- ordered by `created_at` answers it; an enum would need a second place to say
-- which member is live, and the two would eventually disagree. The table is
-- readable by every signed-in role (a gedu needs to know what to sign, an admin
-- needs to know what current means) and writable by nobody through the Data API.
--
-- WHY WRITES GO THROUGH ONE RPC
--
-- The same argument `set_gedu_certified` makes one table over: a row here is an
-- audit record, so every field a forger would want — the uid, the timestamp, the
-- name — is derived server-side from the session and from `profiles`, and the
-- only caller-supplied value is the version, which is checked against the
-- whitelist before anything is written. So `authenticated` holds SELECT on both
-- tables and nothing else, and the RPC is the one door in.

-- ---------------------------------------------------------------------------
-- 1. The version whitelist
-- ---------------------------------------------------------------------------

CREATE TABLE public.gedu_contract_versions (
  version    text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_gedu_contract_versions_version_not_empty CHECK (btrim(version) <> '')
);

COMMENT ON TABLE public.gedu_contract_versions IS
  'Every version of the gedu contract (Pelikasvattajan sopimusehdot) the '
  'platform knows about, one row each. Rows arrive by MIGRATION only — there is '
  'no write grant for any Data API role — because a version is a document that '
  'was drafted and published, not a value an app invents. The CURRENT version is '
  'the row with the greatest created_at, and that derivation is what makes '
  'acceptance version-keyed: a gedu whose accepted version is not the current '
  'one is re-prompted. Readable by every signed-in role, because a gedu needs to '
  'know what they are signing and an admin needs to know what "current" means.';

COMMENT ON COLUMN public.gedu_contract_versions.version IS
  'The version label as the document itself carries it, e.g. 2026-2027. The '
  'primary key, and the value gedu_contract_acceptances stores.';

COMMENT ON COLUMN public.gedu_contract_versions.created_at IS
  'When this version was added to the platform. Ordering key and nothing else: '
  'the greatest created_at IS the current version, which is the one question '
  'anything asks of this table.';

ALTER TABLE public.gedu_contract_versions ENABLE ROW LEVEL SECURITY;

-- One policy, SELECT only, every signed-in role. The table holds no personal
-- data at all — it is a list of document labels — so there is nothing here to
-- scope to a caller, and a narrower policy would only mean a gedu could not read
-- the name of the thing they are being asked to sign. Nothing for `anon`: the
-- contract is meaningless to somebody with no account.
CREATE POLICY signed_in_reads_gedu_contract_versions ON public.gedu_contract_versions
  FOR SELECT
  TO authenticated
  USING (true);

-- SELECT and nothing more for `authenticated`: versions are added by migration.
-- `service_role` gets the full set exactly as it does on gedu_profiles — it is
-- the trusted backend role, it holds BYPASSRLS anyway, and the DB suite asserts
-- against these tables through the admin client.
GRANT SELECT ON TABLE public.gedu_contract_versions TO authenticated;
GRANT ALL    ON TABLE public.gedu_contract_versions TO service_role;

-- The version in force at the time of writing. Its created_at is this
-- migration's own transaction timestamp, which is what makes it the current one.
INSERT INTO public.gedu_contract_versions (version) VALUES ('2026-2027');

-- ---------------------------------------------------------------------------
-- 2. The acceptances
-- ---------------------------------------------------------------------------

CREATE TABLE public.gedu_contract_acceptances (
  gedu_id          uuid NOT NULL
                     REFERENCES public.gedu_profiles(user_id) ON DELETE CASCADE,
  contract_version text NOT NULL
                     REFERENCES public.gedu_contract_versions(version),
  accepted_at      timestamptz NOT NULL DEFAULT now(),
  signed_name      text NOT NULL,
  PRIMARY KEY (gedu_id, contract_version),
  CONSTRAINT chk_gedu_contract_acceptances_signed_name_not_empty
    CHECK (btrim(signed_name) <> '')
);

COMMENT ON TABLE public.gedu_contract_acceptances IS
  'One row per (gedu, contract version) accepted: the whole of what the platform '
  'records about a gedu agreeing to the contract. The primary key is what makes '
  'acceptance idempotent — a gedu accepting the same version twice is the same '
  'fact, not a second one — and version-keyed, so a new version leaves the old '
  'row standing and re-prompts. Carries no write grant for any Data API role: '
  'every field a forger would want is stamped server-side by '
  'accept_gedu_contract, which is the only way in, the same arrangement '
  'gedu_profiles and set_gedu_certified have. Acceptance gates NOTHING — admin '
  'certification is the only blocking lever over an educator; this table informs '
  'that decision and does not pre-empt it.';

COMMENT ON COLUMN public.gedu_contract_acceptances.gedu_id IS
  'The educator who accepted. References gedu_profiles rather than profiles '
  'because only a gedu has a contract to accept, so the FK states that rather '
  'than leaving it to the RPC alone. ON DELETE CASCADE: an account that is gone '
  'has no contract standing.';

COMMENT ON COLUMN public.gedu_contract_acceptances.contract_version IS
  'Which version was accepted, FK into the whitelist. Not free text: the version '
  'decides whether the gedu is re-prompted, so a value the platform does not '
  'know about would be unanswerable rather than merely wrong.';

COMMENT ON COLUMN public.gedu_contract_acceptances.accepted_at IS
  'When the acceptance was recorded, stamped by the server inside '
  'accept_gedu_contract. A client never supplies it — a timestamp the signer '
  'chooses proves nothing about when they signed.';

COMMENT ON COLUMN public.gedu_contract_acceptances.signed_name IS
  'The signer''s full name AS IT STOOD when they signed, snapshotted from '
  'profiles by the RPC. Deliberately not a join: a profile name is editable by '
  'its owner, so resolving it at read time would answer what this person is '
  'called today when the question is who signed this. It is the identity half of '
  'the legal record and must not drift.';

ALTER TABLE public.gedu_contract_acceptances ENABLE ROW LEVEL SECURITY;

-- Two SELECT policies and no write policy, because there is no write grant for
-- either policy to authorize — writes arrive through the SECURITY DEFINER RPC,
-- which bypasses RLS entirely. The `(SELECT …)` wrapper on each predicate is the
-- standing form here: it makes the call an InitPlan evaluated once per statement
-- rather than once per row.
CREATE POLICY admins_read_gedu_contract_acceptances ON public.gedu_contract_acceptances
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY gedus_read_own_contract_acceptances ON public.gedu_contract_acceptances
  FOR SELECT
  TO authenticated
  USING (gedu_id = (SELECT auth.uid()));

GRANT SELECT ON TABLE public.gedu_contract_acceptances TO authenticated;
GRANT ALL    ON TABLE public.gedu_contract_acceptances TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The one door in
-- ---------------------------------------------------------------------------
--
-- No target parameter exists, and that absence is the security property: the
-- row is keyed to `auth.uid()`, so there is nothing for a caller to aim at
-- somebody else's acceptance. The version is the only thing they supply, and it
-- is checked against the whitelist before anything is written.

CREATE FUNCTION public.accept_gedu_contract(p_version text)
  RETURNS timestamptz
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_uid         uuid := (SELECT auth.uid());
  v_accepted_at timestamptz;
  v_signed_name text;
BEGIN
  -- Guard-first, in the one shape the authorization spine reads. A gedu is the
  -- only role with a contract to accept; everyone else is refused with 42501 on
  -- the first statement. The FK to gedu_profiles stands behind this as the
  -- schema's own claim — a profile that says 'gedu' with no gedu_profiles row is
  -- a data error, and the insert below fails loudly rather than writing an
  -- acceptance for an educator record that does not exist.
  PERFORM public.assert_role('gedu');

  -- Pre-empt the foreign key so the refusal names the real cause: a version the
  -- platform has never heard of, which is what a stale client sends after a new
  -- version ships. A NULL p_version lands here too — nothing matches it — which
  -- is the right answer to "accept nothing".
  IF NOT EXISTS (
    SELECT 1 FROM public.gedu_contract_versions v WHERE v.version = p_version
  ) THEN
    RAISE EXCEPTION 'accept_gedu_contract: % is not a contract version this platform knows', p_version
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Idempotent by design: accepting the same version twice is the same fact, so
  -- the first acceptance stands and its stamp is the answer. Re-stamping would
  -- quietly rewrite the legal record every time somebody reloaded the page.
  SELECT ca.accepted_at
    INTO v_accepted_at
    FROM public.gedu_contract_acceptances ca
   WHERE ca.gedu_id = v_uid
     AND ca.contract_version = p_version;

  IF FOUND THEN
    RETURN v_accepted_at;
  END IF;

  -- The identity snapshot. Both columns are NOT NULL on profiles (last_name
  -- defaults to the empty string), so the concatenation cannot be NULL and the
  -- btrim is what keeps a gedu with no surname from signing as "Aino ".
  SELECT btrim(pr.first_name || ' ' || pr.last_name)
    INTO v_signed_name
    FROM public.profiles pr
   WHERE pr.id = v_uid;

  INSERT INTO public.gedu_contract_acceptances (
    gedu_id, contract_version, accepted_at, signed_name
  )
  VALUES (v_uid, p_version, now(), v_signed_name)
  ON CONFLICT (gedu_id, contract_version) DO NOTHING
  RETURNING accepted_at INTO v_accepted_at;

  -- DO NOTHING fired, which means a concurrent call — the same gedu's second
  -- click — committed the row between the read above and this insert. The row
  -- that landed IS the acceptance, so read its stamp rather than raising: the
  -- caller asked for a fact to be true and it is.
  IF v_accepted_at IS NULL THEN
    SELECT ca.accepted_at
      INTO v_accepted_at
      FROM public.gedu_contract_acceptances ca
     WHERE ca.gedu_id = v_uid
       AND ca.contract_version = p_version;
  END IF;

  RETURN v_accepted_at;
END;
$$;

COMMENT ON FUNCTION public.accept_gedu_contract(p_version text) IS
  'Record that the CALLER accepted one version of the gedu contract, and return '
  'the acceptance timestamp. Gedu-only, guard-first on assert_role. There is no '
  'target parameter: the row is keyed to auth.uid(), so a caller cannot accept '
  'on anyone else''s behalf, and accepted_at and signed_name are both stamped '
  'server-side — the name as a snapshot taken from profiles at this moment, '
  'because a profile name is editable and the legal record must not drift. '
  'p_version is checked against gedu_contract_versions and refused with '
  'foreign_key_violation if unknown. Idempotent: accepting the same version '
  'twice returns the first acceptance''s stamp and writes nothing, including '
  'when the duplicate arrives concurrently. Accepting gates nothing — admin '
  'certification remains the only blocking lever over an educator.';

-- A created function comes back PUBLIC-executable, so the REVOKE is load-bearing
-- rather than boilerplate. `authenticated` only: the gedu calls it with their own
-- session and the guard is what makes that safe. No `service_role` grant —
-- nothing server-side accepts a contract on a gedu's behalf, and a function whose
-- entire meaning is "the caller signed this" has no sensible service-role caller.
REVOKE EXECUTE ON FUNCTION public.accept_gedu_contract(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_gedu_contract(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The certification queue reports contract standing
-- ---------------------------------------------------------------------------
--
-- The body below is the current definition of get_admin_dashboard with ONE
-- change: each candidate in section 2 additionally carries
-- `contract_accepted_at`, the stamp of that gedu's acceptance of the CURRENT
-- version (the whitelist row with the greatest created_at), or NULL if they have
-- not accepted it. Everything else is verbatim.
--
-- The current-version pick is an uncorrelated scalar subquery, so the planner
-- evaluates it once for the whole statement rather than once per candidate; the
-- acceptance lookup around it is a primary-key probe. `version DESC` is a
-- tiebreaker and nothing more — two versions published in the same transaction
-- would otherwise pick arbitrarily, and an arbitrary answer to "what is current"
-- is worse than a wrong one because it changes between reads.
--
-- The stamp is NULL for a gedu who has accepted an OLDER version and not the
-- current one, which is the same thing the product's own re-prompt says: what
-- matters to the reader is standing against the terms in force today.

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
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         pr.id,
               'first_name', pr.first_name,
               'last_name',  pr.last_name,
               'created_at', pr.created_at,
               'contract_accepted_at', (
                 SELECT ca.accepted_at
                   FROM public.gedu_contract_acceptances ca
                  WHERE ca.gedu_id = pr.id
                    AND ca.contract_version = (
                          SELECT v.version
                            FROM public.gedu_contract_versions v
                           ORDER BY v.created_at DESC, v.version DESC
                           LIMIT 1
                        )
               )
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

-- CREATE OR REPLACE keeps the function's ACL, but the repo restates grants on
-- every recreation so a future DROP/CREATE cycle cannot silently drop them —
-- and the REVOKE is what closes the PUBLIC-executable window if one ever does.
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO service_role;

COMMENT ON FUNCTION public.get_admin_dashboard() IS
  'The whole admin dashboard in one document: per-role user counts (email-verified and, for gedus, certified — both NULL where the stat has no meaning for the role), the uncertified-gedu queue, live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Since 00201 each queue candidate also carries contract_accepted_at — when they accepted the CURRENT gedu contract version, or NULL — which informs the certification decision without gating it. Both product sections ask effective_status() rather than products.status, and every date window is computed in the product''s own timezone. Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';

-- ---------------------------------------------------------------------------
-- 5. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Everything below runs against the database this file was just applied to, so a
-- silent no-op (an already-claimed version number, a grant that did not take)
-- fails here rather than three weeks later. Apply-time protection: it says what
-- was true when 00201 ran, and nothing about later migrations.

DO $assert$
DECLARE
  v_table text;
  v_src   text;
BEGIN
  -- --- (a) Both tables exist with RLS on. ----------------------------------
  FOREACH v_table IN ARRAY ARRAY['gedu_contract_versions', 'gedu_contract_acceptances'] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = v_table
         AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION '% is missing or has RLS disabled', v_table;
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated cannot SELECT % — the gedu and admin surfaces both read it', v_table;
    END IF;

    -- The whole write posture in two assertions: no Data API role may write
    -- either table, because a row here is an audit record and the RPC is the
    -- only writer.
    IF has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
    THEN
      RAISE EXCEPTION 'authenticated holds a write grant on % — every write must go through accept_gedu_contract', v_table;
    END IF;

    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'anon can read % — the contract means nothing to somebody with no account', v_table;
    END IF;

    IF NOT has_table_privilege('service_role', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'service_role cannot read % — the DB suite asserts against it through the admin client', v_table;
    END IF;
  END LOOP;

  -- --- (b) The seeded version, and the fact that it is the current one. ----
  IF NOT EXISTS (
    SELECT 1 FROM public.gedu_contract_versions WHERE version = '2026-2027'
  ) THEN
    RAISE EXCEPTION 'the 2026-2027 contract version was not seeded';
  END IF;

  IF (
    SELECT v.version
      FROM public.gedu_contract_versions v
     ORDER BY v.created_at DESC, v.version DESC
     LIMIT 1
  ) <> '2026-2027' THEN
    RAISE EXCEPTION 'the current contract version is not 2026-2027 — the greatest created_at picked something else';
  END IF;

  -- --- (c) The acceptances table's shape. ----------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.gedu_contract_acceptances'::regclass
       AND contype = 'f'
       AND confrelid = 'public.gedu_profiles'::regclass
       AND confdeltype = 'c'  -- CASCADE
  ) THEN
    RAISE EXCEPTION 'gedu_contract_acceptances has no ON DELETE CASCADE foreign key to gedu_profiles';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.gedu_contract_acceptances'::regclass
       AND contype = 'f'
       AND confrelid = 'public.gedu_contract_versions'::regclass
  ) THEN
    RAISE EXCEPTION 'gedu_contract_acceptances does not reference the version whitelist';
  END IF;

  -- The primary key is what makes acceptance idempotent and version-keyed; a
  -- table without it would silently accumulate a row per click.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.gedu_contract_acceptances'::regclass
       AND c.contype = 'p'
       AND (
         SELECT array_agg(a.attname::text ORDER BY a.attname::text)
           FROM pg_attribute a
          WHERE a.attrelid = c.conrelid
            AND a.attnum = ANY (c.conkey)
       ) = ARRAY['contract_version', 'gedu_id']
  ) THEN
    RAISE EXCEPTION 'gedu_contract_acceptances is not keyed on (gedu_id, contract_version)';
  END IF;

  -- Exactly two policies, both SELECT: a third arriving unnoticed is how a
  -- self-scoped table quietly becomes readable by somebody else.
  IF (
    SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'gedu_contract_acceptances'
  ) <> 2 THEN
    RAISE EXCEPTION 'gedu_contract_acceptances should carry exactly two policies';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'gedu_contract_acceptances'
       AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'gedu_contract_acceptances carries a non-SELECT policy — writes go through the RPC alone';
  END IF;

  -- --- (d) The RPC: exists, guards first, and is exposed to one role. ------
  IF to_regprocedure('public.accept_gedu_contract(text)') IS NULL THEN
    RAISE EXCEPTION 'accept_gedu_contract was not created';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'accept_gedu_contract';

  IF position('PERFORM public.assert_role(''gedu'')' IN v_src) = 0 THEN
    RAISE EXCEPTION 'accept_gedu_contract does not guard on assert_role(''gedu'')';
  END IF;

  -- No target parameter is the IDOR argument, so pin the signature: one text
  -- argument and nothing else.
  IF (
    SELECT p.pronargs FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'accept_gedu_contract'
  ) <> 1 THEN
    RAISE EXCEPTION 'accept_gedu_contract grew an argument — a second one could name a target';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.accept_gedu_contract(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE accept_gedu_contract — the gedu calls it with their own session';
  END IF;

  IF has_function_privilege('anon', 'public.accept_gedu_contract(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE accept_gedu_contract — the REVOKE FROM PUBLIC did not take';
  END IF;

  -- --- (e) The dashboard took the new field and kept its guard. ------------
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_admin_dashboard';

  IF position('contract_accepted_at' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard did not take the contract_accepted_at field';
  END IF;

  IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard lost its assert_admin guard';
  END IF;

  -- The other three sections have to have survived the replacement: this file
  -- retyped the whole body, and a lost section would read as an empty panel
  -- rather than as an error.
  IF position('certification_queue' IN v_src) = 0
     OR position('attention_products' IN v_src) = 0
     OR position('schedule_products' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard lost one of its four sections';
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
