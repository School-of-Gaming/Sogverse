-- 00172: the seat's occupant is a PARTICIPANT, not a gamer.
--
-- Purely mechanical. Nothing here changes what any function decides, what any
-- policy admits, or what any wire shape looks like — `participations.gamer_id`
-- and `session_attendance.gamer_id` become `participant_id`, and everything
-- that names them is rewritten to match. The reason to do it now, ahead of the
-- behaviour, is that the column is about to stop being a gamer: a parent will
-- be able to occupy a seat on a for-parents product, and a column called
-- `gamer_id` holding a parent's id is a lie every future reader has to unlearn.
--
-- WHY THE FUNCTION BODIES ARE ALL HERE. `ALTER TABLE ... RENAME COLUMN` rewrites
-- the things Postgres stores as parse trees — indexes, CHECK constraints, RLS
-- policies, FK definitions — and leaves the things it stores as TEXT alone.
-- Every plpgsql and sql function body is text. So a rename with no rewrites
-- leaves 19 functions that still compile, still have grants, still pass every
-- local check, and fail the next time somebody calls them. Neither lint,
-- type-check nor the jsdom suites can see it, and the DB tests only run in CI.
-- Hence: every body that reads either column is reproduced below, and the
-- migration asserts its own end state at the foot of the file.
--
-- WHY SEVEN OF THEM ARE DROPPED. Postgres cannot rename an input parameter, and
-- these seven carry `p_gamer_id`. DROP + CREATE is the only route, and a
-- recreated function inherits neither its ACL nor its COMMENT — so both are
-- re-issued beside each one. (Same shape as 00153's padlet retirement.)
--
-- WHAT DELIBERATELY DOES NOT CHANGE, so a future reader does not "finish the
-- job" and break a wire shape:
--
--   * The RPC result JSON keys literally spelled 'gamer_id' — the gedu feed,
--     the groups snapshot, the attendance and minecraft writers all emit them,
--     and roster contracts on the other side parse them. Those bodies now read
--     the renamed COLUMN and emit the OLD KEY, on purpose. They rename with the
--     roster work, alongside the function names that carry "gamer".
--   * `parent_gamer.gamer_id`. Different table, and its column is still
--     genuinely a gamer — a parent-child link never involves anyone else.
--   * The `payments.metadata` echo and the Stripe checkout metadata key, which
--     are handled in application code (an in-flight Checkout Session cannot be
--     renamed under us).
--   * `chk_participations_no_self_signup`, the CHECK that forbids the payer
--     occupying the seat. It is the actual blocker for parent seats and it is
--     dropped by the behavioural migration that follows this one, not here —
--     this file changes no rule.

-- ---------------------------------------------------------------------------
-- The columns, and every constraint and index whose NAME carried the old noun.
-- The definitions themselves (the partial unique index's predicate, the
-- no-self-signup CHECK, the gamer_select_own_participations policy) follow the
-- column automatically — they are parse trees, not text.
-- ---------------------------------------------------------------------------

ALTER TABLE public.participations RENAME COLUMN gamer_id TO participant_id;
ALTER TABLE public.session_attendance RENAME COLUMN gamer_id TO participant_id;

ALTER TABLE public.participations
  RENAME CONSTRAINT participations_gamer_id_fkey TO participations_participant_id_fkey;
ALTER TABLE public.session_attendance
  RENAME CONSTRAINT session_attendance_gamer_id_fkey TO session_attendance_participant_id_fkey;
ALTER TABLE public.session_attendance
  RENAME CONSTRAINT session_attendance_session_gamer_key TO session_attendance_session_participant_key;

ALTER INDEX public.idx_participations_gamer RENAME TO idx_participations_participant;
ALTER INDEX public.session_attendance_gamer_idx RENAME TO session_attendance_participant_idx;

COMMENT ON COLUMN public.participations.participant_id IS 'The profile occupying this seat. Today always a gamer; the column is named for what it means rather than for who currently fills it, because a parent seat on a for-parents product is the next step.';
COMMENT ON COLUMN public.session_attendance.participant_id IS 'The profile the mark is about — whoever holds the seat, matching participations.participant_id.';

-- ---------------------------------------------------------------------------
-- Bodies rewritten in place. Signatures are untouched, so CREATE OR REPLACE
-- keeps each function's ACL and COMMENT and there is nothing to re-issue.
-- ---------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION public.can_read_product(p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    -- admin sees everything (mirrors admin_full_access_* FOR ALL)
    (SELECT public.get_user_role()) = 'admin'::public.user_role
    -- public: published. `is_visible` is NOT tested here, and its absence is
    -- the point: that column governs LISTING only — the browse queries filter
    -- on it — while a direct link to an unlisted product is meant to lead to a
    -- page a parent can read and buy from. The consequence is that an unlisted
    -- product is readable, and therefore enumerable, through the Data API:
    -- obscurity rather than secrecy, accepted by owner decision (Aug 2026).
    -- What keeps a product unbuyable is its status, its seat cap and its
    -- registration window — never its visibility.
    OR EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = p_product_id
        AND pr.status IN ('pending'::public.product_status, 'running'::public.product_status)
    )
    -- enrolled gamer (child's own login) OR purchaser (parent), active/waitlisted
    OR EXISTS (
      SELECT 1 FROM public.participations p
      WHERE p.product_id = p_product_id
        AND (p.participant_id = (SELECT auth.uid()) OR p.customer_id = (SELECT auth.uid()))
        AND p.status IN ('active'::public.participation_status, 'waitlisted'::public.participation_status)
    )
    -- assigned gedu
    OR EXISTS (
      SELECT 1 FROM public.gedu_group_assignments a
      WHERE a.product_id = p_product_id
        AND a.gedu_id = (SELECT auth.uid())
    ),
    false
  );
$$;


CREATE OR REPLACE FUNCTION public.get_gedu_assigned_product(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id   UUID := (SELECT auth.uid());
  v_my_group_id UUID;
  v_product     JSONB;
  v_groups      JSONB;
BEGIN
  PERFORM public.assert_role('gedu');

  SELECT group_id
    INTO v_my_group_id
    FROM gedu_group_assignments
   WHERE product_id = p_product_id
     AND gedu_id    = v_caller_id
   LIMIT 1;

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM products p
  WHERE p.id = p_product_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'is_my_group',   (pg.id = v_my_group_id),
        'gamer_count',   (
          SELECT COUNT(*)::INTEGER
            FROM participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'
        ),
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name
                   )
                   ORDER BY gp.first_name
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster',
          CASE WHEN pg.id = v_my_group_id THEN
            COALESCE((
              SELECT jsonb_agg(
                       jsonb_build_object(
                         'gamer_id',           part.participant_id,
                         'first_name',         gmp.first_name,
                         'date_of_birth',      gprof.date_of_birth,
                         'gender',             gprof.gender,
                         'minecraft_username', mca.minecraft_username,
                         'minecraft_uuid',     mca.minecraft_uuid,
                         'parent_email',       (
                           SELECT pp.email
                             FROM parent_gamer pgm
                             JOIN profiles pp ON pp.id = pgm.parent_id
                            WHERE pgm.gamer_id = part.participant_id
                            ORDER BY pgm.created_at ASC NULLS LAST,
                                     pgm.id           ASC
                            LIMIT 1
                         )
                       )
                       ORDER BY gmp.first_name
                     )
                FROM participations part
                JOIN profiles gmp              ON gmp.id        = part.participant_id
                LEFT JOIN gamer_profiles gprof  ON gprof.user_id = part.participant_id
                LEFT JOIN minecraft_accounts mca ON mca.user_id  = part.participant_id
               WHERE part.group_id = pg.id
                 AND part.status   = 'active'
            ), '[]'::jsonb)
          ELSE NULL
          END
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups
  );
