-- The family feed is widened in place.
--
-- 00222 gave every session a photo array and widened two documents in place —
-- the gedu feed and, in 00223, the admin one — but not the family feed. That one
-- got a versioned twin, `get_my_family_product_feed_v2`, because the family
-- contracts schema is `.strict()` at every level: for the sub-minute window
-- between the migration deploying and the release going live, the still-deployed
-- app would fail to PARSE the widened document and the family club/camp/event
-- page would not load.
--
-- That reading of the release rules has been overruled. `docs/plans/CLAUDE.md`,
-- "Landing in stages", now says under the heading «"Breaks under" is judged by
-- severity, not by the letter of a parse error» that transient READ-SIDE
-- breakage which heals itself the moment the deploy completes — a strict schema
-- briefly refusing a widened document, so one page fails to load for under a
-- minute — is inside the accepted deploy window rather than the carve-out that
-- needs a compatibility step. The carve-out is reserved for breakage that is
-- permanent or write-side (a drop, a rename, a tightened constraint the old
-- writes violate), or for payments and auth, where even a minute is too long. A
-- family reading a session report is none of those, and the versioned twin plus
-- its follow-up cleanup migration cost more than the window it bought.
--
-- So this migration unwinds it, in the only order that is safe:
--
--   1. `get_my_family_product_feed` is replaced with the widened body — v2's,
--      verbatim, minus the comments about why it had a versioned name.
--   2. `get_my_family_product_feed_v2` is dropped. Nothing calls it: the app is
--      moving to the canonical name in the same release, and the two bodies are
--      identical, so the deploy window here is the ordinary one — the old app
--      briefly meeting a widened document, which is exactly the case the ruling
--      above accepts.
--
-- CREATE OR REPLACE preserves the ACL and the signature is unchanged, but a
-- recreated function has been observed coming back PUBLIC-executable on staging
-- (00172), so the revoke and the per-role grants are re-issued rather than
-- assumed. The comment is re-issued too, because the one on the canonical name
-- still describes a document with no photos in it.
--
-- No table, no index, no policy and no grant on anything else is touched.

-- ---------------------------------------------------------------------------
-- 1. The family document, widened
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_family_product_feed(p_participation_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
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
  -- ownership check above is what makes that true.
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
  -- The two `updated_by*` keys are 00194's widening, and the name travels per
  -- session rather than being resolved against `gedus` above because the sets
  -- genuinely differ: the gedu who wrote up September may not teach the group in
  -- November, and resolving against the current list would leave the oldest
  -- reports unsigned. It is the last editor of the SESSION, not the report's
  -- author — an attendance mark moves it — which is a limitation this document
  -- states rather than hides.
  --
  -- `images` is 00222's, arriving here in place as of this migration. Same shape
  -- as the gedu and admin documents' — {id, width, height}, ordered by
  -- (created_at, id) — because one shared gallery component renders them all.
  -- The uploader does not travel: it is safeguarding audit, and a family surface
  -- is the last place for it.
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
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
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

COMMENT ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) IS
  'One round trip for a family club/camp/event page, scoped to ONE '
  'participation: the product shell, the group name and its family-facing note, '
  'the venue on in-person products, the teaching gedus'' first names, the '
  'group''s full stored session history with reports and PHOTOS, and the named '
  'participant''s own attendance marks. Each session carries updated_by and the '
  'last editor''s first name (00194) — last editor of the SESSION, not author '
  'of the report: an attendance mark or a staff-note edit moves it. The name '
  'travels per session because a past session''s editor may no longer teach the '
  'group. Since this migration each session also carries `images`: {id, width, '
  'height} per photo, ordered by (created_at, id), the same shape the gedu and '
  'admin documents carry because one shared gallery renders all three, and '
  'never the uploader, which is safeguarding audit. That key was added by 00222 '
  'under a versioned twin, get_my_family_product_feed_v2, on the reading that a '
  '`.strict()` response schema in the still-deployed app failing to parse a '
  'widened document was breakage the release window could not absorb. The '
  'severity paragraph in docs/plans/CLAUDE.md''s "Landing in stages" section '
  'now settles that the other way: transient READ-SIDE breakage that heals '
  'itself the moment the deploy completes is inside the accepted window, and '
  'the compatibility step is reserved for permanent or write-side breakage and '
  'for payments and auth. So the widening landed here in place and the twin was '
  'dropped. Self-scoping — the caller must be the participation''s participant '
  '(a child, or a parent holding a seat of their own) or a parent linked to '
  'them; an unplaced participation has no page and answers P0002; a row that '
  'does not exist and a row belonging to another family are refused '
  'identically, so it cannot be used as an oracle for enrollment ids. Carries '
  'no gedu note of any scope, no roster, no other participant''s marks, no '
  'parent email, no material link and no owed/completeness state.';

-- CREATE OR REPLACE preserves the ACL, but a recreated function has been
-- observed coming back PUBLIC-executable on staging (00172), so the revoke and
-- the per-role grants are re-issued rather than assumed.
REVOKE EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The versioned twin, dropped
-- ---------------------------------------------------------------------------
--
-- Plain DROP, not IF EXISTS: this migration's whole premise is that 00222
-- created it, so a database where it is absent is a database this file has
-- misunderstood and should stop on rather than pass over quietly.

DROP FUNCTION public.get_my_family_product_feed_v2(uuid);
