-- A contract version carries the language its text is written in.
--
-- WHY
--
-- The 2026-2027 gedu contract (Pelikasvattajan sopimusehdot) now exists in two
-- languages, Finnish and English, and they are EQUALLY BINDING: not a source and
-- a courtesy translation, but one agreement published twice. A gedu signs the
-- text they can read, and which text that was is part of the legal record — the
-- lawyer's three questions (which version, when, by whom) gain a fourth clause
-- inside the first one.
--
-- 00201 gave the whitelist a single label per version (`2026-2027`), which has
-- nowhere to put that. The three shapes available were a second column on the
-- whitelist, a second table, or encoding the language INTO the version string;
-- this migration takes the third:
--
--   <base>/<language>   e.g.  2026-2027/fi   2026-2027/en
--
-- What that buys is that nothing downstream of the version has to learn a new
-- shape. `gedu_contract_acceptances.contract_version` stays one text column and
-- one foreign key; the acceptance row stays the whole of what was signed, in one
-- value, shown verbatim wherever the record is displayed. A second column would
-- have made every acceptance read a pair and every UI join two fields to say one
-- thing, and a second table would have made "which document did they sign" a
-- join rather than a fact.
--
-- What it costs is that the version is no longer an opaque token: "is this gedu
-- current" becomes a question about the BASE, because both languages ARE the
-- current version. That is one `split_part` in one query, and it is written out
-- below and in the column comments so nobody has to rediscover it.
--
-- WHY THE FINNISH TEXT INHERITS THE EXISTING ROW
--
-- `2026-2027` as it stood was the Finnish document — the only one that existed —
-- so the existing acceptances are acceptances of the Finnish text and are
-- rewritten to say so rather than being dropped or left dangling. The rewrite is
-- an honest restatement of the same fact, not a reinterpretation: nobody who
-- signed that row signed anything else.
--
-- Production holds ZERO acceptance rows at the time of writing, so this is a
-- no-op there and rewrites two test signatures on staging. It is still written
-- as a real data migration, because a migration that only works on an empty
-- table is a migration that lies about what it did.
--
-- WHY BOTH LANGUAGES SHARE ONE created_at
--
-- `created_at` is the ordering key that decides which version is current, and
-- the two texts were published together. Giving them the same instant — the
-- instant the base version was added, carried across rather than re-stamped — is
-- what makes "the greatest created_at" pick a VERSION rather than a language,
-- and it keeps the pair from drifting apart every time a new version ships.

-- ---------------------------------------------------------------------------
-- 1. The whitelist gains a language, and the bare label goes away
-- ---------------------------------------------------------------------------

-- Both language rows in one statement, off the row they replace, so their
-- created_at is provably the same instant rather than two clock reads that
-- happen to land close together. If the base row were absent this inserts
-- nothing and the end-state assertions below fail loudly.
INSERT INTO public.gedu_contract_versions (version, created_at)
SELECT v.version || '/' || lang, v.created_at
  FROM public.gedu_contract_versions v
  CROSS JOIN unnest(ARRAY['fi', 'en']) AS l(lang)
 WHERE v.version = '2026-2027';

-- Order matters around the foreign key: the acceptances have to be repointed at
-- a row that already exists before the row they currently point at can go.
UPDATE public.gedu_contract_acceptances
   SET contract_version = '2026-2027/fi'
 WHERE contract_version = '2026-2027';

-- The bare label is not a version any more — it is a base, and a base is a
-- substring of a version rather than a row. Leaving it would make it selectable
-- and acceptable, and an acceptance of it would name no document.
DELETE FROM public.gedu_contract_versions WHERE version = '2026-2027';

-- ---------------------------------------------------------------------------
-- 2. The comments that describe the format
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.gedu_contract_versions IS
  'Every version of the gedu contract (Pelikasvattajan sopimusehdot) the '
  'platform knows about, one row per version PER LANGUAGE — the languages of one '
  'version are the same agreement published twice and equally binding, so they '
  'share a base label and a created_at and differ only in the suffix. Rows '
  'arrive by MIGRATION only — there is no write grant for any Data API role — '
  'because a version is a document that was drafted and published, not a value '
  'an app invents. The CURRENT version is the BASE of the row with the greatest '
  'created_at, and that derivation is what makes acceptance version-keyed: a '
  'gedu whose accepted base is not the current one is re-prompted, and one who '
  'signed either language of the current version is not. Readable by every '
  'signed-in role, because a gedu needs to know what they are signing and an '
  'admin needs to know what "current" means.';

