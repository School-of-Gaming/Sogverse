-- 00151: the family product feed, and the retirement of two reserved columns.
--
-- Families can read nothing a gedu writes. Reports have been owed work on the
-- gedu side since 00149, and `group_sessions` has been accumulating them, but
-- no parent and no gamer has a path to a single one. This migration is that
-- path: ONE function, `get_my_family_product_feed(p_participation_id)`, that
-- answers everything a family club/camp/event page renders, for ONE
-- (gamer x product) enrollment, in one round trip.
--
-- WHY THE PARTICIPATION IS THE KEY. Family pages are gamer-scoped, not
-- product-scoped: two siblings in one club get two pages. A participation row
-- is exactly the (gamer, product) pair, it is unique, and it is what the
-- dashboard card already holds — so it is the identifier the URL carries and
-- the only argument this function needs. Passing a group id instead would make
-- "which of my children is this page about" unanswerable.
--
-- SELF-SCOPING, NOT ROLE-GATED. There is deliberately no `assert_role` here,
-- and its absence is the design rather than an omission. Two roles reach the
-- same document — the gamer whose participation it is, and any parent linked to
-- that gamer — so a role guard would either have to name both (proving nothing;
-- every customer and every gamer would pass it) or be split into two near
-- identical functions. The real gate is the ownership predicate below, which is
-- keyed entirely to auth.uid() and can answer about nobody else. This is the
-- authorization spine's "self-scoping" classification, and it comes with the
-- obligation that a scope test names the function: tests/db/family-product-feed
-- .test.ts is that test.
--
-- THE PRIVACY LINE IS THE POINT OF THIS FUNCTION, and it is enforced here in
-- SQL rather than downstream in a component, because a component that forgets
-- is a leak while a column that was never selected cannot be. What this
-- document must NEVER carry, each one a deliberate omission from the SELECTs
-- below:
--
--   * `gedu_note` of ANY scope — the session's, the group's, or the site's.
--     These are written under an assumption of privacy and can never be
--     retro-published. This is why the function does not simply reuse the gedu
--     feed's shape with fields removed: it builds its own, so a column added to
--     the gedu document later cannot arrive here by accident.
--   * The ROSTER. No other child's name, no other child's id, no other child's
--     attendance. The sessions below carry exactly ONE attendance answer each:
--     the named gamer's own.
--   * Parent emails. The gedu feed carries them for the group's contact list;
--     a family has no business holding another family's address, and no
--     business being handed its own back through a session feed.
--   * `material_url` — gedu/admin-only lesson content, which is why 00142 moved
--     it off `products` onto `product_staff_details` in the first place. This
--     function does not join that table at all.
--   * Completeness / owed / attention state. That is staff workload vocabulary.
--     A family sees what was written, never whether the platform considers the
--     writing finished.
--
-- FULL HISTORY, NO WINDOWING, DELIBERATELY. Every stored session for the group
-- comes back in one JSONB document, including sessions from before the child
-- enrolled: group membership grants what any member of the group sees, and
-- back-reading is context rather than leakage. Two reasons there is no paging
-- here and none should be added:
--
--   1. The client PROJECTS past occurrences from the schedule and merges stored
--      rows onto them. A partial fetch does not render "fewer sessions" — it
--      renders older sessions that DO have reports as though they had none.
--      Wrong, not merely short.
--   2. One JSONB document is one PostgREST row, so it is immune to the
--      `max_rows = 1000` ceiling that silently truncates table selects. A
--      weekly club running five years is a few hundred small rows.
--
-- The same argument the gedu feed makes in its own comments, and for the same
-- reason: this is where it has to be written down, because "just add a limit"
-- is the obvious-looking change that breaks it.

-- ---------------------------------------------------------------------------
-- 1. Retire did_not_run / needs_substitute
-- ---------------------------------------------------------------------------
--
-- Both were added by 00138 as reserved space for a cancellation / substitution
-- flow, on the reasoning that "reserving two booleans costs nothing and adding
-- columns to a populated table later costs a migration each". That flow was cut
-- from the gedu UI and is not being built now, so the reservation has outlived
-- its bet: nothing writes them, nothing reads them for a decision, and every
-- read path that carries them is now advertising a feature that does not exist.
--
-- Verified before dropping: the only reader anywhere is get_gedu_group_feed,
-- which copies both into its JSONB purely so "the shape is honest about what
-- the table holds". With the columns gone that honesty is served by their
-- absence, so the function is re-issued below without them. No UI, no write
-- path, no policy and no other function touches either column.
--
-- Re-issued FIRST so the function is never, even inside this transaction,
-- describing columns that have gone. Same signature, so CREATE OR REPLACE
-- keeps 00138's grants and the authorization-spine classification.

CREATE OR REPLACE FUNCTION public.get_gedu_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
  v_product    jsonb;
  v_group      jsonb;
  v_site       jsonb;
  v_roster     jsonb;
  v_sessions   jsonb;