END;
$$;


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
        'gamer_id',           part.participant_id,
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
           WHERE pgm.gamer_id = part.participant_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        )
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
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
          SELECT jsonb_object_agg(a.participant_id, a.status)
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


CREATE OR REPLACE FUNCTION public.get_my_family_product_feed(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid            uuid := (SELECT auth.uid());
  v_participant_id uuid;
  v_group_id       uuid;
  v_product_id     uuid;
  v_gamer          jsonb;
  v_product        jsonb;
  v_group          jsonb;
  v_site           jsonb;
  v_gedus          jsonb;
  v_sessions       jsonb;
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

  SELECT part.participant_id, part.group_id, part.product_id
    INTO v_participant_id, v_group_id, v_product_id
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
  IF v_participant_id IS NULL
     OR NOT (v_participant_id IS NOT DISTINCT FROM v_uid
             OR public.is_parent_of(v_participant_id))
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
  FROM public.profiles pr WHERE pr.id = v_participant_id;

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
             AND a.participant_id   = v_participant_id
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


CREATE OR REPLACE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'product_id',         a.product_id,
               'group_id',           a.group_id,
               'group_name',         g.name,
               'group_gamer_count',  roster.roster_size,
               'site_name',          site.name,
               'attention_count',    COALESCE(owed.owed_count, 0)
             )
             ORDER BY g.name
           )
      FROM public.gedu_group_assignments a
      JOIN public.product_groups g ON g.id = a.group_id
      JOIN public.products p       ON p.id = a.product_id

      -- The venue, in-person products only (see get_gedu_group_feed).
      LEFT JOIN LATERAL (
        SELECT l.name
          FROM public.locations l
         WHERE l.id = p.location_id AND p.is_remote = false
      ) AS site ON true

      CROSS JOIN LATERAL (
        SELECT COUNT(*)::integer AS roster_size
          FROM public.participations part
         WHERE part.group_id = g.id
           AND part.status   = 'active'::public.participation_status
      ) AS roster

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS owed_count
          FROM (
            -- Occurrences the schedule projects, floored at max(product start,
            -- epoch) and bounded above by "has actually finished".
            --
            -- The epoch floors THIS COUNT and nothing else. A pre-epoch session
            -- is fully recordable — a gedu may take its attendance and write it
            -- up — it simply never becomes work the platform asks for. That is
            -- why the write validator has no epoch floor of its own.
            SELECT d::date AS session_date
              FROM generate_series(
                     GREATEST(
                       COALESCE(p.start_date, (now() AT TIME ZONE p.timezone)::date - 365),
                       COALESCE(p_epoch_date, DATE '0001-01-01')
                     )::timestamp,
                     (now() AT TIME ZONE p.timezone)::date::timestamp,
                     interval '1 day'
                   ) AS d
             WHERE (p.end_date IS NULL OR d::date <= p.end_date)
               AND EXISTS (
                 SELECT 1
                   FROM public.schedule_slots s
                  WHERE s.product_id = p.id
                    AND s.weekday = (EXTRACT(ISODOW FROM d)::integer - 1)
                    AND ((d::date + s.start_time) AT TIME ZONE p.timezone)
                        + make_interval(mins => s.duration_minutes) <= now()
               )
            UNION
            -- Rows the schedule no longer projects still count: a session
            -- orphaned by a weekday move is history, and history that is
            -- missing marks is still owed.
            SELECT gs.session_date
              FROM public.group_sessions gs
             WHERE gs.group_id = g.id
               AND gs.ends_at <= now()
               AND gs.session_date >= COALESCE(p_epoch_date, DATE '0001-01-01')
               AND (p.start_date IS NULL OR gs.session_date >= p.start_date)
          ) AS occurrence
         WHERE roster.roster_size > 0
           -- "Needs attention" is two questions joined by OR, and either one
           -- alone keeps the session on the list.
           AND (
             -- (1) Some of the CURRENT roster has no answer yet. Measured
             -- against the current roster, never against the stored map's keys
             -- — which is why a child joining a long-running group reopens
             -- previously-complete sessions. That is the honest reading and it
             -- is chosen with eyes open.
             (
               SELECT COUNT(*)
                 FROM public.session_attendance att
                 JOIN public.group_sessions gs2 ON gs2.id = att.session_id
                 JOIN public.participations part2
                   ON part2.participant_id = att.participant_id
                  AND part2.group_id = g.id
                  AND part2.status   = 'active'::public.participation_status
                WHERE gs2.group_id     = g.id
                  AND gs2.session_date = occurrence.session_date
             ) < roster.roster_size
             -- (2) Nothing has been written for the families. NOT EXISTS rather
             -- than a LEFT JOIN's NULL test, so a date with no materialized row
             -- at all — the common case for a session nobody has touched — is
             -- the same answer as a row holding a blank report.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs3
                WHERE gs3.group_id     = g.id
                  AND gs3.session_date = occurrence.session_date
                  AND btrim(COALESCE(gs3.report, ''), E' \t\r\n\v\f') <> ''
             )
           )
      ) AS owed ON true

     WHERE a.gedu_id = v_uid
  ), '[]'::jsonb);
