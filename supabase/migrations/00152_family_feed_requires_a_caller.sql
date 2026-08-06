-- 00152: the family product feed refuses a caller it cannot identify.
--
-- 00151 shipped `get_my_family_product_feed` with an ownership predicate that
-- FAILS OPEN when there is no authenticated caller. The shape was:
--
--   IF v_gamer_id IS NULL
--      OR NOT (v_gamer_id = v_uid OR public.is_parent_of(v_gamer_id))
--   THEN RAISE ... END IF;
--
-- With `v_uid` NULL, `v_gamer_id = v_uid` is NULL rather than false;
-- `is_parent_of` returns a real false (it is an EXISTS), so the disjunction is
-- `NULL OR false` = NULL, `NOT NULL` = NULL, and the whole condition is
-- `false OR NULL` = NULL. **PL/pgSQL treats a NULL IF as false**, so the guard
-- did not fire and the function returned the full family document for whatever
-- participation id it was handed.
--
-- This is the same bug `assert_role` documents in its own body — a NULL
-- comparison read as a passing check — and the house answer is the same one:
-- compare with `IS DISTINCT FROM`, and refuse a NULL principal outright before
-- comparing anything.
--
-- WHY IT WAS LATENT AND WHY IT IS STILL WORTH A MIGRATION. `anon` has no
-- EXECUTE, so no unauthenticated HTTP caller could reach it. But `service_role`
-- does, and a service-role JWT carries no `sub` — so `auth.uid()` is NULL for
-- every admin-client call. Any future server-side route that passed a
-- URL-supplied participation id through the admin client would have been a
-- complete cross-family IDOR: any parent's child's name, group, venue, gedus
-- and full report history, for an id belonging to anyone. Nothing does that
-- today. The window between "nothing does that" and "someone does that" is a
-- code review nobody knows they need to do, which is why this is fixed at the
-- function rather than written down as a caveat.
--
-- The grant to `service_role` is deliberately KEPT. Revoking it would fix this
-- one path by making the function unreachable from the server, but the house
-- rule is that every object is granted per role explicitly, and a function that
-- refuses a uid-less caller is correct for every caller rather than for the two
-- we happened to think of. The refusal is now the guarantee; the grant is not
-- load-bearing for it.
--
-- Re-issued with CREATE OR REPLACE and an unchanged signature, so 00151's
-- REVOKE/GRANT posture, its COMMENT, and its authorization-spine classification
-- all survive untouched. Everything below the guard is 00151's body verbatim.

CREATE OR REPLACE FUNCTION public.get_my_family_product_feed(p_participation_id uuid)
RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_gamer_id   uuid;
  v_group_id   uuid;
  v_product_id uuid;
  v_gamer      jsonb;
  v_product    jsonb;
  v_group      jsonb;
  v_site       jsonb;
  v_gedus      jsonb;
  v_sessions   jsonb;
