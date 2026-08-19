-- Both session feeds name the session's LAST EDITOR, by id and first name.
--
-- WHY
--
-- A session-report card is currently unsigned: a family reads a write-up with
-- no idea who wrote it, and a gedu opening a colleague's group sees the same
-- anonymous block. Both feeds already have the answer sitting in
-- `group_sessions.updated_by` — the staff feed even emits the id — and what is
-- missing is only the name to render beside it.
--
-- WHAT `updated_by` ACTUALLY MEANS, AND WHY THAT IS ACCEPTED
--
-- It is the last gedu who touched the session row in ANY recorded way. Three
-- writers stamp it and no others: `ensure_group_session` when it materializes
-- the row, `set_group_session_notes` when either written field is saved, and
-- `record_attendance` on every mark and unmark. So a gedu who only corrected an
-- attendance tick, or edited the private staff note, becomes the last editor of
-- a report somebody else wrote.
--
-- That imprecision is a decision, not an oversight. In practice the gedu who
-- touches one part of a session touches all of it, and a dedicated
-- per-field author column — with the writer changes and the backfill it would
-- need — was judged not worth the schema for that edge. **Do not "fix" this by
-- quietly adding a report_author column**; the chip claims "last edited by",
-- and that is what this field answers.
--
-- WHAT CHANGES, PER FUNCTION
--
--   * `get_gedu_group_feed` already emits `updated_by`. It gains
--     `updated_by_first_name` beside it — the profile first name for that id,
--     NULL when the id is NULL. A correlated subquery against `public.profiles`
--     rather than a join, matching how this body already reaches for the
--     attendance map and the roster's parent email.
--   * `get_my_family_product_feed` emits NEITHER today and gains BOTH.
--
-- WHY THE FAMILY DOCUMENT MAY CARRY IT
--
-- Deliberate and approved. The document already names every gedu currently
-- assigned to the group, by id and first name, for exactly this reason: a
-- family is told who they are with. A first name is the same quantum of
-- information whether it arrives in the `gedus` array or on a session.
--
-- The name travels PER SESSION rather than being looked up in that array,
-- because the two sets genuinely differ: the gedu who wrote up a session in
-- September may have left the group by November, and a client resolving the id
-- against the current gedus would render an unsigned card for the oldest
-- reports — the ones most likely to be read by someone catching up. Nothing
-- else joins the family payload: no `created_by`, no `gedu_note`, and the
-- contract on the other end stays `.strict()` so a fourth key cannot arrive
-- unnoticed.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--
--   * No column is added, altered or dropped. No writer function is touched.
--   * Both signatures, both guards, both self-scoping/role-gated postures and
--     the ACL each function carries today.
--
-- CREATE OR REPLACE keeps the signature, so the ACL and the COMMENT survive.
-- The grants are re-issued anyway, and that is not decoration: a function
-- coming out of `db push` can come back PUBLIC-executable regardless of the
-- default-privilege entry 00099 set (observed on staging during 00172), so the
-- REVOKE below is load-bearing rather than historical.

-- ---------------------------------------------------------------------------
-- 1. The staff feed
-- ---------------------------------------------------------------------------

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
  -- so the client can tell someone who joined last week from one who has been
  -- here all term.
  --
  -- The identity key is `participant_id` as of 00175. Every row on this roster
  -- is whoever holds the seat, and since 00173 that can be an adult — the
  -- date_of_birth / gender / minecraft columns below simply come back NULL for
  -- one, which is the deliberate empty the row renders rather than a gap.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so on a CHILD row this is non-null in practice and the wire
        -- contract said so until 00173. An ADULT row has no parent link at all,
        -- so it is NULL there and the contract now allows it — the address for
        -- that row is the one below.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.participant_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        ),
        -- The adult's own address, and NULL on every child row. Deliberately
        -- not "the participant's email whoever they are": a gamer's profile
        -- email is the synthetic @gamer.sogverse.internal handle, which is not
        -- a mailbox and must never reach a copy-email affordance. The role
        -- check (00177) is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END
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
        -- The last editor's first name, for the author chip on the card.
        --
        -- LEFT-JOIN-shaped on purpose: NULL when nothing has stamped the row
        -- yet, and NULL again if the profile has gone. The FK is ON DELETE SET
        -- NULL, so the second case cannot arise from a deleted profile — it is
        -- written this way so the shape survives any future relaxation rather
        -- than because it is reachable today.
        --
        -- This is the LAST TOUCHER of the whole session, not the report's
        -- author: an attendance correction or a staff-note edit moves it. See
        -- this migration's header for why that is accepted.
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        -- Sparse map keyed by participant id. A roster member absent from this
        -- object is UNMARKED, which is a different claim from 'absent'.
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