COMMENT ON COLUMN public.gedu_contract_versions.version IS
  'The version label, encoded as <base>/<language>: the label the document '
  'itself carries, a slash, and the code of the language that text is written in '
  '— e.g. 2026-2027/fi, 2026-2027/en. The primary key, and the value '
  'gedu_contract_acceptances stores verbatim, because which of the two equally '
  'binding texts a gedu read is part of what they signed. Anything asking '
  'whether a gedu is CURRENT compares the base alone (split_part(version, ''/'', '
  '1)); anything displaying what they signed shows the whole string.';

COMMENT ON COLUMN public.gedu_contract_versions.created_at IS
  'When this version was added to the platform. Ordering key and nothing else: '
  'the greatest created_at names the current version, whose BASE is what '
  '"current" means. Every language of one version carries the same created_at, '
  'set from the moment that version was published rather than re-read per row — '
  'so the ordering picks a version and never a language, and a tie between the '
  'two texts is not a tie anything has to break.';

COMMENT ON COLUMN public.gedu_contract_acceptances.contract_version IS
  'Which version was accepted, FK into the whitelist, stored and displayed as '
  'the full encoded <base>/<language> string — the language is half of what was '
  'signed and the record would be incomplete without it. Not free text: the '
  'version decides whether the gedu is re-prompted, so a value the platform does '
  'not know about would be unanswerable rather than merely wrong. Re-prompting '
  'compares the BASE, so a gedu who signed the Finnish text stands as current '
  'against the English one — both ARE the current version.';

COMMENT ON TABLE public.gedu_contract_acceptances IS
  'One row per (gedu, contract version) accepted: the whole of what the platform '
  'records about a gedu agreeing to the contract. The primary key is what makes '
  'acceptance idempotent — a gedu accepting the same version twice is the same '
  'fact, not a second one — and version-keyed, so a new version leaves the old '
  'row standing and re-prompts. Because the version string carries its language, '
  'a gedu who signed both texts of one version holds two rows: two signatures on '
  'one agreement, not a contradiction, and either alone makes them current. '
  'Carries no write grant for any Data API role: every field a forger would want '
  'is stamped server-side by accept_gedu_contract, which is the only way in, the '
  'same arrangement gedu_profiles and set_gedu_certified have. Acceptance gates '
  'NOTHING — admin certification is the only blocking lever over an educator; '
  'this table informs that decision and does not pre-empt it.';

-- The RPC's logic is unchanged and deliberately so: it validates p_version
-- against the whitelist, and the whitelist now holds the encoded strings. What
-- changes is what a caller is expected to send, which is what the comment is for.
COMMENT ON FUNCTION public.accept_gedu_contract(p_version text) IS
  'Record that the CALLER accepted one version of the gedu contract, and return '
  'the acceptance timestamp. Gedu-only, guard-first on assert_role. There is no '
  'target parameter: the row is keyed to auth.uid(), so a caller cannot accept '
  'on anyone else''s behalf, and accepted_at and signed_name are both stamped '
  'server-side — the name as a snapshot taken from profiles at this moment, '
  'because a profile name is editable and the legal record must not drift. '
  'p_version is the full encoded version string — <base>/<language>, e.g. '
  '2026-2027/fi — naming which of the equally binding texts was read, and it is '
  'checked against gedu_contract_versions and refused with '
  'foreign_key_violation if unknown. Idempotent per encoded version: accepting '
  'the same string twice returns the first acceptance''s stamp and writes '
  'nothing, including when the duplicate arrives concurrently. Signing the other '
  'language of the same version writes a second row, which is a second signature '
  'on one agreement and not a re-acceptance. Accepting gates nothing — admin '
  'certification remains the only blocking lever over an educator.';

