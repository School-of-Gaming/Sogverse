-- 00174: the family product feed names its PARTICIPANT, not "the gamer".
--
-- 00172 renamed the column that says who occupies a seat; 00173 made a parent
-- able to occupy one. This is the last place in the family read that still
-- calls that person a gamer: the document's top-level `gamer` key and the
-- function's COMMENT, both of which now describe a page a parent can be reading
-- about themselves.
--
-- WHAT CHANGES
--
--   1. The result key `'gamer'` becomes `'participant'`. The wire contract and
--      its db coverage move with it in the same commit — the schema is
--      `.strict()`, so a mismatched key fails the parse loudly rather than
--      arriving as `undefined` three components later.
--   2. The COMMENT stops saying "the caller must be the participation's gamer".
--      The predicate itself was already right: it compares auth.uid() with the
--      participation's participant and falls back to the parent link, which
--      admits a self seat by construction.
--   3. The local variable follows the key, for the same reason.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--
--   * The body's logic, its grants, its self-scoping posture and its two error
--     codes. This is a rename of one output key, and the assertion at the foot
--     of the file is what makes "one key" a checked claim rather than a hope.
--   * Every other RPC still emitting `gamer_id` / `gamer_*` result keys. Those
--     are the roster shapes, and they rename with the roster step that rewrites
--     their consumers — renaming them here would break three panels this
--     migration has no business touching.
--
-- CREATE OR REPLACE keeps the signature, so the ACL and the COMMENT survive.
-- The grants are re-issued anyway, and that is not decoration: 00172 proved on
-- staging that a function coming out of `db push` can come back
-- PUBLIC-executable regardless of the default-privilege entry 00099 set.

CREATE OR REPLACE FUNCTION public.get_my_family_product_feed(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid            uuid := (SELECT auth.uid());
  v_participant_id uuid;
  v_group_id       uuid;
  v_product_id     uuid;
  v_participant    jsonb;
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
  -- failure 00152 exists to fix was a NULL uid disappearing into a larger
  -- boolean expression.
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
  -- The first arm is also what admits a PARENT'S OWN SEAT with no change: the
  -- participant is the caller, so it matches directly and the parent-link
  -- fallback is never reached.
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

  -- Whoever holds the seat. The page is participant-scoped and reachable by
  -- URL, so it cannot get the name from a dashboard card it was not opened
  -- from. This is the caller's own child, or the caller themselves — the
  -- ownership check above is what makes that true, and it is why the key is
  -- not spelled for a gamer any more.
  SELECT jsonb_build_object(
    'id',         pr.id,
    'first_name', pr.first_name
  )
  INTO v_participant
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
  -- who they are with, which is a first name's worth of information.
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
  -- predate this participant's enrolment, and including rows the schedule no
  -- longer projects. See 00151's header for why there is no window here.
  --
  -- `report` and nothing else of the two note fields. `attendance` is ONE
  -- answer — this participant's — rather than the gedu feed's map over the
  -- roster, which is what makes another child's mark structurally unreachable
  -- rather than merely unrendered. NULL means unmarked, which is a third state
  -- and not the same claim as 'absent'.
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
    'participant', v_participant,
    'product',     v_product,
    'group',       v_group,
    'site',        v_site,
    'gedus',       v_gedus,
    'sessions',    v_sessions
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid) TO service_role;

COMMENT ON FUNCTION public.get_my_family_product_feed(uuid) IS
  'One round trip for a family club/camp/event page, scoped to ONE participation: the product shell, the group name and its family-facing note, the venue on in-person products, the teaching gedus'' first names, the group''s full stored session history with reports, and the named participant''s own attendance marks. Self-scoping — the caller must be the participation''s participant (a child, or a parent holding a seat of their own) or a parent linked to them; an unplaced participation has no page. Carries no gedu note of any scope, no roster, no other participant''s marks, no parent email, no material link and no owed/completeness state.';

-- ---------------------------------------------------------------------------
-- End state. Three claims, each of which has actually been wrong at some point
-- in this function's history: the key really is renamed, the old spelling is
-- gone from the body AND from the comment, and the replace did not leave the
-- function reachable by anon or unreachable by authenticated.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  c_src     text;
  c_comment text;
BEGIN
  SELECT p.prosrc, obj_description(p.oid, 'pg_proc')
    INTO c_src, c_comment
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_my_family_product_feed';

  IF c_src IS NULL THEN
    RAISE EXCEPTION 'get_my_family_product_feed is missing after 00174';
  END IF;

  -- The key the client parses. Quoted with its comma so this cannot be
  -- satisfied by the word appearing in a comment.
  IF position('''participant'', v_participant' IN c_src) = 0 THEN
    RAISE EXCEPTION 'get_my_family_product_feed does not emit a participant key';
  END IF;

  -- And the old one is gone. `'gamer'` with its quotes, so the word "gamer"
  -- inside a comment (there is none left, but a future edit may add one) does
  -- not fail this.
  IF position('''gamer''' IN c_src) > 0 THEN
    RAISE EXCEPTION 'get_my_family_product_feed still emits a gamer key';
  END IF;

  -- The COMMENT was the other half of the rename and is the half nothing else
  -- would ever notice: no test reads it, and a stale one would go on telling
  -- the next reader that only a gamer can hold this seat.
  IF c_comment IS NULL OR position('the participation''s participant' IN c_comment) = 0 THEN
    RAISE EXCEPTION 'get_my_family_product_feed COMMENT was not updated';
  END IF;

  IF has_function_privilege('anon', 'public.get_my_family_product_feed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_my_family_product_feed is reachable by anon';
  END IF;

  IF NOT has_function_privilege(
    'authenticated', 'public.get_my_family_product_feed(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_my_family_product_feed is not executable by authenticated';
  END IF;
END
$assert$;