REVOKE EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO service_role;

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS
  'One round trip for a gedu group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map. Contains no schedule expansion — the client owns the calendar math. Each roster row is keyed by participant_id (00175 — whoever holds the seat, child or adult) and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox). Each session carries updated_by with the last editor''s first name beside it (00194) — last editor of the SESSION, not author of the report: an attendance mark or a staff-note edit moves it.';

-- ---------------------------------------------------------------------------
-- 2. The family feed
-- ---------------------------------------------------------------------------

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
  --
  -- The two `updated_by*` keys are the ONE widening 00194 makes here, and the
  -- name travels per session rather than being resolved against `gedus` above
  -- because the sets genuinely differ: the gedu who wrote up September may not
  -- teach the group in November, and resolving against the current list would
  -- leave the oldest reports unsigned. A first name is the same quantum of
  -- information a family already gets for every assigned gedu. It is the last
  -- editor of the SESSION, not the report's author — an attendance mark moves
  -- it — which is a limitation this document states rather than hides.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',           s.id,
        'session_date', s.session_date,
        'starts_at',    s.starts_at,
        'ends_at',      s.ends_at,
        'report',       s.report,
        'updated_by',   s.updated_by,
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
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

COMMENT ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) IS
  'One round trip for a family club/camp/event page, scoped to ONE participation: the product shell, the group name and its family-facing note, the venue on in-person products, the teaching gedus'' first names, the group''s full stored session history with reports, and the named participant''s own attendance marks. Each session also carries updated_by and the last editor''s first name (00194) — last editor of the SESSION, not author of the report: an attendance mark or a staff-note edit moves it. The name travels per session because a past session''s editor may no longer teach the group. Self-scoping — the caller must be the participation''s participant (a child, or a parent holding a seat of their own) or a parent linked to them; an unplaced participation has no page. Carries no gedu note of any scope, no roster, no other participant''s marks, no parent email, no material link and no owed/completeness state.';

-- ---------------------------------------------------------------------------
-- 3. End state
-- ---------------------------------------------------------------------------
--
-- Both bodies are grepped for the keys they must now emit, quoted with the
-- comma or the expression that follows, so the word appearing in a comment
-- cannot satisfy the check. The family half additionally re-asserts the two
-- things this widening must NOT have brought with it, because that document's
-- omissions are its privacy contract and this is the migration most likely to
-- have loosened them by accident.

DO $assert$
DECLARE
  c_gedu   text;
  c_family text;
BEGIN
  SELECT p.prosrc INTO c_gedu
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_gedu_group_feed';

  SELECT p.prosrc INTO c_family
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_my_family_product_feed';

  IF c_gedu IS NULL OR c_family IS NULL THEN
    RAISE EXCEPTION 'a session feed function is missing after 00194';
  END IF;

  IF position('''updated_by_first_name''' IN c_gedu) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed does not emit updated_by_first_name';
  END IF;

  -- The closing quote is what separates this from `updated_by_first_name`,
  -- whose key continues with an underscore where this one ends.
  IF position('''updated_by''' IN c_family) = 0 THEN
    RAISE EXCEPTION 'get_my_family_product_feed does not emit updated_by';
  END IF;

  IF position('''updated_by_first_name''' IN c_family) = 0 THEN
    RAISE EXCEPTION 'get_my_family_product_feed does not emit updated_by_first_name';
  END IF;

  -- The privacy line, restated where it is easiest to cross. Quoted with the
  -- comma so the words in this body's own comments cannot satisfy either.
  IF position('''gedu_note''' IN c_family) > 0 THEN
    RAISE EXCEPTION 'get_my_family_product_feed now emits a gedu_note key';
  END IF;

  IF position('''created_by''' IN c_family) > 0 THEN
    RAISE EXCEPTION 'get_my_family_product_feed now emits a created_by key';
  END IF;

  IF has_function_privilege('anon', 'public.get_gedu_group_feed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_gedu_group_feed is reachable by anon — the REVOKE FROM PUBLIC did not take';
  END IF;

  IF has_function_privilege('anon', 'public.get_my_family_product_feed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_my_family_product_feed is reachable by anon — the REVOKE FROM PUBLIC did not take';
  END IF;

  IF NOT has_function_privilege(
    'authenticated', 'public.get_gedu_group_feed(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_gedu_group_feed is not executable by authenticated';
  END IF;

  IF NOT has_function_privilege(
    'authenticated', 'public.get_my_family_product_feed(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'get_my_family_product_feed is not executable by authenticated';
  END IF;
END
$assert$;