END;
$$;


CREATE OR REPLACE FUNCTION public.get_my_participation_subscription_states() RETURNS TABLE(participation_id uuid, status text, current_period_end timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT fs.participation_id, fs.status, fs.current_period_end
  FROM public.family_subscriptions fs
  JOIN public.participations p ON p.id = fs.participation_id
  WHERE fs.status IN ('past_due', 'canceling')
    AND (
      p.customer_id = (SELECT auth.uid())
      OR p.participant_id = (SELECT auth.uid())
    );
$$;


CREATE OR REPLACE FUNCTION public.get_my_waitlist_positions() RETURNS TABLE(participation_id uuid, waitlist_position integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT mine.id,
         -- Same derivation as join_waitlist and get_waitlist_position: count the
         -- waitlisted rows ordered at-or-before this one by (waitlisted_at, id).
         -- Recomputed live, so it shrinks as people ahead of them leave.
         -- waitlisted_at is never NULL on a waitlisted row
         -- (chk_participations_waitlisted_has_timestamp), so neither comparison
         -- can go three-valued and swallow a peer.
         (SELECT COUNT(*)::INTEGER
            FROM public.participations peer
           WHERE peer.product_id = mine.product_id
             AND peer.status = 'waitlisted'::public.participation_status
             AND (peer.waitlisted_at < mine.waitlisted_at
                  OR (peer.waitlisted_at = mine.waitlisted_at
                      AND peer.id <= mine.id)))
    FROM public.participations mine
   WHERE mine.status = 'waitlisted'::public.participation_status
     AND (mine.customer_id = (SELECT auth.uid())
          OR mine.participant_id = (SELECT auth.uid()));
$$;


CREATE OR REPLACE FUNCTION public.get_product_groups_with_details(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
  v_waitlist   JSONB;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'created_at', g->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email
                   )
                   ORDER BY ga.created_at, gp.id
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                       p.id,
                     'gamer_id',                 p.participant_id,
                     'gamer_first_name',         gmp.first_name,
                     'gamer_date_of_birth',      gprof.date_of_birth,
                     'gamer_gender',             gprof.gender,
                     'gamer_minecraft_username', mca.minecraft_username,
                     'gamer_minecraft_uuid',     mca.minecraft_uuid,
                     'gamer_parent_first_name',  parent.first_name,
                     'gamer_parent_last_name',   parent.last_name,
                     'status',                   p.status,
                     'signed_up_at',             p.signed_up_at,
                     -- The demote/remove dialogs' condition, resolved
                     -- server-side so the panel needs no round trip per chip.
                     -- The join below excludes dead subscriptions, so this is
                     -- "live", not "ever existed".
                     'has_live_subscription',    (fs.id IS NOT NULL),
                     -- The promote dialog's condition (00167): money once
                     -- arrived for this seat.
                     'has_payment_marker',       (p.stripe_checkout_session_id IS NOT NULL)
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.participant_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
            -- participation_id is UNIQUE here, so this cannot fan the row out.
            -- The status predicate lives in the JOIN rather than a WHERE so a
            -- dead subscription simply fails to match and leaves fs.id NULL,
            -- instead of dropping the participation from the snapshot.
            LEFT JOIN family_subscriptions fs
                   ON fs.participation_id = p.id
                  AND fs.status <> 'cancelled'
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.participant_id
               ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
               LIMIT 1
            ) parent ON true
           WHERE p.group_id = pg.id
             AND p.status = 'active'
        ), '[]'::jsonb)
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                       p.id,
             'gamer_id',                 p.participant_id,
             'gamer_first_name',         gmp.first_name,
             'gamer_date_of_birth',      gprof.date_of_birth,
             'gamer_gender',             gprof.gender,
             'gamer_minecraft_username', mca.minecraft_username,
             'gamer_minecraft_uuid',     mca.minecraft_uuid,
             'gamer_parent_first_name',  parent.first_name,
             'gamer_parent_last_name',   parent.last_name,
             'status',                   p.status,
             'signed_up_at',             p.signed_up_at,
             'has_live_subscription',    (fs.id IS NOT NULL),
             'has_payment_marker',       (p.stripe_checkout_session_id IS NOT NULL)
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.group_id IS NULL
     AND p.status = 'active';

  -- Waitlist: same detail shape as `unassigned`, but ordered by the derived
  -- waitlist key (waitlisted_at, id). Position is the array index + 1, computed
  -- client-side — never stored. waitlisted_at drives ORDER BY but is omitted
  -- from the object so the row shape stays identical to a group/unassigned chip.
  --
  -- has_live_subscription is a REAL READ here as of 00170. It used to be a
  -- constant FALSE, resting on "demote_to_waitlist refuses a subscribed row, so
  -- this cannot exist". It can: the webhook inserts family_subscriptions after a
  -- Stripe round trip without taking the product gate lock, so a demote landing
  -- in that window creates exactly this row — and the manual sub-adoption
  -- process writes one directly. A snapshot asserting FALSE about a seat that
  -- has money behind it is the panel being lied to, so the branch reads the
  -- same join as the other two.
  --
  -- has_payment_marker remains a real read and remains the branch where it
  -- decides something: demotion leaves the Checkout Session id in place, so a
  -- family that paid and was later demoted is distinguishable here from one
  -- that only ever queued.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                       p.id,
             'gamer_id',                 p.participant_id,
             'gamer_first_name',         gmp.first_name,
             'gamer_date_of_birth',      gprof.date_of_birth,
             'gamer_gender',             gprof.gender,
             'gamer_minecraft_username', mca.minecraft_username,
             'gamer_minecraft_uuid',     mca.minecraft_uuid,
             'gamer_parent_first_name',  parent.first_name,
             'gamer_parent_last_name',   parent.last_name,
             'status',                   p.status,
             'signed_up_at',             p.signed_up_at,
             'has_live_subscription',    (fs.id IS NOT NULL),
             'has_payment_marker',       (p.stripe_checkout_session_id IS NOT NULL)
           )
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.status = 'waitlisted';

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned,
    'waitlist',   v_waitlist
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_waitlist_position(p_participation_id uuid) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id     UUID;
  v_participant_id UUID;
  v_customer_id    UUID;
  v_status         public.participation_status;
  v_waitlisted_at  TIMESTAMPTZ;
  v_uid            UUID;
  v_position       INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT product_id, participant_id, customer_id, status, waitlisted_at
    INTO v_product_id, v_participant_id, v_customer_id, v_status, v_waitlisted_at
    FROM public.participations
    WHERE id = p_participation_id;

  -- Unknown row, not waitlisted, or caller doesn't own it -> no position.
  -- Owner = the purchasing parent (customer) or the gamer themselves. Returning
  -- NULL rather than raising avoids leaking whether the id exists.
  IF NOT FOUND
     OR v_status <> 'waitlisted'
     OR (v_uid <> v_customer_id AND v_uid <> v_participant_id) THEN
    RETURN NULL;
  END IF;

  -- Position = count of waitlisted rows ordered at-or-before this one
  -- (waitlisted_at, id) — the same derivation join_waitlist uses, recomputed
  -- live so it shrinks as people ahead leave.
  SELECT COUNT(*)::INTEGER INTO v_position
    FROM public.participations
    WHERE product_id = v_product_id
      AND status = 'waitlisted'
      AND (waitlisted_at < v_waitlisted_at
           OR (waitlisted_at = v_waitlisted_at AND id <= p_participation_id));

  RETURN v_position;