BEGIN
  PERFORM public.assert_role('gedu');

  -- v1 shows a gedu only their OWN group's feed. Peer-group feeds are not a
  -- schema restriction — relaxing this to "any group on a product the caller is
  -- assigned to" is a change to this predicate alone, and nothing downstream
  -- assumes the caller teaches the group they are reading.
  IF NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id INTO v_product_id
    FROM public.product_groups g WHERE g.id = p_group_id;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- Gedu-only, and stored somewhere only this function and an admin can
    -- reach. This document is never served to a parent or a gamer.
    'material_url', psd.material_url,
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
  LEFT JOIN public.product_staff_details psd ON psd.product_id = p.id
  WHERE p.id = v_product_id;

  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note,
    'gedu_note',   g.gedu_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue, on in-person products only. A remote municipality club carries a
  -- location_id too (a municipality, by CHECK), so "has a location" is the
  -- wrong test and would put a site-notes panel on a club that has no building.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes,
    'gedu_note',   ssd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd       ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- The current roster. There is deliberately no joined-by-date machinery and
  -- no enrollment-at-the-time derivation: "who was enrolled then" is knowledge
  -- we do not have and choose not to fake. `signed_up_at` travels with each row
  -- so the client can tell a child who joined last week from one who has been
  -- here all term.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'gamer_id',           part.gamer_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so this is non-null in practice and the wire contract says so.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.gamer_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        )
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.gamer_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.gamer_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.gamer_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
  --
  -- Two reserved booleans were emitted here until 00151, purely so the document
  -- mirrored the table. 00151 dropped the columns; nothing replaces them. Their
  -- names are deliberately not repeated in this body — the end-state assertion
  -- at the foot of that migration greps this source for them.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',               s.id,
        'session_date',     s.session_date,
        'starts_at',        s.starts_at,
        'ends_at',          s.ends_at,
        'report',           s.report,
        'gedu_note',        s.gedu_note,
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- Sparse map keyed by gamer id. A roster member absent from this object
        -- is UNMARKED, which is a different claim from 'absent'.
        'attendance', COALESCE((
          SELECT jsonb_object_agg(a.gamer_id, a.status)
            FROM public.session_attendance a
           WHERE a.session_id = s.id
        ), '{}'::jsonb)
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
    ) AS session_rows;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions
  );
END;
$$;

ALTER TABLE public.group_sessions
  DROP COLUMN did_not_run,
  DROP COLUMN needs_substitute;

-- ---------------------------------------------------------------------------
-- 2. get_my_family_product_feed
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.get_my_family_product_feed(p_participation_id uuid)
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
  SELECT part.gamer_id, part.group_id, part.product_id
    INTO v_gamer_id, v_group_id, v_product_id
    FROM public.participations part
   WHERE part.id = p_participation_id;

  -- A participation that does not exist and one belonging to another family
  -- answer IDENTICALLY, on purpose. Distinguishing them would turn this
  -- function into an oracle for "is this a real enrollment id", which is a
  -- question no caller has a right to ask about a row that is not theirs.
  IF v_gamer_id IS NULL
     OR NOT (v_gamer_id = v_uid OR public.is_parent_of(v_gamer_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- An unplaced enrollment (purchased, awaiting a group) has no feed and no
  -- page: the sessions, the gedus and the group note all hang off the group.
  -- A DIFFERENT error from the refusal above, and deliberately so — the caller
  -- owns this row, so there is nothing to conceal from them, and the client
  -- renders both as not-found anyway. The dashboard is what tells them they are
  -- awaiting placement; it renders that enrollment as a card with no link.
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
  -- projects. See the header for why there is no window here.
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

COMMENT ON FUNCTION public.get_my_family_product_feed(uuid) IS
  'One round trip for a family club/camp/event page, scoped to ONE participation: the product shell, the group name and its family-facing note, the venue on in-person products, the teaching gedus'' first names, the group''s full stored session history with reports, and the named gamer''s own attendance marks. Self-scoping — the caller must be the participation''s gamer or a parent linked to them; an unplaced participation has no page. Carries no gedu note of any scope, no roster, no other child''s marks, no parent email, no material link and no owed/completeness state.';

-- Nothing is exposed by default — a fresh function grants EXECUTE to PUBLIC,
-- which includes `authenticated` — so revoke first, then grant deliberately per
-- role. The browser calls this one directly, hence `authenticated`.
REVOKE ALL ON FUNCTION public.get_my_family_product_feed(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_family_product_feed(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_family_product_feed(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. End-state assertions
-- ---------------------------------------------------------------------------
--
-- This migration's two halves can each half-apply in ways nothing downstream
-- would notice immediately: a DROP COLUMN that silently matched nothing, or a
-- grant that landed on the wrong role. Asserting the end state here catches it
-- at the moment the migration runs, which is earlier and more specific than any
-- test.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
     WHERE attrelid = 'public.group_sessions'::regclass
       AND attname IN ('did_not_run', 'needs_substitute')
       AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'group_sessions still carries a retired reservation column';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc
     WHERE oid = 'public.get_gedu_group_feed(uuid)'::regprocedure
       AND (prosrc LIKE '%did_not_run%' OR prosrc LIKE '%needs_substitute%')
  ) THEN
    RAISE EXCEPTION 'get_gedu_group_feed still reads a dropped column';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.get_my_family_product_feed(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_my_family_product_feed is not executable by authenticated';
  END IF;

  -- The negative half of the grant claim: `anon` must NOT reach it. This
  -- function answers about a signed-in person's own children; an anonymous
  -- caller has no uid for it to be scoped to, and the whole self-scoping
  -- classification would be vacuous if anon could execute it.
  IF has_function_privilege(
    'anon',
    'public.get_my_family_product_feed(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_my_family_product_feed is reachable by anon';
  END IF;
END;
$$;