-- ---------------------------------------------------------------------------
-- 3. The certification queue asks about the base version
-- ---------------------------------------------------------------------------
--
-- The body below is the current definition of get_admin_dashboard with ONE
-- change, inside section 2's `contract_accepted_at`. Everything else is verbatim.
--
-- Two things move together there:
--
--   * The comparison is between BASES on both sides — the candidate's accepted
--     version and the current whitelist row — because both languages of the
--     current version ARE the current version. A gedu who signed the Finnish
--     text must not read as unsigned the moment an English text is published
--     alongside it.
--   * The read becomes min(accepted_at) rather than a bare scalar. A gedu can
--     hold acceptances of BOTH languages of one base, which would make a scalar
--     subquery return two rows and ERROR — a whole admin page failing on a
--     signature that is more complete than usual. min() is also the right answer
--     rather than merely a safe one: the first signature is when this person
--     agreed to these terms, and countersigning the other text later does not
--     move that moment.
--
-- min() over no rows is NULL, so "has not accepted the current version" reads
-- exactly as it did before.
--
-- The current-version pick stays an uncorrelated scalar subquery, evaluated once
-- for the whole statement. `version DESC` remains a tiebreaker and nothing more;
-- it now breaks ties between the languages of one version, which the base
-- comparison makes immaterial — either row yields the same base.

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
  'The whole admin dashboard in one document: per-role user counts (email-verified and, for gedus, certified — both NULL where the stat has no meaning for the role), the uncertified-gedu queue, live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Since 00201 each queue candidate also carries contract_accepted_at — when they accepted the current gedu contract, or NULL — which informs the certification decision without gating it; since 00202 that standing is judged on the version''s BASE, so either equally binding language of the current version counts, and a candidate holding both carries the earlier of the two signatures. Both product sections ask effective_status() rather than products.status, and every date window is computed in the product''s own timezone. Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';

-- ---------------------------------------------------------------------------
-- 4. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Everything below runs against the database this file was just applied to, so a
-- silent no-op (an already-claimed version number, an UPDATE that matched
-- nothing) fails here rather than the next time somebody signs. Apply-time
-- protection: it says what was true when 00202 ran, and nothing about later
-- migrations.

DO $assert$
DECLARE
  v_src text;
BEGIN
  -- --- (a) The whitelist holds both languages and not the bare label. -------
  IF EXISTS (
    SELECT 1 FROM public.gedu_contract_versions WHERE version = '2026-2027'
  ) THEN
    RAISE EXCEPTION 'the bare 2026-2027 label survived — it is a base, not a version';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gedu_contract_versions WHERE version = '2026-2027/fi'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.gedu_contract_versions WHERE version = '2026-2027/en'
  ) THEN
    RAISE EXCEPTION 'both languages of 2026-2027 must exist in the whitelist';
  END IF;

  -- One published moment, two texts. A drift here would let the ordering key
  -- pick a language rather than a version.
  IF (
    SELECT count(DISTINCT created_at)
      FROM public.gedu_contract_versions
     WHERE split_part(version, '/', 1) = '2026-2027'
  ) <> 1 THEN
    RAISE EXCEPTION 'the two 2026-2027 texts do not share a created_at';
  END IF;

  -- --- (b) Current is still 2026-2027, read as a base. ---------------------
  IF (
    SELECT split_part(v.version, '/', 1)
      FROM public.gedu_contract_versions v
     ORDER BY v.created_at DESC, v.version DESC
     LIMIT 1
  ) <> '2026-2027' THEN
    RAISE EXCEPTION 'the current contract base is not 2026-2027 — the greatest created_at picked something else';
  END IF;

  -- --- (c) No acceptance is left naming a bare label. ----------------------
  --
  -- Written as a sweep rather than as a count of the rewritten rows, because
  -- production has none to rewrite and staging has two: the claim that holds in
  -- both places is that nothing is left unencoded.
  IF EXISTS (
    SELECT 1 FROM public.gedu_contract_acceptances
     WHERE position('/' IN contract_version) = 0
  ) THEN
    RAISE EXCEPTION 'an acceptance still names a version with no language';
  END IF;

  -- --- (d) The dashboard asks about the base, and kept everything else. ----
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_admin_dashboard';

  IF position('split_part(ca.contract_version' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard still compares whole version strings';
  END IF;

  IF position('min(ca.accepted_at)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard would error on a gedu holding both languages';
  END IF;

  IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard lost its assert_admin guard';
  END IF;

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