END;
$$;


CREATE OR REPLACE FUNCTION public.has_active_participation_in_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.participations p
     WHERE p.group_id = p_group_id
       AND (p.customer_id = (SELECT auth.uid()) OR p.participant_id = (SELECT auth.uid()))
       AND p.status = 'active'
  );
$$;


CREATE OR REPLACE FUNCTION public.has_active_participation_on_product(p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.participations p
     WHERE p.product_id = p_product_id
       AND (p.customer_id = (SELECT auth.uid()) OR p.participant_id = (SELECT auth.uid()))
       AND p.status = 'active'
  );
$$;


CREATE OR REPLACE FUNCTION public.is_voice_group_member(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.participations p
      where p.group_id = p_group_id
        and p.participant_id = (select auth.uid())
        and p.status = 'active'
    )
    or exists (
      select 1
      from public.product_groups g
      join public.gedu_group_assignments a on a.product_id = g.product_id
      where g.id = p_group_id
        and a.gedu_id = (select auth.uid())
    );
$$;


-- ---------------------------------------------------------------------------
-- Bodies whose PARAMETER is renamed. Postgres refuses that in place, so each is
-- dropped and recreated — and each recreation is followed by the grants and the
-- COMMENT it would otherwise silently lose.
--
-- Each one also re-issues `REVOKE EXECUTE ... FROM PUBLIC`, and that line is
-- load-bearing rather than boilerplate. `00099` set
-- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON
-- FUNCTIONS FROM PUBLIC`, which reads like it makes the REVOKE redundant. It
-- does not: a function created by `supabase db push` comes out carrying
-- `=X/postgres` anyway (verified on staging — the default-privilege entry does
-- not govern the session the CLI applies migrations in). Without the REVOKE,
-- `create_participation` and `confirm_paid_participation` — both service-role
-- only, both writers of paid seats — would be executable by `anon` through
-- PostgREST the moment they were recreated. Fail-closed comes from the explicit
-- statement, not from the default.
-- ---------------------------------------------------------------------------


DROP FUNCTION public.admin_enroll_gamer(uuid, uuid);

CREATE FUNCTION public.admin_enroll_gamer(p_product_id uuid, p_participant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type     public.product_type;
  v_billing_mode     public.billing_mode;
  v_customer_id      uuid;
  v_participation_id uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_type, billing_mode
    INTO v_product_type, v_billing_mode
    FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The one shape whose seat cannot exist without a Stripe subscription, which
  -- comp-enrollment has no way to create. Every other combination — free clubs
  -- included, since 00166 — is the free camp and free event this function has
  -- always written.
  IF v_product_type = 'consumer_club' AND v_billing_mode = 'paid' THEN
    RAISE EXCEPTION 'admin enrollment is not supported for subscription-billed consumer clubs'
      USING ERRCODE = 'check_violation';
  END IF;

  -- One parent per gamer is the current model; where a gamer somehow has
  -- several links, the oldest wins so the choice is deterministic rather than
  -- whatever the planner returned. Multi-parent reckoning is future work.
  SELECT parent_id INTO v_customer_id
    FROM public.parent_gamer
    WHERE gamer_id = p_participant_id
    ORDER BY created_at ASC
    LIMIT 1;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'gamer % has no linked parent', p_participant_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- The partial unique index on (product_id, participant_id) for non-reserving
  -- statuses is the source of truth for "already enrolled"; it raises 23505 and
  -- the route maps that to 409. Re-checking it here would be a race, not a
  -- safeguard.
  INSERT INTO public.participations (product_id, participant_id, customer_id, status)
  VALUES (p_product_id, p_participant_id, v_customer_id, 'active')
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'customer_id', v_customer_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_enroll_gamer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_enroll_gamer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enroll_gamer(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_enroll_gamer(uuid, uuid) IS 'Admin-gated comp-enrollment: drops a gamer onto a product with status=active, bypassing payment, seat caps and registration windows by design. Refuses only a paid consumer club — the one shape whose seat requires a Stripe subscription this function cannot create; free clubs enroll like any free camp or event.';


DROP FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text);

CREATE FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_conflict_id      UUID;
  v_conflict_session TEXT;
  v_conflict_status  public.participation_status;
  v_participation_id UUID;
BEGIN
  PERFORM 1 FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Pre-check the partial UNIQUE on (product_id, participant_id): under the gate lock
  -- this decides the outcome, and the index itself is left as the backstop.
  SELECT id, status, stripe_checkout_session_id
    INTO v_conflict_id, v_conflict_status, v_conflict_session
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status    IN ('active', 'waitlisted', 'completed')
    LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    IF v_conflict_session IS NOT NULL
       AND v_conflict_session = p_checkout_session_id THEN
      RETURN jsonb_build_object(
        'kind', 'confirmed',
        'participation_id', v_conflict_id,
        'idempotent', TRUE
      );
    END IF;

    RETURN jsonb_build_object(
      'kind', 'duplicate_payment',
      'existing_participation_id', v_conflict_id,
      'existing_status', v_conflict_status::text
    );
  END IF;

  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, stripe_checkout_session_id
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'active', p_checkout_session_id
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'kind', 'confirmed',
    'participation_id', v_participation_id,
    'idempotent', FALSE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text) IS 'Creates the active participation for a paid signup once Stripe confirms payment. service_role only — the arguments come from Checkout Session metadata we wrote. Returns kind=confirmed with participation_id (idempotent=true when this same session already bought the seat), or kind=duplicate_payment with existing_participation_id when a different payment already put this gamer on this product.';


DROP FUNCTION public.create_participation(uuid, uuid, uuid, text, text);

CREATE FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product               public.products;
  v_eff_status            public.effective_product_status;
  v_seats_taken           INTEGER;
  v_existing_id           UUID;
  v_existing_status       public.participation_status;
  v_participation_id      UUID;
  v_is_parent             BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_participant_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_participant_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_eff_status := public.effective_status(p_product_id);
  IF v_eff_status NOT IN ('pending', 'running') THEN
    RAISE EXCEPTION 'product is not accepting signups (effective status: %)', v_eff_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_product.registration_opens_at IS NOT NULL
     AND v_product.registration_opens_at > NOW() THEN
    RAISE EXCEPTION 'registration has not yet opened'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_currency NOT IN ('eur', 'gbp', 'usd') THEN
    RAISE EXCEPTION 'unsupported currency: %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_purchase_shape NOT IN (
    'subscription_monthly', 'single_payment', 'free', 'external'
  ) THEN
    RAISE EXCEPTION 'unsupported purchase shape: %', p_purchase_shape
      USING ERRCODE = 'check_violation';
  END IF;

  -- The already-enrolled gate. Its status list has to match the one
  -- `confirm_paid_participation` conflicts on, or a signup can pass here, take
  -- the parent's money, and then be refused at confirmation with nothing to
  -- show for it. 'completed' is the member that was missing: nothing writes
  -- that status today, so the gap was unreachable rather than harmless.
  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status IN ('active', 'waitlisted', 'completed')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a participation on this product (status: %)', p_participant_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Seat-count gate. Sits above the free / external branches so an explicit cap
  -- on a no-charge product (the schema permits it, incl. municipality clubs) is
  -- honored — earlier versions only checked the cap on paid signups, so a free
  -- product with seat_count=20 silently accepted the 21st signup.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_active_seats(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations (
      product_id, participant_id, customer_id, status
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active'
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'free_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Municipality clubs are invoiced off-platform: no Stripe, nothing to
  -- confirm later. Mirrors the free branch (instant active), gated on
  -- billing_mode so a paid product can never be registered without payment.
  IF p_purchase_shape = 'external' THEN
    IF v_product.billing_mode <> 'external_contract' THEN
      RAISE EXCEPTION 'product is not externally contracted'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations (
      product_id, participant_id, customer_id, status
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active'
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'external_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Paid shapes (subscription_monthly, single_payment). Everything above has
  -- passed, so this signup is one the platform would accept — but no row is
  -- written until the money arrives. The caller creates the Stripe Checkout
  -- Session next; if the parent abandons it, nothing was left behind to clean
  -- up. `confirm_paid_participation` writes the row from the webhook.
  RETURN jsonb_build_object('kind', 'validated');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text) TO service_role;


DROP FUNCTION public.join_product_waitlist(uuid, uuid);

CREATE FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('customer');

  -- Everything else — product lock, parent-of-gamer check, waitlist_enabled
  -- gate, idempotency, the clock_timestamp() ordering stamp — is unchanged and
  -- lives in the engine. This function's whole job is authorization plus
  -- pinning the actor to the session.
  RETURN public.join_waitlist(p_product_id, p_participant_id, (SELECT auth.uid()));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_product_waitlist(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_product_waitlist(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_product_waitlist(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.join_product_waitlist(uuid, uuid) IS 'Guarded, authenticated-facing entry point for joining a product waitlist. The customer is auth.uid(); the parent-of-gamer check lives in join_waitlist.';


DROP FUNCTION public.join_waitlist(uuid, uuid, uuid);

CREATE FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product           public.products;
  v_existing_id       UUID;
  v_existing_ts       TIMESTAMPTZ;
  v_existing_status   public.participation_status;
  v_now               TIMESTAMPTZ;
  v_position          INTEGER;
  v_participation_id  UUID;
  v_is_parent         BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_participant_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_participant_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_product.waitlist_enabled THEN
    RAISE EXCEPTION 'waitlist is not enabled for this product'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency: existing waitlisted/reserving/active row → return it as-is.
  SELECT id, waitlisted_at, status
    INTO v_existing_id, v_existing_ts, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status IN ('waitlisted', 'reserving', 'active')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'waitlisted' THEN
      SELECT COUNT(*) INTO v_position
        FROM public.participations
        WHERE product_id = p_product_id AND status = 'waitlisted'
          AND (waitlisted_at < v_existing_ts
               OR (waitlisted_at = v_existing_ts AND id <= v_existing_id));
    ELSE
      -- Already holds a spot (active/reserving) — not on the waitlist.
      v_position := 0;
    END IF;
    RETURN jsonb_build_object(
      'participation_id', v_existing_id,
      'waitlist_position', v_position,
      'status', v_existing_status::text
    );
  END IF;

  -- Stamp the join time; order is derived from it, never stored as a rank.
  -- clock_timestamp(), NOT now(): now() is transaction_timestamp() (frozen at
  -- transaction start), so concurrent joins serialized on the gate lock can
  -- carry equal/inverted stamps and both compute rank 1. clock_timestamp()
  -- reads the wall clock at this statement — which runs under the lock, after
  -- the prior joiner committed — so stamps are monotonic with real join order.
  v_now := clock_timestamp();
  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, waitlisted_at
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'waitlisted', v_now
  )
  RETURNING id INTO v_participation_id;

  SELECT COUNT(*) INTO v_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted'
      AND (waitlisted_at < v_now
           OR (waitlisted_at = v_now AND id <= v_participation_id));

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_position,
    'status', 'waitlisted'
  );
END;
$$;

-- No grant: join_waitlist is reachable only from another SECURITY DEFINER
-- function inside the database, so nothing outside it executes this.
REVOKE EXECUTE ON FUNCTION public.join_waitlist(uuid, uuid, uuid) FROM PUBLIC;


DROP FUNCTION public.record_attendance(uuid, date, uuid, text);

CREATE FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_starts_at  timestamptz;
  v_status     text := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_uid        uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  IF NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Authorize the TARGET as well as the actor: the child must actually be on
  -- this group's roster. Without this, an assigned gedu could aim a mark at any
  -- gamer id in the system.
  IF NOT EXISTS (
    SELECT 1
      FROM public.participations part
     WHERE part.group_id = p_group_id
       AND part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_session_id := public.ensure_group_session(p_group_id, p_session_date);

  SELECT starts_at INTO v_starts_at
    FROM public.group_sessions WHERE id = v_session_id;

  -- The roll-call boundary: marks open the moment the session's scheduled
  -- start passes. A session under way takes attendance — that is when the gedu
  -- can see who is in the room — while a session that has not started cannot,
  -- because there is nothing yet to have attended.
  IF v_starts_at > now() THEN
    RAISE EXCEPTION 'Attendance can only be recorded once the session has started'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status IS NULL THEN
    DELETE FROM public.session_attendance
     WHERE session_id = v_session_id AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
      'session_id', v_session_id,
      'gamer_id',   p_participant_id,
      'status',     NULL
    );
  END IF;

  INSERT INTO public.session_attendance (
    session_id, participant_id, status, recorded_by
  )
  VALUES (v_session_id, p_participant_id, v_status, v_uid)
  ON CONFLICT (session_id, participant_id) DO UPDATE
    SET status      = EXCLUDED.status,
        recorded_by = EXCLUDED.recorded_by,
        recorded_at = now();

  -- The session's audit trail follows the marks: recording attendance IS a
  -- write to the session, even when neither note changed.
  UPDATE public.group_sessions
     SET updated_by = v_uid, updated_at = now()
   WHERE id = v_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'gamer_id',   p_participant_id,
    'status',     v_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_attendance(uuid, date, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_attendance(uuid, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_attendance(uuid, date, uuid, text) TO service_role;

COMMENT ON FUNCTION public.record_attendance(uuid, date, uuid, text) IS 'Record (or, with a NULL status, clear) ONE child''s attendance mark for one session. Per-mark so concurrent gedus cannot clobber each other; marks open at the session''s scheduled start (roll call during the session is the standard pattern) and never before; authorizes both the calling gedu and the target child.';


DROP FUNCTION public.set_group_member_minecraft(uuid, text, text);

CREATE FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_uuid     text;
BEGIN
  PERFORM public.assert_role('gedu');

  -- Actor AND target: the child must be actively participating in a group the
  -- caller is assigned to. A gedu may fix a username for the children they
  -- teach and for nobody else.
  IF NOT EXISTS (
    SELECT 1
      FROM public.participations part
      JOIN public.gedu_group_assignments ga ON ga.group_id = part.group_id
     WHERE part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
       AND ga.gedu_id    = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_username := NULLIF(btrim(COALESCE(p_minecraft_username, '')), '');
  -- Clearing the username clears the uuid with it: a uuid without a name is a
  -- verified link to nothing.
  v_uuid := CASE WHEN v_username IS NULL
                 THEN NULL
                 ELSE NULLIF(btrim(COALESCE(p_minecraft_uuid, '')), '')
            END;

  INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
  VALUES (p_participant_id, v_username, v_uuid)
  ON CONFLICT (user_id) DO UPDATE
    SET minecraft_username = EXCLUDED.minecraft_username,
        minecraft_uuid     = EXCLUDED.minecraft_uuid;

  RETURN jsonb_build_object(
    'gamer_id',           p_participant_id,
    'minecraft_username', v_username,
    'minecraft_uuid',     v_uuid
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.set_group_member_minecraft(uuid, text, text) IS 'Set a group member''s Minecraft username + resolved UUID, scoped to gamers actively participating in a group the calling gedu teaches. The Mojang lookup happens in the calling route, so a successful edit lands verified.';


-- ---------------------------------------------------------------------------
-- End-state assertion. A stale function body is invisible to every check we
-- run outside CI and fails at call time instead, so the migration proves its
-- own completeness before it commits.
--
-- The token cannot simply be banned: 'gamer_id' legitimately survives as a JSON
-- key several RPCs emit, and as `parent_gamer`'s own column. So the check is in
-- four parts, and each part can fail on its own.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  -- Forms of the token that can ONLY be a reference to a renamed column: the
  -- aliases the two tables are read under, the column lists they are written
  -- through, and the bare seat-lookup predicates (functions that are in
  -- c_expected for their parent_gamer reads would otherwise get a free pass on
  -- these — and a parent_gamer read cannot spell them, because there gamer_id
  -- pairs with parent_id, never with product_id/session_id). None of these can
  -- spell a parent_gamer reference (that table is read as pgm./pg./OLD./NEW.)
  -- or a quoted JSON key.
  c_column_ref CONSTANT text :=
    '(\mv_gamer_id\M'
    || '|\mpart\.gamer_id\M|\mpart2\.gamer_id\M|\matt\.gamer_id\M'
    || '|\mmine\.gamer_id\M|\mpeer\.gamer_id\M'
    || '|\mp\.gamer_id\M|\ma\.gamer_id\M'
    || '|product_id, gamer_id|session_id, gamer_id'
    || '|product_id = p_product_id\s+AND gamer_id\M'
    || '|session_id = v_session_id AND gamer_id)';

  -- Every function whose body may still contain the token at all, and why.
  -- Checked for EQUALITY, not containment: a body we forgot to rewrite shows up
  -- as an extra name, and a name that has quietly stopped matching shows up as
  -- a missing one, so neither direction passes silently.
  c_expected CONSTANT text[] := ARRAY[
    'admin_enroll_gamer',            -- reads parent_gamer.gamer_id
    'create_gamer',                  -- writes parent_gamer; p_gamer_id is its own param
    'create_participation',          -- reads parent_gamer.gamer_id
    'get_gedu_assigned_product',     -- emits the 'gamer_id' roster key; reads parent_gamer
    'get_gedu_group_feed',           -- emits the 'gamer_id' roster key; reads parent_gamer
    'get_my_gamers',                 -- reads parent_gamer.gamer_id
    'get_my_parents',                -- reads parent_gamer.gamer_id
    'get_product_groups_with_details', -- emits the 'gamer_id' key; reads parent_gamer
    'handle_orphaned_gamer',         -- parent_gamer delete trigger
    'is_parent_of',                  -- reads parent_gamer.gamer_id
    'join_waitlist',                 -- reads parent_gamer.gamer_id
    'record_attendance',             -- emits the 'gamer_id' key
    'set_group_member_minecraft',    -- emits the 'gamer_id' key
    'validate_parent_gamer_roles'    -- parent_gamer insert trigger
  ];

  v_actual   text[];
  v_expected text[];
  v_offender text;
BEGIN
  -- (1) The columns themselves.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('participations', 'session_attendance')
       AND column_name = 'gamer_id'
  ) THEN
    RAISE EXCEPTION 'gamer_id still exists on participations or session_attendance';
  END IF;

  IF (
    SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('participations', 'session_attendance')
       AND column_name = 'participant_id'
  ) <> 2 THEN
    RAISE EXCEPTION 'participant_id is missing from participations or session_attendance';
  END IF;

  -- (2) No function body still reaches for a renamed column.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_offender
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~ c_column_ref;

  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'function body still references the renamed column: %', v_offender;
  END IF;

  -- (3) And the token survives in exactly the places we decided it should.
  SELECT array_agg(p.proname ORDER BY p.proname)
    INTO v_actual
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc LIKE '%gamer_id%';

  SELECT array_agg(x ORDER BY x) INTO v_expected FROM unnest(c_expected) AS x;

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'unexpected set of functions still naming gamer_id: got %, expected %',
      v_actual, v_expected;
  END IF;

  -- (4) The seven recreated functions came back fail-closed. A recreated
  -- function loses its ACL, and the replacement it is handed by default grants
  -- EXECUTE to PUBLIC — so a missing REVOKE above would silently open a
  -- service-role-only writer of paid seats to `anon`. Asserted here rather than
  -- left to the access-control test, because that test only runs in CI and this
  -- migration also runs against hosted databases.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_offender
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'admin_enroll_gamer', 'confirm_paid_participation', 'create_participation',
       'join_product_waitlist', 'join_waitlist', 'record_attendance',
       'set_group_member_minecraft'
     )
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'recreated function is executable by anon: %', v_offender;
  END IF;

  IF has_function_privilege('authenticated', 'public.create_participation(uuid, uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.confirm_paid_participation(uuid, uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.join_waitlist(uuid, uuid, uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'a service-role-only participation writer is executable by authenticated';
  END IF;
END
$assert$;