BEGIN
  -- No caller, no answer. This function is scoped entirely to auth.uid(); with
  -- no uid there is nobody for it to be scoped TO, so there is no correct
  -- document to return and the only safe reply is a refusal. Checked FIRST and
  -- on its own, rather than folded into the predicate below, because the whole
  -- failure this migration exists to fix was a NULL uid disappearing into a
  -- larger boolean expression.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT part.gamer_id, part.group_id, part.product_id
    INTO v_gamer_id, v_group_id, v_product_id
    FROM public.participations part
   WHERE part.id = p_participation_id;

  -- A participation that does not exist and one belonging to another family
  -- answer IDENTICALLY, on purpose. Distinguishing them would turn this
  -- function into an oracle for "is this a real enrollment id", which is a
  -- question no caller has a right to ask about a row that is not theirs.
  --
  -- `IS NOT DISTINCT FROM`, not `=`: the equality form is only safe here
  -- because of the guard above, and a predicate whose correctness depends on a
  -- check twenty lines away is one edit away from being wrong again. This form
  -- is false — never NULL — for every input, so the IF cannot be skipped.
  IF v_gamer_id IS NULL
     OR NOT (v_gamer_id IS NOT DISTINCT FROM v_uid
             OR public.is_parent_of(v_gamer_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- An unplaced enrollment (purchased, awaiting a group) has no feed and no
  -- page: the sessions, the gedus and the group note all hang off the group.
  -- A DIFFERENT error from the refusal above, and deliberately so — the caller
  -- owns this row, so there is nothing to conceal from them, and the client
  -- renders both as not-found anyway. `no_data_found` is P0002, which PostgREST
  -- maps to a 404; the refusals above are 42501, which it maps to a 403.
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Participation % is not placed in a group', p_participation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The child this page is about. The page is gamer-scoped and reachable by
  -- URL, so it cannot get the name from a dashboard card it was not opened
  -- from. This is the caller's own child (or the caller themselves) — the
  -- ownership check above is what makes that true.
  SELECT jsonb_build_object(
    'id',         pr.id,
    'first_name', pr.first_name
  )
  INTO v_gamer
  FROM public.profiles pr WHERE pr.id = v_gamer_id;

  -- The product shell. Names live in product_translations, not on `products`,
  -- so the translations array IS the name. `material_url` lives on
  -- product_staff_details and this query does not join it.
  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  WHERE p.id = v_product_id;

  -- The group's family-facing half. `gedu_note` is not selected, and its
  -- absence here is the enforcement — not a filter somewhere downstream. The id
  -- travels because the voice-room href and the feed's entry keys are built
  -- from it.
  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = v_group_id;

  -- The venue, in-person products only — same test as the gedu feed, and for
  -- the same reason: a remote municipality club carries a location_id (a
  -- municipality, by CHECK), so "has a location" would put an address on a club
  -- with no building. site_staff_details is not joined at all.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd ON sd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- Who teaches this group, by first name. Nothing else about them: not the
  -- surname, not the email, not the verification state. A family is being told
  -- who their child is with, which is a first name's worth of information.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = v_group_id
    ) AS gedu_rows;

  -- The group's whole stored history, newest first — including sessions that
  -- predate this child's enrolment, and including rows the schedule no longer
  -- projects. See 00151's header for why there is no window here.
  --
  -- `report` and nothing else of the two note fields. `attendance` is ONE
  -- answer — this gamer's — rather than the gedu feed's map over the roster,
  -- which is what makes another child's mark structurally unreachable rather
  -- than merely unrendered. NULL means unmarked, which is a third state and not
  -- the same claim as 'absent'.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',           s.id,
        'session_date', s.session_date,
        'starts_at',    s.starts_at,
        'ends_at',      s.ends_at,
        'report',       s.report,
        'attendance', (
          SELECT a.status
            FROM public.session_attendance a
           WHERE a.session_id = s.id
             AND a.gamer_id   = v_gamer_id
        )
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = v_group_id
    ) AS session_rows;

  RETURN jsonb_build_object(
    'gamer',    v_gamer,
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'gedus',    v_gedus,
    'sessions', v_sessions
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- End-state assertions
-- ---------------------------------------------------------------------------
--
-- These check the SOURCE and the GRANTS, not the behaviour, and that split is
-- deliberate. The fail-open only manifests for a participation that EXISTS —
-- with a nonexistent id the `v_gamer_id IS NULL` arm raises either way — and
-- migrations run against a schema with no seeded rows, so a behavioural probe
-- here could not distinguish the fixed function from the broken one. It would
-- pass on the bug, which is worse than not checking.
--
-- The behavioural half is pinned where real rows exist: the service-role client
-- in tests/db/family-product-feed.test.ts calls this with a real participation
-- id and a `sub`-less JWT, which is exactly the vector, and expects a refusal.
DO $$
BEGIN
  IF (SELECT prosrc FROM pg_catalog.pg_proc
       WHERE oid = 'public.get_my_family_product_feed(uuid)'::regprocedure)
     NOT LIKE '%v_uid IS NULL%'
  THEN
    RAISE EXCEPTION 'get_my_family_product_feed does not refuse a NULL caller';
  END IF;

  IF (SELECT prosrc FROM pg_catalog.pg_proc
       WHERE oid = 'public.get_my_family_product_feed(uuid)'::regprocedure)
     LIKE '%v_gamer_id = v_uid%'
  THEN
    RAISE EXCEPTION 'get_my_family_product_feed still compares the caller with =';
  END IF;

  -- CREATE OR REPLACE keeps grants, but "keeps" is the claim being made and an
  -- unasserted claim is how the posture drifts.
  IF NOT has_function_privilege(
    'authenticated', 'public.get_my_family_product_feed(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_my_family_product_feed is not executable by authenticated';
  END IF;

  IF has_function_privilege(
    'anon', 'public.get_my_family_product_feed(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_my_family_product_feed is reachable by anon';
  END IF;
END;
$$;
