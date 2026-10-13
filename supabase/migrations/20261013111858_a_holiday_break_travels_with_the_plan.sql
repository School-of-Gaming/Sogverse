-- A holiday break travels with the plan.
--
-- A holiday is never planned, so the plan every session document carries
-- simply lacks those dates. A reader drawing the plan has to be told WHY a
-- week is missing, so each document now carries `holiday_breaks` beside its
-- plan, over the same span: one entry per break of a calendar the product
-- follows, with its dates, its name in every locale the admin wrote (the
-- reader picks one; the database never chooses a locale) and the plan rows it
-- withdrew inside the span.
--
-- A holiday date carries only its break. So the staff feeds stop shipping a
-- stored record that sits on one (the family and trainee feeds already left
-- it out, through group_session_is_cancelled), and no document lists a
-- cancellation on a holiday date: the cancellation row is kept, and is listed
-- again if the break goes.
--
-- The admin dashboard lists no cancellation of its own beyond the planned
-- dates', which never fall on a holiday, so only its breaks are new.


-- ---------------------------------------------------------------------------
-- holiday_breaks_document
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.holiday_breaks_document(
  p_product_id uuid,
  p_from       date,
  p_to         date
) RETURNS jsonb
  LANGUAGE sql STABLE
  SET search_path TO ''
  AS $$
  -- The plan with its holidays, over the span, read once: the holiday rows
  -- are the sessions each break withdrew.
  WITH withdrawn AS (
    SELECT psd.session_date, psd.starts_at, psd.ends_at, psd.holiday_break_id
      FROM public.planned_session_dates(p_product_id, p_from, p_to, true) AS psd
     WHERE psd.holiday_break_id IS NOT NULL
  )
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         hb.break_id,
               'start_date', hb.start_date,
               'end_date',   hb.end_date,
               'names', COALESCE((
                 SELECT jsonb_agg(
                          jsonb_build_object('locale', t.locale, 'name', t.name)
                          ORDER BY t.locale
                        )
                   FROM public.holiday_break_translations t
                  WHERE t.break_id = hb.break_id
               ), '[]'::jsonb),
               'withdrawn_sessions', COALESCE((
                 SELECT jsonb_agg(
                          jsonb_build_object(
                            'session_date', w.session_date,
                            'starts_at',    w.starts_at,
                            'ends_at',      w.ends_at
                          )
                          ORDER BY w.session_date, w.starts_at
                        )
                   FROM withdrawn w
                  WHERE w.holiday_break_id = hb.break_id
               ), '[]'::jsonb)
             )
             ORDER BY hb.start_date, hb.break_id
           ),
           '[]'::jsonb
         )
    FROM public.product_holiday_breaks(p_product_id, p_from, p_to) AS hb;
$$;

COMMENT ON FUNCTION public.holiday_breaks_document(uuid, date, date) IS
  'The `holiday_breaks` member every session document carries beside its plan: '
  'a JSON array, [] when there are none, of every break of a holiday calendar '
  'the product follows that touches [p_from, p_to] (product_holiday_breaks), '
  'ordered by first day then id, each as {id, start_date, end_date, names: '
  '[{locale, name}] in every locale written, ordered by locale, '
  'withdrawn_sessions: [{session_date, starts_at, ends_at}]}. '
  'withdrawn_sessions are the plan rows inside the span that the break removed '
  '— planned_session_dates with its holidays, tagged with this break — so a '
  'break the term or the schedule never reaches withdraws nothing, and where '
  'two calendars'' breaks overlap a date is withdrawn by the earlier one alone. '
  'The reader picks the name for its own locale; the database never chooses '
  'one. Never a calendar''s own name, which is admin-only. SECURITY INVOKER '
  'over tables whose read policies admit every followed calendar''s breaks and '
  'names to anon and authenticated alike, so it answers every caller '
  'identically.';

REVOKE EXECUTE ON FUNCTION public.holiday_breaks_document(uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.holiday_breaks_document(uuid, date, date) TO anon;
GRANT  EXECUTE ON FUNCTION public.holiday_breaks_document(uuid, date, date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.holiday_breaks_document(uuid, date, date) TO service_role;

COMMENT ON FUNCTION public.group_session_date_is_holiday(uuid, date) IS
  'Whether the date falls in a break of a holiday calendar the group''s product '
  'follows. The holiday arm of group_session_is_cancelled; what the session '
  'documents ask to leave a holiday''s stored row and cancellation off the '
  'wire, the date carrying its break alone; and the partner API''s way to name '
  'a stored session on a holiday. Service-role only.';

-- ---------------------------------------------------------------------------
-- get_my_family_product_feed
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
  v_creations      jsonb;
  v_cancellations  jsonb;
  v_paid_through   date;
  v_start_date     date;
  v_horizon        date;
BEGIN
  -- No caller, no answer. This function is scoped entirely to auth.uid(); with
  -- no uid there is nobody for it to be scoped TO, so there is no correct
  -- document to return and the only safe reply is a refusal. Checked FIRST and
  -- on its own, rather than folded into the predicate below, where a NULL uid
  -- would disappear into a larger boolean expression instead of refusing.
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
  -- product_staff_details and this query does not join it. The requirement flag
  -- is not selected either, and its absence here is the enforcement: it
  -- is staff-facing, and a family sees nothing different on a flagged product.
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

  -- THIS participant's creations in THIS group, and nobody else's. A
  -- flat array on the document rather than a map keyed by participant, so
  -- another child's work has nowhere to live here BY TYPE — the same move
  -- `attendance` makes below, where the gedu feed carries a map and this
  -- document carries one answer. Empty array when there is no row, so the card
  -- renders on "is this empty" and never on "is this null".
  SELECT COALESCE(
           (SELECT c.creations
              FROM public.gamer_group_creations c
             WHERE c.group_id       = v_group_id
               AND c.participant_id = v_participant_id),
           '[]'::jsonb
         )
    INTO v_creations;

  -- The group's whole stored history, newest first — including sessions that
  -- predate this participant's enrolment, and including rows the schedule no
  -- longer projects. There is deliberately no window here: what is stored is
  -- what travels.
  --
  -- `report` and nothing else of the two note fields. `attendance` is ONE
  -- answer — this participant's — rather than the gedu feed's map over the
  -- roster, which is what makes another child's mark structurally unreachable
  -- rather than merely unrendered. NULL means unmarked, which is a third state
  -- and not the same claim as 'absent'.
  --
  -- The two `updated_by*` keys ride on every session, and the name travels per
  -- session rather than being resolved against `gedus` above because the sets
  -- genuinely differ: the gedu who wrote up September may not teach the group in
  -- November, and resolving against the current list would leave the oldest
  -- reports unsigned. It is the last editor of the SESSION, not the report's
  -- author — an attendance mark moves it — which is a limitation this document
  -- states rather than hides.
  --
  -- `images` has the same shape as the gedu and admin documents' —
  -- {id, width, height}, ordered by (created_at, id) — because one shared
  -- gallery component renders them all. The uploader does not travel: it is
  -- safeguarding audit, and a family surface is the last place for it.
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
         -- Cancellation: a record kept under a cancellation does not travel. A
         -- family is told the session is off, and a report on it would say
         -- otherwise; a restore brings the row back here as it was.
         AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
    ) AS session_rows;

  -- Cancellation: the group's cancelled sessions in effect, newest first, as a
  -- date and NOTHING ELSE. The reason and who cancelled are admin-only; a
  -- family is told the session is off, not why. One kept over a record the
  -- schedule no longer projects travels too, and the record beside it does
  -- not (above): the family has no instants to draw it at, so the date
  -- simply stops being shown rather than showing the report. One on a holiday
  -- is not listed: that date carries its break and nothing else, and the
  -- cancellation is listed again if the break goes.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('session_date', sc.session_date)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = v_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
     AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date);

  -- The product-local date a cancelled membership is paid through: the
  -- `canceling` subscription's current_period_end, the instant the family's
  -- access ends, which the page also reads (as its access-until) to clamp the
  -- list. NULL on anything else, which leaves the horizon as it is.
  SELECT (fs.current_period_end AT TIME ZONE p.timezone)::date
    INTO v_paid_through
    FROM public.family_subscriptions fs
    JOIN public.products p ON p.id = v_product_id
   WHERE fs.participation_id = p_participation_id
     AND fs.status = 'canceling';

  -- The plan's span, which the holiday breaks share: the product's start to
  -- its horizon for THIS group, raised to the paid-through date.
  SELECT p.start_date INTO v_start_date
    FROM public.products p WHERE p.id = v_product_id;
  v_horizon := public.session_plan_horizon(v_product_id, v_group_id, v_paid_through);

  RETURN jsonb_build_object(
    'participant', v_participant,
    'product',     v_product,
    'group',       v_group,
    'site',        v_site,
    'gedus',       v_gedus,
    'creations',   v_creations,
    'sessions',    v_sessions,
    'cancellations', v_cancellations,
    -- The plan from the product's start to its horizon for THIS group — the
    -- eighth session that has not ended and that the group has not cancelled,
    -- on an open-ended product — raised to the paid-through date, so a cancelled membership's
    -- plan reaches the last session the family may still attend. Plain plan
    -- rows; the cancellations above are laid over them by date.
    'planned_sessions', public.planned_sessions_document(v_product_id, v_horizon),
    -- The holiday breaks over the same span, each with the sessions it
    -- withdrew from the plan above.
    'holiday_breaks',   public.holiday_breaks_document(v_product_id, v_start_date, v_horizon)
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) IS 'One round trip for a family club/camp/event page, scoped to ONE participation: the product shell, the group name and its family-facing note, the venue on in-person products, the teaching gedus'' first names, the group''s full stored session history with reports and PHOTOS, the named participant''s own attendance marks, and that participant''s own creations. Each session carries updated_by and the last editor''s first name — last editor of the SESSION, not author of the report: an attendance mark or a staff-note edit moves it. The name travels per session because a past session''s editor may no longer teach the group. Each session also carries `images`: {id, width, height} per photo, ordered by (created_at, id), the same shape the gedu and admin documents carry because one shared gallery renders all three, and never the uploader, which is safeguarding audit. That key rides on this strict family document under no versioned twin of its own, on the severity paragraph in docs/plans/CLAUDE.md: transient read-side breakage inside a release window is accepted. `creations` is a TOP-LEVEL array of {title, url} — this participant''s own, in this group, and structurally incapable of holding anybody else''s because it is not a map keyed by participant. It is the one staff-authored family-facing field that carries links, an owner-approved exception to the link-free rule session reports follow, and the render side parses each URL and degrades to the title as plain text when it is not http(s). Empty array when there is nothing, so the card renders on emptiness and never on null. `planned_sessions` is the product''s plan from start_date to session_plan_horizon for this group (planned_sessions_document), raised to the product-local date a `canceling` subscription''s current_period_end falls on — the paid-through instant the page clamps the list at — as plain {session_date, starts_at, ends_at} rows; the cancellations stay their own list, and leave out any on a holiday date. `holiday_breaks` is holiday_breaks_document over the same span: each break of a calendar the product follows, with its name in every locale and the plan rows it withdrew. Self-scoping — the caller must be the participation''s participant (a child, or a parent holding a seat of their own) or a parent linked to them; an unplaced participation has no page and answers P0002; a row that does not exist and a row belonging to another family are refused identically, so it cannot be used as an oracle for enrollment ids. Carries no gedu note of any scope, no roster, no other participant''s marks or creations, no parent email, no material link, no requires_gamer_creations flag and no owed/completeness state.';

REVOKE ALL ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- get_trainee_group_feed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_trainee_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id    uuid;
  v_timezone      text;
  v_today         date;
  v_product       jsonb;
  v_group         jsonb;
  v_site          jsonb;
  v_roster        jsonb;
  v_sessions      jsonb;
  v_gedus         jsonb;
  v_cancellations jsonb;
  v_trainees      jsonb;
  v_start_date    date;
  v_horizon       date;
BEGIN
  -- Guard-first, in the shape get_gedu_group_feed uses: an admin or a gedu
  -- past the first statement, everyone else refused on it.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. A gedu reads this only for a group they hold a
  -- trainee seat on — an assigned gedu reads the full document instead. An
  -- admin passes outright, so the trainee's view can be previewed.
  IF NOT public.is_admin()
     AND NOT public.gedu_trains_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id, p.timezone, p.start_date
    INTO v_product_id, v_timezone, v_start_date
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- The plan's span, which the holiday breaks share.
  v_horizon := public.session_plan_horizon(v_product_id, p_group_id);

  -- Ages are counted on the product's own calendar day.
  v_today := (now() AT TIME ZONE COALESCE(v_timezone, 'UTC'))::date;

  -- The shell, the material link included: a trainee prepares from the same
  -- material the session is run from.
  SELECT jsonb_build_object(
    'id',                       p.id,
    'product_type',             p.product_type,
    'timezone',                 p.timezone,
    'start_date',               p.start_date,
    'end_date',                 p.end_date,
    'is_remote',                p.is_remote,
    'material_url',             psd.material_url,
    'requires_gamer_creations', p.requires_gamer_creations,
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

  -- The public note only. The staff note does not travel at all.
  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue on in-person products, without its staff note.
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

  -- The current roster, keyed by participant_id like the gedu document's.
  -- An age rather than a birth year and month, no contact address of any kind, and
  -- whether a staff note exists rather than what it says. `creations` is
  -- always empty: a gamer sees only their own.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'group_joined_at',    part.group_joined_at,
        'age', CASE WHEN gprof.birth_year IS NOT NULL THEN
                 EXTRACT(YEAR FROM age(v_today::timestamp,
                                       make_date(gprof.birth_year, gprof.birth_month, 1)::timestamp))::integer
               END,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- A note row exists only while it holds text (the table's CHECK).
        'has_note',           (gn.participant_id IS NOT NULL),
        'creations',          '[]'::jsonb
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
        LEFT JOIN public.gamer_group_notes gn
               ON gn.group_id       = part.group_id
              AND gn.participant_id = part.participant_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored session the group's families are shown, newest first: the
  -- family-facing report, its photos, when it was mailed and who last touched
  -- the row. No staff note, and an empty register — a gamer sees only their
  -- own mark. A record kept under a cancellation does not travel, as on the
  -- family document; the cancellation below does.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',                s.id,
        'session_date',      s.session_date,
        'starts_at',         s.starts_at,
        'ends_at',           s.ends_at,
        'report',            s.report,
        'report_emailed_at', s.report_emailed_at,
        'updated_by',        s.updated_by,
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
        'attendance', '{}'::jsonb
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
         AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
    ) AS session_rows;

  -- The group's assigned gedus, as the gedu document names them.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name,
        'role',       ga.role
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = p_group_id
    ) AS gedu_rows;

  -- The cancelled sessions in effect, in the staff documents' shape with the
  -- detail left null: that a session is off, never why. One on a holiday is
  -- not listed — that date carries its break alone.
  SELECT COALESCE(
           jsonb_agg(
             public.session_cancellation_document(sc, false)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = p_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
     AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date);

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('id', pr.id, 'first_name', pr.first_name)
             ORDER BY t.created_at, pr.id
           ),
           '[]'::jsonb
         )
    INTO v_trainees
    FROM public.gedu_group_trainees t
    JOIN public.profiles pr ON pr.id = t.gedu_id
   WHERE t.group_id = p_group_id;

  RETURN jsonb_build_object(
    'product',       v_product,
    'group',         v_group,
    'site',          v_site,
    'roster',        v_roster,
    'sessions',      v_sessions,
    'gedus',         v_gedus,
    -- A trainee is nobody's substitute and nobody's absence is theirs to know.
    'substitutions', '[]'::jsonb,
    'cancellations', v_cancellations,
    'trainees',      v_trainees,
    -- The plan and the final session, as the gedu document carries them: the
    -- schedule is no secret from anyone on the group, and nor are the holiday
    -- breaks over the same span.
    'planned_sessions', public.planned_sessions_document(v_product_id, v_horizon),
    'holiday_breaks',   public.holiday_breaks_document(v_product_id, v_start_date, v_horizon),
    'final_session_date', public.group_final_session_date(p_group_id)
  );
END;
$$;

COMMENT ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) IS 'The trainee''s group workspace: the same document get_gedu_group_feed serves, with everything a trainee may not see ABSENT from the wire rather than blanked, so the same page body renders it. A trainee sees what a gamer on the group sees, plus the material link and the roster. Guard-first on assert_role (an admin or a gedu), then gedu_trains_group as a second 42501; an admin passes outright, to preview the trainee''s view. Carries: the product shell with material_url; the group''s public note (never gedu_note); the site''s name, address and public note (never gedu_note); a roster row per active seat with participant_id, first_name, signed_up_at, group_joined_at, an integer `age` (never the birth year or month), gender, both game identities, `has_note` (whether a staff note exists, never its text or editor) and `creations` always []; no parent_email or participant_email. Every stored session a family is shown — a record kept under a cancellation does not travel — with report, report_emailed_at, updated_by and updated_by_first_name, images, and `attendance` always {}; never gedu_note, created_at, created_by or updated_at. `gedus` as {id, first_name, role}; `substitutions` always []; `cancellations` in session_cancellation_document''s shape with the admin-only detail null, none on a holiday date; `trainees` as {id, first_name}; `planned_sessions`, `holiday_breaks` and `final_session_date` as get_gedu_group_feed carries them. Photo-consent answers are not on it and the trainee cannot read them elsewhere: their read policy asks gedu_teaches_gamer, which has no trainee arm.';

REVOKE ALL ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- get_gedu_group_feed
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
  v_gedus      jsonb;
  v_substitutions     jsonb;
  v_cancellations     jsonb;
  v_trainees          jsonb;
  v_viewer     uuid    := (SELECT auth.uid());
  v_is_admin   boolean;
  v_start_date date;
  v_horizon    date;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright — the admin group details
  -- page renders this same document for any group of any product, which is what
  -- makes it the same surface as the gedu workspace rather than a second one.
  --
  -- For a GEDU this is unchanged: v1 shows them only their OWN group's feed.
  -- Peer-group feeds are not a schema restriction — relaxing this to "any group
  -- on a product the caller is assigned to" is a change to this predicate alone,
  -- and nothing downstream assumes the caller teaches the group they are
  -- reading, which is exactly what the admin path above now relies on.
  v_is_admin := public.is_admin();

  IF NOT v_is_admin
     AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id, p.start_date INTO v_product_id, v_start_date
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- The plan's span, which the holiday breaks share.
  v_horizon := public.session_plan_horizon(v_product_id, p_group_id);

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
    -- Staff-facing only, and the one thing a client needs before it can
    -- decide that the final session owes creations: the condition is derived on
    -- the client from this flag, the schedule and the roster's creations, so no
    -- document carries an "owed" field of its own.
    'requires_gamer_creations', p.requires_gamer_creations,
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
  -- The identity key is `participant_id`. Every row on this roster is whoever
  -- holds the seat, and that can be an adult — the
  -- birth year and month / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel, and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
  --
  -- `signed_up_at` and `group_joined_at` answer two different questions and
  -- both travel: the first is when this seat was taken on the PRODUCT,
  -- the second when it entered THIS GROUP, and a member moved between two
  -- groups of one product has a fresh second and an unchanged first.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'birth_year',         gprof.birth_year,
        'birth_month',        gprof.birth_month,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so on a CHILD row this is non-null in practice. An ADULT row
        -- has no parent link at all, so it is NULL there and the wire contract
        -- allows it — the address for that row is the one below.
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
        -- check is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END,
        -- The staff-only flair, in parity with
        -- get_gedu_assigned_product's roster — the two shapes are kept
        -- identical on purpose, and this is the copy the page renders.
        'group_joined_at',            part.group_joined_at,
        'note',                       gn.note,
        'note_updated_by_first_name', ned.first_name,
        -- The one field on this roster that is NOT staff-only: the
        -- member's own family reads the same list on their product page. It
        -- rides here because the roster is where the per-gamer dialog is opened
        -- from, and because the client derives the final session's fourth
        -- completeness condition by tallying it against this same roster.
        -- Always an array, never null.
        'creations',                  COALESCE(gc.creations, '[]'::jsonb)
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
        -- Keyed on exactly (group_id, participant_id), so this cannot fan the
        -- row out; profiles.id behind it is a primary key.
        LEFT JOIN public.gamer_group_notes gn
               ON gn.group_id       = part.group_id
              AND gn.participant_id = part.participant_id
        LEFT JOIN public.profiles ned           ON ned.id        = gn.updated_by
        -- Same key, same guarantee.
        LEFT JOIN public.gamer_group_creations gc
               ON gc.group_id       = part.group_id
              AND gc.participant_id = part.participant_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
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
        -- When this session's report was mailed to the group's families, and
        -- NULL until it has been. The card renders the sent line from
        -- it and decides whether to offer the button, so it has to travel with
        -- the session rather than be read separately.
        --
        -- Its partner column `report_emailed_by` deliberately stays OFF the
        -- wire: it is an audit trail for staff, nothing renders it, and the
        -- card's author chip is `updated_by_first_name` above.
        'report_emailed_at', s.report_emailed_at,
        -- The last editor's first name, for the author chip on the card.
        --
        -- LEFT-JOIN-shaped on purpose: NULL when nothing has stamped the row
        -- yet, and NULL again if the profile has gone. The FK is ON DELETE SET
        -- NULL, so the second case cannot arise from a deleted profile — it is
        -- written this way so the shape survives any future relaxation rather
        -- than because it is reachable today.
        --
        -- This is the LAST TOUCHER of the whole session, not the report's
        -- author: an attendance correction or a staff-note edit moves it.
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        -- The session's photos. `created_by` is deliberately NOT on the
        -- wire — it is safeguarding audit, it gates nothing and nothing renders
        -- it, exactly like report_emailed_by above. Ordered by (created_at, id):
        -- the stamp is clock_timestamp() taken under the session row's lock and
        -- the id breaks a sub-tick tie, so every surface draws the same order.
        -- The URL is derived from the id by one helper rather than stored.
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
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
         -- A row on a holiday does not travel: that date carries its break
         -- and nothing else, and the row is back as it was when the break goes.
         AND NOT public.group_session_date_is_holiday(s.group_id, s.session_date)
    ) AS session_rows;

  -- The group's STAFF, with roles. The client's staffing derivation needs two
  -- inputs — who is assigned and in what role, and the non-withdrawn requests
  -- for the date — and this is the first of them. First name only, exactly as
  -- every other staff list on this surface: a workspace names colleagues, it
  -- does not carry their records.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name,
        'role',       ga.role
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = p_group_id
    ) AS gedu_rows;

  -- Every NON-WITHDRAWN substitution request on the group, unbounded — exactly as this
  -- document already returns every stored session row. A withdrawn request is
  -- history that changes nothing about who is expected, so it is the one status
  -- that does not travel. The client merges these onto its entries by date; a
  -- projected date with no session row carries its requests like any other.
  --
  -- `reason` and `reason_note` ride only for an ADMIN. This document is served
  -- to an admin too (the admin group details page renders the gedu workspace's
  -- body), so the flag is the CALLER's role rather than a property of the RPC —
  -- which is what keeps a `sick` category, which is health data about a
  -- contractor, off a colleague's screen while the one document stays one
  -- document.
  SELECT COALESCE(
           jsonb_agg(
             public.substitution_request_document(r, v_is_admin, v_viewer, true)
             ORDER BY r.session_date DESC, r.created_at, r.id
           ),
           '[]'::jsonb
         )
    INTO v_substitutions
    FROM public.session_substitution_requests r
   WHERE r.group_id = p_group_id
     AND r.status <> 'withdrawn'::public.substitution_request_status;

  -- Cancellation: the group's cancelled sessions in effect, newest first —
  -- including one over a kept record the schedule no longer projects, which
  -- the feed draws as cancelled in the record's place rather than as the
  -- record. The reason, who cancelled and when ride for an ADMIN caller
  -- only, keyed to the caller exactly as a substitution reason is: a gedu
  -- learns that the session is off and nothing about why. One on a holiday is
  -- not listed: that date carries its break alone.
  SELECT COALESCE(
           jsonb_agg(
             public.session_cancellation_document(sc, v_is_admin)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = p_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
     AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date);

  -- The group's trainees in the order they were placed, drawn as
  -- Trainee-marked chips after the gedus. A trainee is not staff, so they
  -- are not in `gedus` above and never in the staffing derivation.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('id', pr.id, 'first_name', pr.first_name)
             ORDER BY t.created_at, pr.id
           ),
           '[]'::jsonb
         )
    INTO v_trainees
    FROM public.gedu_group_trainees t
    JOIN public.profiles pr ON pr.id = t.gedu_id
   WHERE t.group_id = p_group_id;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions,
    'gedus',    v_gedus,
    'substitutions',   v_substitutions,
    'cancellations', v_cancellations,
    'trainees',      v_trainees,
    -- The plan from the product's start to this group's horizon: the end
    -- date of a dated product, the eighth unfinished session the group has
    -- not cancelled on an open-ended one. Plain plan rows; the cancellations
    -- above are laid over them by date.
    'planned_sessions', public.planned_sessions_document(v_product_id, v_horizon),
    -- The holiday breaks over the same span, each with the sessions it
    -- withdrew from the plan above.
    'holiday_breaks',   public.holiday_breaks_document(v_product_id, v_start_date, v_horizon),
    -- The run's last session the group has not cancelled, NULL on an
    -- open-ended product: the session that owes creations.
    'final_session_date', public.group_final_session_date(p_group_id)
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS 'One round trip for a group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map and its photos — except a row on a holiday date, which carries its break and nothing else. Carries the product''s planned sessions beside its schedule parameters: `planned_sessions`, the plan from start_date to this group''s session_plan_horizon (planned_sessions_document), so the group''s next running session is inside however many dates ahead of it the group cancelled, as plain {session_date, starts_at, ends_at} rows with no cancellation folded in; `holiday_breaks`, holiday_breaks_document over the same span — each break of a calendar the product follows, with its name in every locale and the plan rows it withdrew; and `final_session_date`, this group''s group_final_session_date — NULL on an open-ended product. `cancellations` lists the cancellations in effect, none on a holiday date. Open to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s page body unchanged: one body fed by one document is what keeps the two surfaces one surface, where a second admin-shaped RPC would have started drifting field by field. An admin passes the ownership half outright; a gedu is shown only their OWN group''s feed, and a customer or a gamer is refused on the first statement, which is what keeps the material link and the three staff notes off every family surface. Each roster row is keyed by participant_id (whoever holds the seat, child or adult), carries both game identities (minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, independent of each other and drawn according to the product''s topic, which this document does not carry), and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox). Each roster row also carries the staff-only flair — group_joined_at (when the seat entered THIS group, as against signed_up_at, which is when it was taken on the product), note and note_updated_by_first_name — in deliberate parity with get_gedu_assigned_product''s roster, which is the parity the page depends on because it renders this copy. Each roster row additionally carries `creations` (always an array, [] when there is no row) — the one roster field that is NOT staff-only, since the member''s own family reads the same list — and the product shell carries requires_gamer_creations, because the final session''s fourth completeness condition is derived on the CLIENT from that flag, the schedule and this roster''s creations; no document carries an "owed" field. Each session row carries report_emailed_at — when its report was mailed to the families, NULL until it was — and never report_emailed_by, which is audit and renders nowhere. Each session row also carries `images`: {id, width, height} per photo, ordered by (created_at, id), with the uploader deliberately off the wire for the same reason the sender is. The key sits directly on the session rather than under a versioned name, because the gedu contracts schema is tolerant of unknown keys. The document carries two more members, both of them inputs to the client-side staffing derivation rather than answers from it: `gedus`, the group''s assignments as {id, first_name, role}; and `substitutions`, every NON-WITHDRAWN substitution request on the group, unbounded, in the one shape substitution_request_document defines and every substitution write returns. Withdrawn is the one status that does not travel, because it changes nothing about who is expected. The client merges substitutions onto its entries by date, and a projected date with no session row carries its requests like any other. `reason` and `reason_note` ride for an ADMIN caller only — this document is served to an admin too, so the flag is the CALLER''s role rather than a property of the RPC, which is what keeps a `sick` category off a colleague''s screen while the one document stays one document. `offer_count` rides for an admin and for the requester themselves. The GATE is gedu_teaches_group, which admits a live substitution on the group, so a sub opens the workspace they are substituting. It is the ONE caller that asks substitution_request_document to reveal the requester explicitly. The workspace is reached only by staff on the group and its session card''s staffing line names who is away; the REASON rides on the admin flag alone, so a colleague learns that somebody is absent and never that it was `sick`. `trainees` names the group''s trainee seats as {id, first_name} in placement order, drawn as Trainee-marked chips after the group''s gedus on every workspace shell; a trainee is not in `gedus`, and a trainee cannot read this document — gedu_teaches_group has no trainee arm, and their own read is get_trainee_group_feed.';

REVOKE ALL ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- get_admin_product_sessions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_product_sessions(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product jsonb;
  v_site    jsonb;
  v_groups  jsonb;
  v_viewer  uuid := (SELECT auth.uid());
  v_start_date date;
  v_horizon    date;
BEGIN
  PERFORM public.assert_admin();

  SELECT p.start_date INTO v_start_date
    FROM public.products p WHERE p.id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- The plan's span, once for every group, which the holiday breaks share:
  -- to the furthest of the groups' own horizons, so every group's next
  -- running session is inside; a product with no groups reads to the
  -- product's horizon.
  v_horizon := COALESCE(
                 (SELECT max(public.session_plan_horizon(p_product_id, g.id))
                    FROM public.product_groups g
                   WHERE g.product_id = p_product_id),
                 public.session_plan_horizon(p_product_id)
               );

  -- The schedule parameters and nothing else. The page already holds the
  -- product row from the admin product read; what it cannot get from there is
  -- the slot list in the shape the client's calendar walk takes, which is why
  -- these four fields travel and the rest do not.
  SELECT jsonb_build_object(
    'id',         p.id,
    'timezone',   p.timezone,
    'start_date', p.start_date,
    'end_date',   p.end_date,
    'is_remote',  p.is_remote,
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
  WHERE p.id = p_product_id;

  -- The venue, on in-person products only — the same test
  -- `get_gedu_group_feed` makes, and for the same reason: a remote municipality
  -- club carries a location_id (a municipality, by CHECK), so "has a location"
  -- would put a door code and a caretaker's name on a club with no building.
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
  LEFT JOIN public.site_details sd        ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = p_product_id
    AND p.is_remote = false;

  -- Ordered by (created_at, id), which is the order the groups panel on the
  -- same page lists them in. The group selector sits directly above that panel;
  -- two orders on one page would be a bug the reader has to notice.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'created_at', entry->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',          g.id,
        'name',        g.name,
        'created_at',  g.created_at,
        'public_note', g.public_note,
        'gedu_note',   g.gedu_note,

        -- Register-shaped and nothing more: who may be marked, and what to call
        -- them. Deliberately NOT the group feed's roster — taking the register
        -- is all this surface does with it, and the groups panel on the same
        -- page already answers who these people are.
        'roster', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'participant_id', part.participant_id,
                   'first_name',     gmp.first_name
                 ) ORDER BY gmp.first_name)
            FROM public.participations part
            JOIN public.profiles gmp ON gmp.id = part.participant_id
           WHERE part.group_id = g.id
             AND part.status   = 'active'::public.participation_status
        ), '[]'::jsonb),

        -- Every stored row for the group, in the SAME shape
        -- `get_gedu_group_feed` emits — the two are read by one card component
        -- and must not disagree about what a session is. An orphan the schedule
        -- no longer projects is history and travels too.
        'sessions', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',                s.id,
                   'session_date',      s.session_date,
                   'starts_at',         s.starts_at,
                   'ends_at',           s.ends_at,
                   'report',            s.report,
                   'gedu_note',         s.gedu_note,
                   'created_at',        s.created_at,
                   'updated_at',        s.updated_at,
                   'created_by',        s.created_by,
                   'updated_by',        s.updated_by,
                   -- When the report was mailed to the families, NULL until it
                   -- was. Its audit partner `report_emailed_by` stays off the
                   -- wire here exactly as it does on the gedu feed.
                   'report_emailed_at', s.report_emailed_at,
                   -- The session's LAST EDITOR, not the report's author. An
                   -- admin who corrects one tick is named here, which is what
                   -- the chip on the card claims and is true.
                   'updated_by_first_name', (
                     SELECT pr.first_name
                       FROM public.profiles pr
                      WHERE pr.id = s.updated_by
                   ),
                   -- The session's photos. Byte-for-byte the gedu feed's
                   -- aggregate, because
                   -- one card component renders both: {id, width, height} per
                   -- photo, ordered by (created_at, id) — the stamp is
                   -- clock_timestamp() taken under the session row's lock and
                   -- the id breaks a sub-tick tie, so every surface draws the
                   -- same order — and an empty array rather than a null when
                   -- there are none. `created_by` is deliberately off the wire,
                   -- for the same reason `report_emailed_by` above is: it is
                   -- safeguarding audit, it gates nothing and nothing renders
                   -- it. The URL is derived from the id by one helper rather
                   -- than stored.
                   'images', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                              'id',     img.id,
                              'width',  img.width,
                              'height', img.height
                            ) ORDER BY img.created_at, img.id)
                       FROM public.group_session_images img
                      WHERE img.session_id = s.id
                   ), '[]'::jsonb),
                   -- Sparse map keyed by participant id. A roster member absent
                   -- from it is UNMARKED, which is not 'absent'.
                   'attendance', COALESCE((
                     SELECT jsonb_object_agg(a.participant_id, a.status)
                       FROM public.session_attendance a
                      WHERE a.session_id = s.id
                   ), '{}'::jsonb)
                 ) ORDER BY s.session_date DESC)
            FROM public.group_sessions s
           WHERE s.group_id = g.id
             -- A row on a holiday does not travel, exactly as on the gedu feed.
             AND NOT public.group_session_date_is_holiday(s.group_id, s.session_date)
        ), '[]'::jsonb),

        -- The group's staff, with roles — the first input the session card's
        -- staffing line needs, in the same shape get_gedu_group_feed emits it,
        -- because one card component renders both documents.
        'gedus', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',         pr.id,
                   'first_name', pr.first_name,
                   'role',       ga.role
                 ) ORDER BY pr.first_name)
            FROM public.gedu_group_assignments ga
            JOIN public.profiles pr ON pr.id = ga.gedu_id
           WHERE ga.group_id = g.id
        ), '[]'::jsonb),

        -- Every non-withdrawn substitution request on the group, in the gedu feed's
        -- shape verbatim and for the same reason the session shape is: one card
        -- component renders both. `reason` and `reason_note` DO travel here —
        -- this document is admin-only end to end, and the reason is what the
        -- staffing editor shows beside the request.
        'substitutions', COALESCE((
          SELECT jsonb_agg(
                   public.substitution_request_document(r, true, v_viewer)
                   ORDER BY r.session_date DESC, r.created_at, r.id
                 )
            FROM public.session_substitution_requests r
           WHERE r.group_id = g.id
             AND r.status <> 'withdrawn'::public.substitution_request_status
        ), '[]'::jsonb),

        -- Cancellation: the group's cancelled sessions, newest first, with
        -- every admin field — this document is admin-only end to end. Exactly
        -- the ones in effect: a cancellation over a kept record travels even
        -- where the schedule no longer projects its date, so the page can
        -- still restore it, and an inert one is never surfaced. One on a
        -- holiday is not listed: that date carries its break alone, and the
        -- cancellation is listed again if the break goes.
        'cancellations', COALESCE((
          SELECT jsonb_agg(
                   public.session_cancellation_document(sc, true)
                   ORDER BY sc.session_date DESC
                 )
            FROM public.session_cancellations sc
           WHERE sc.group_id = g.id
             AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
             AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date)
        ), '[]'::jsonb),

        -- The run's last session this group has not cancelled, NULL on an
        -- open-ended product. Per group, because each group's cancellations
        -- can hand the role to a different date.
        'final_session_date', public.group_final_session_date(g.id)
      ) AS entry
        FROM public.product_groups g
       WHERE g.product_id = p_product_id
    ) AS group_rows;

  RETURN jsonb_build_object(
    'product', v_product,
    'site',    v_site,
    'groups',  v_groups,
    -- The product's plan from its start, once for every group: the plan is
    -- the product's, and each group's cancellations are laid over it by date.
    'planned_sessions', public.planned_sessions_document(p_product_id, v_horizon),
    -- The holiday breaks over the same span, each with the sessions it
    -- withdrew from the plan above. The product's, like the plan.
    'holiday_breaks',   public.holiday_breaks_document(p_product_id, v_start_date, v_horizon)
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) IS 'One round trip behind the admin product page''s Sessions panel: the product''s schedule parameters, its venue and site notes on an in-person product, and every group on it with its standing notes, its register roster and every stored session row with a sparse attendance map and its photos. Admin-only, guard-first on assert_admin. Product-keyed rather than group-keyed because the page shows one product and puts a group selector in front of the feed; asking per group would send the product shell and the site over the wire once per group. Carries the product''s planned sessions beside its schedule parameters, as the gedu feed does: a top-level `planned_sessions` — the plan from start_date to the furthest of the groups'' session_plan_horizon (the product''s own when it has no groups), so every group''s next running session is inside (planned_sessions_document), plain {session_date, starts_at, ends_at} rows with no cancellation folded in, once for every group because the plan is the product''s — a top-level `holiday_breaks`, holiday_breaks_document over the same span (each break of a calendar the product follows, with its name in every locale and the plan rows it withdrew), and on each group its `final_session_date` (group_final_session_date), since each group''s cancellations can move it. A stored session row on a holiday date does not travel, and no group lists a cancellation on one: that date carries its break and nothing else. The SESSION shape is get_gedu_group_feed''s verbatim, because one card component renders both and the two must not disagree about what a session is — which is why `images` ({id, width, height} per photo, ordered by (created_at, id), never the uploader) arrives here in the same shape and needs no versioned name: this document''s reader shares the gedu session''s tolerant schema, and only the strict family one needed get_my_family_product_feed_v2. The ROSTER deliberately is not the gedu feed''s — it carries participant_id and first_name alone, since the only thing this surface does with it is take the register, and the groups panel on the same page already answers who these people are. Each group additionally carries `gedus` ({id, first_name, role}) and `substitutions` (every non-withdrawn substitution request on the group), both byte for byte get_gedu_group_feed''s — one card component renders the session cards of both documents, and the staffing line and the Set-a-sub / Clear-sub / Withdraw-request editor are drawn from exactly these two arrays. `reason` and `reason_note` DO travel here: this document is admin-only end to end, and the reason is what the editor shows beside the request.';

REVOKE ALL ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- get_admin_municipality_invoicing
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_municipality_invoicing(p_month_start date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_month_end date;
  v_clubs     jsonb;
  v_orphans   text;
BEGIN
  PERFORM public.assert_admin();

  -- The month is named by its first day and nothing else. A mid-month argument
  -- is a caller that has not decided what it is asking for — the window would
  -- be a month-long span that matches no calendar month, and every total drawn
  -- from it would be wrong in a way nobody could see. Refused loudly, after the
  -- guard, so an unauthorized caller learns nothing about the argument shape.
  IF p_month_start IS NULL
     OR p_month_start <> date_trunc('month', p_month_start::timestamp)::date THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing: p_month_start must be the first day of a month (got %)',
      p_month_start
      USING ERRCODE = 'check_violation';
  END IF;

  v_month_end := (p_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH RECURSIVE candidate AS (
    SELECT p.*
      FROM public.products p
     WHERE p.product_type = 'municipality_club'
       AND (
             EXISTS (
               SELECT 1
                 FROM public.product_groups g
                 JOIN public.group_sessions gs ON gs.group_id = g.id
                WHERE g.product_id = p.id
                  AND gs.session_date >= p_month_start
                  AND gs.session_date <= v_month_end
                  -- Cancellation: the same exclusion as `sessions` below.
                  AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
             )
          OR (
               p.start_date IS NOT NULL
               AND p.start_date <= v_month_end
               AND (p.end_date IS NULL OR p.end_date >= p_month_start)
             )
           )
  ),
  -- The ancestor-or-self walk, one chain per candidate's own location. It
  -- stops climbing the moment it has emitted a municipality, so the shortest
  -- chain wins by construction; `depth` is kept so the DISTINCT ON below picks
  -- the nearest one even if a tree ever nests two municipalities.
  walk AS (
    SELECT l.id AS origin_id,
           l.id,
           l.parent_id,
           l.type,
           l.name,
           l.name_i18n,
           0 AS depth
      FROM public.locations l
     WHERE l.id IN (
             SELECT c.location_id FROM candidate c WHERE c.location_id IS NOT NULL
           )
     UNION ALL
    SELECT w.origin_id,
           l.id,
           l.parent_id,
           l.type,
           l.name,
           l.name_i18n,
           w.depth + 1
      FROM walk w
      JOIN public.locations l ON l.id = w.parent_id
     -- Two stops, and each earns its place: the first is the answer, the second
     -- is a belt-and-braces bound on a tree the schema does not forbid a cycle
     -- in beyond a row parenting itself.
     WHERE w.type <> 'municipality'
       AND w.depth < 16
  ),
  municipality AS (
    SELECT DISTINCT ON (w.origin_id)
           w.origin_id,
           w.id,
           w.name,
           w.name_i18n
      FROM walk w
     WHERE w.type = 'municipality'
     ORDER BY w.origin_id, w.depth
  )
  SELECT COALESCE(jsonb_agg(club.doc ORDER BY club.id), '[]'::jsonb)
    INTO v_clubs
    FROM (
      SELECT c.id,
             jsonb_build_object(
               'id',                     c.id,
               'timezone',               c.timezone,
               'start_date',             c.start_date,
               'end_date',               c.end_date,
               'municipality_fee_cents', c.municipality_fee_cents,
               'product_translations',   tr.items,
               'schedule_slots',         sl.items,
               'planned_dates',          pd.items,
               'holiday_breaks',         hb.items,
               'location',
                 CASE WHEN l.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',        l.id,
                             'name',      l.name,
                             'name_i18n', l.name_i18n,
                             'type',      l.type
                           )
                 END,
               'municipality',
                 CASE WHEN m.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',        m.id,
                             'name',      m.name,
                             'name_i18n', m.name_i18n
                           )
                 END,
               -- The buyer of this club, whole rather than by id: the caller
               -- turns it into a Finvoice file, so a second admin-gated round
               -- trip per club would buy nothing. Null where nobody has said
               -- who pays yet — flagged by the page, refused by the export.
               'invoice_customer',
                 CASE WHEN ic.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',                 ic.id,
                             'fennoa_customer_no', ic.fennoa_customer_no,
                             'invoice_name',       ic.invoice_name,
                             'street',             ic.street,
                             'postal_code',        ic.postal_code,
                             'city',               ic.city,
                             'country_code',       ic.country_code,
                             'your_reference',     ic.your_reference,
                             'invoice_text',       ic.invoice_text,
                             'billing_cadence',    ic.billing_cadence
                           )
                 END,
               'sessions',               se.items,
               'cancelled_sessions',     cx.items,
               'group_ids',              gr.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.locations l ON l.id = c.location_id
        LEFT JOIN municipality m ON m.origin_id = c.location_id
        -- The link is the club's own column and never the location's: one city
        -- can be two customers, and an association can buy clubs sited in a
        -- municipality it is not.
        LEFT JOIN public.invoice_customers ic ON ic.id = c.invoice_customer_id
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
        -- The plan: every date planned_session_dates puts inside the month,
        -- clipped to the club's term by that function — one per date, since a
        -- product has at most one slot per weekday. These are the dates the
        -- club was due to meet; the page sets them beside the stored rows and
        -- the cancellations.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(psd.session_date ORDER BY psd.session_date)
                     FROM public.planned_session_dates(c.id, p_month_start, v_month_end) psd
                 ), '[]'::jsonb) AS items
        ) pd
        -- The holiday breaks touching the month, each with the planned dates
        -- it withdrew inside it: the page shows those as holiday lines at no
        -- charge, and the file leaves them out.
        CROSS JOIN LATERAL (
          SELECT public.holiday_breaks_document(c.id, p_month_start, v_month_end) AS items
        ) hb
        -- Raw rows, one per (group, date). The page collapses two groups on one
        -- date into the single session the club is paid for, and can still say
        -- which groups met — an aggregate here would have thrown that away.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'group_id',     gs.group_id,
                              'session_date', gs.session_date
                            )
                            ORDER BY gs.session_date, gs.group_id
                          )
                     FROM public.group_sessions gs
                     JOIN public.product_groups g ON g.id = gs.group_id
                    WHERE g.product_id = c.id
                      AND gs.session_date >= p_month_start
                      AND gs.session_date <= v_month_end
                      -- Cancellation: a row kept under a cancellation is not a
                      -- session that ran, so it never reaches the bill. Left
                      -- out here rather than trusted to the page, so no reader
                      -- of this document can count one.
                      AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
                 ), '[]'::jsonb) AS items
        ) se
        -- Cancellation: the month's cancelled (group, date) pairs in effect,
        -- in the same shape as `sessions`, so the page can show a cancelled
        -- date as Cancelled rather than as unrecorded and never bill it. The
        -- same predicate `sessions` excludes by, so a pair here never also
        -- appears there, and an inert cancellation appears in neither. One on
        -- a holiday is not listed: that date is the break's holiday line and
        -- nothing else.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'group_id',     sc.group_id,
                              'session_date', sc.session_date
                            )
                            ORDER BY sc.session_date, sc.group_id
                          )
                     FROM public.session_cancellations sc
                     JOIN public.product_groups g ON g.id = sc.group_id
                    WHERE g.product_id = c.id
                      AND sc.session_date >= p_month_start
                      AND sc.session_date <= v_month_end
                      AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
                      AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date)
                 ), '[]'::jsonb) AS items
        ) cx
        -- Every group the club has, whether or not the month says anything
        -- about it. A date is cancelled for the club only when every one of its
        -- groups cancelled it, and a group that neither met nor cancelled is
        -- exactly the one neither list above can name — without this a
        -- sibling's cancellation would hide its missed session. Every row, with
        -- no filter: a group has no archived state and no start date, so any
        -- group the product holds is one its schedule is due to meet.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(g.id ORDER BY g.id)
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) gr
    ) club;

  -- Every club on the invoice belongs to a municipality, or there is no invoice.
  -- A municipality club whose chain reaches no municipality cannot be billed to
  -- anybody, and the reader of this document has no way to tell such a club from
  -- one whose location was mistyped an hour ago — so the read stops and names the
  -- products, which is the whole of the repair instruction. Checked against the
  -- document that was built rather than against a second walk of the tree,
  -- because what matters is what would have been emitted.
  --
  -- A missing invoice CUSTOMER is deliberately NOT refused here, and the
  -- difference is real: a club with no municipality has nobody to bill and
  -- cannot be rendered on a page that is organised by municipality, while a club
  -- with no customer renders perfectly well and simply cannot have a file
  -- produced for it yet. Refusing the month would take every other file down
  -- with it.
  SELECT string_agg(club.value ->> 'id', ', ' ORDER BY club.value ->> 'id')
    INTO v_orphans
    FROM jsonb_array_elements(v_clubs) AS club(value)
   WHERE jsonb_typeof(club.value -> 'municipality') = 'null';

  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing: no municipality is an ancestor-or-self of the location of municipality club(s) % — repoint the location so the club can be invoiced',
      v_orphans
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'month_start', to_char(p_month_start, 'YYYY-MM-DD'),
    'clubs',       v_clubs
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) IS 'One calendar month of municipality-club invoicing, as a single document: every municipality club that either recorded a session in the month or could have (a term that overlaps it), each with its timezone, term dates, current municipality_fee_cents, the whole product_translations array, its weekly schedule slots (for the schedule summary), planned_dates — the club''s planned session dates inside the month, as planned_session_dates answers them over the month (so clipped to the term), ascending, which are the dates the club was due to meet — holiday_breaks (holiday_breaks_document over the month: each break of a calendar the club follows touching it, with its name in every locale and the planned dates it withdrew inside the month), its own location row, the nearest ancestor-or-self location of type municipality, the FENNOA INVOICE CUSTOMER it is billed to, every stored group_sessions row in the month as a raw (group_id, session_date) pair, the month''s cancelled (group_id, session_date) pairs in effect — none on a holiday date, which carries its break alone — and every group id the club has. Admin-only, guard-first on assert_admin, and deliberately not STRICT so the guard cannot be skipped on NULL input. p_month_start must be the first day of a month; anything else raises check_violation. A stored row on a date a cancellation or a holiday covers is left out of sessions, so no reader can bill a session that did not run. The candidate test is the TERM alone and the document carries no lifecycle column. The municipality walk climbs parent_id THROUGH retired rows and never filters them, because a school that has since closed still sat in its municipality. Every club in the document HAS a municipality: a club whose chain reaches none cannot be invoiced to anybody, so the whole read raises check_violation naming those product ids rather than shipping a null the caller would have to render somewhere outside every total. Each club also carries invoice_customer — the WHOLE customer row (number, invoice name, address, optional reference and invoice text, and the billing cadence that decides whether its file covers a month, a quarter or a half-year) rather than an id, because the caller turns it into a Finvoice file — or null where nobody has said who pays yet. A null customer is NOT refused, unlike a null municipality: such a club renders on the page perfectly well and only its own file is blocked, so refusing the month would take every other file down with it. The link is the club''s own column and is never derived from its location, because one city can be two customers and an association can buy clubs sited in a municipality it is not. The fee is the current column value with no snapshotting, and NULL means unset — the client shows that as a blank to fix, never as zero. A quarterly or half-yearly file is built by reading this document once per month of the period. Every array ships as [] rather than null.';

REVOKE ALL ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) TO service_role;

-- ---------------------------------------------------------------------------
-- gedu_invoicing_document
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_month_end date;
  v_doc       jsonb;
BEGIN
  -- The month is named by its first day and nothing else, exactly as the
  -- municipality invoicing read demands: a mid-month argument would answer
  -- for a month-long span that matches no calendar month.
  IF p_month_start IS NULL
     OR p_month_start <> date_trunc('month', p_month_start::timestamp)::date THEN
    RAISE EXCEPTION
      'gedu invoicing: p_month_start must be the first day of a month (got %)',
      p_month_start
      USING ERRCODE = 'check_violation';
  END IF;

  v_month_end := (p_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH RECURSIVE
  -- Standing seats: every group a gedu is assigned to TODAY whose month says
  -- anything — its product's term overlaps the month, or it stored a session
  -- row inside it (a stored row on an unscheduled date still ran). Assignments
  -- carry no history, so a past month is read against today's staffing.
  assigned AS (
    SELECT a.gedu_id, a.group_id, a.role
      FROM public.gedu_group_assignments a
      JOIN public.product_groups g ON g.id = a.group_id
      JOIN public.products p       ON p.id = g.product_id
     WHERE (p_gedu_id IS NULL OR a.gedu_id = p_gedu_id)
       AND (
             (p.start_date <= v_month_end
              AND (p.end_date IS NULL OR p.end_date >= p_month_start))
          OR EXISTS (
               SELECT 1
                 FROM public.group_sessions gs
                WHERE gs.group_id = a.group_id
                  AND gs.session_date >= p_month_start
                  AND gs.session_date <= v_month_end
             )
           )
  ),
  -- Dated seats: every live substitution inside the month, in the role the
  -- request records — the absent gedu's role when it was filed — and naming
  -- the absent gedu the sub stood in for.
  subbed AS (
    SELECT r.id, r.substitute_id AS gedu_id, r.group_id, r.session_date, r.role,
           r.requested_by AS absent_gedu_id
      FROM public.session_substitution_requests r
     WHERE r.status = 'substituted'::public.substitution_request_status
       AND r.substitute_id IS NOT NULL
       AND (p_gedu_id IS NULL OR r.substitute_id = p_gedu_id)
       AND r.session_date >= p_month_start
       AND r.session_date <= v_month_end
  ),
  seat AS (
    SELECT s.gedu_id, s.group_id FROM assigned s
    UNION
    SELECT s.gedu_id, s.group_id FROM subbed s
  ),
  -- The gedu's OWN live absences inside the month, on groups they hold a seat
  -- on — the first half of the derivation, which takes them out of those
  -- sessions — naming the sub who covered, once one is seated. Never the
  -- reason: the document does not say why anybody was away.
  absent AS (
    SELECT r.id, r.requested_by AS gedu_id, r.group_id, r.session_date,
           r.role, r.status, r.substitute_id
      FROM public.session_substitution_requests r
      JOIN seat s ON s.gedu_id = r.requested_by AND s.group_id = r.group_id
     WHERE r.status <> 'withdrawn'::public.substitution_request_status
       AND r.session_date >= p_month_start
       AND r.session_date <= v_month_end
  ),
  seat_group AS (
    SELECT DISTINCT g.id, g.product_id, g.name
      FROM seat s
      JOIN public.product_groups g ON g.id = s.group_id
  ),
  seat_product AS (
    SELECT p.*
      FROM public.products p
     WHERE p.id IN (SELECT sg.product_id FROM seat_group sg)
  ),
  -- The ancestor-or-self walk to the nearest municipality, the same walk the
  -- municipality invoicing read makes, so a club can be labelled by its town.
  -- A consumer club may reach none, and then carries null.
  walk AS (
    SELECT l.id AS origin_id, l.id, l.parent_id, l.type, l.name, l.name_i18n,
           0 AS depth
      FROM public.locations l
     WHERE l.id IN (
             SELECT sp.location_id FROM seat_product sp
              WHERE sp.location_id IS NOT NULL
           )
     UNION ALL
    SELECT w.origin_id, l.id, l.parent_id, l.type, l.name, l.name_i18n,
           w.depth + 1
      FROM walk w
      JOIN public.locations l ON l.id = w.parent_id
     WHERE w.type <> 'municipality'
       AND w.depth < 16
  ),
  municipality AS (
    SELECT DISTINCT ON (w.origin_id)
           w.origin_id, w.id, w.name, w.name_i18n
      FROM walk w
     WHERE w.type = 'municipality'
     ORDER BY w.origin_id, w.depth
  )
  SELECT jsonb_build_object(
           'month_start', to_char(p_month_start, 'YYYY-MM-DD'),
           'gedus', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',         pr.id,
                        'first_name', pr.first_name,
                        'last_name',  pr.last_name,
                        -- The gedu's own address, so an admin can find them by
                        -- it. Only here: a counterpart below is named, never
                        -- addressed.
                        'email',      pr.email,
                        'assignments', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'group_id', a.group_id,
                                     'role',     a.role
                                   )
                                   ORDER BY a.group_id
                                 )
                            FROM assigned a
                           WHERE a.gedu_id = pr.id
                        ), '[]'::jsonb),
                        'substitutions', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'request_id',   s.id,
                                     'group_id',     s.group_id,
                                     'session_date', s.session_date,
                                     'role',         s.role,
                                     'absent_gedu',  jsonb_build_object(
                                                       'id',         ap.id,
                                                       'first_name', ap.first_name,
                                                       'last_name',  ap.last_name
                                                     )
                                   )
                                   ORDER BY s.session_date, s.group_id, s.id
                                 )
                            FROM subbed s
                            JOIN public.profiles ap ON ap.id = s.absent_gedu_id
                           WHERE s.gedu_id = pr.id
                        ), '[]'::jsonb),
                        'absences', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'request_id',   ab.id,
                                     'group_id',     ab.group_id,
                                     'session_date', ab.session_date,
                                     'role',         ab.role,
                                     'status',       ab.status,
                                     -- Null while the request is open.
                                     'substitute',
                                       CASE WHEN sp.id IS NULL THEN NULL
                                            ELSE jsonb_build_object(
                                                   'id',         sp.id,
                                                   'first_name', sp.first_name,
                                                   'last_name',  sp.last_name
                                                 )
                                       END
                                   )
                                   ORDER BY ab.session_date, ab.group_id, ab.id
                                 )
                            FROM absent ab
                            LEFT JOIN public.profiles sp ON sp.id = ab.substitute_id
                           WHERE ab.gedu_id = pr.id
                        ), '[]'::jsonb)
                      )
                      ORDER BY pr.id
                    )
               FROM public.profiles pr
              WHERE pr.id IN (SELECT s.gedu_id FROM seat s)
           ), '[]'::jsonb),
           'groups', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',         sg.id,
                        'product_id', sg.product_id,
                        'name',       sg.name,
                        -- Stored rows in the month with no cancellation in
                        -- effect: the evidence a session ran. A row kept
                        -- under a cancellation is not one, and is left out
                        -- here so no reader can count it.
                        'sessions', COALESCE((
                          SELECT jsonb_agg(gs.session_date ORDER BY gs.session_date)
                            FROM public.group_sessions gs
                           WHERE gs.group_id = sg.id
                             AND gs.session_date >= p_month_start
                             AND gs.session_date <= v_month_end
                             AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
                        ), '[]'::jsonb),
                        -- The month's cancellations in effect, by the same
                        -- predicate, so a date here never also appears above
                        -- and an inert cancellation appears in neither. One
                        -- on a holiday is not listed: that date is the
                        -- break's holiday line and nothing else.
                        'cancelled_sessions', COALESCE((
                          SELECT jsonb_agg(sc.session_date ORDER BY sc.session_date)
                            FROM public.session_cancellations sc
                           WHERE sc.group_id = sg.id
                             AND sc.session_date >= p_month_start
                             AND sc.session_date <= v_month_end
                             AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
                             AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date)
                        ), '[]'::jsonb)
                      )
                      ORDER BY sg.id
                    )
               FROM seat_group sg
           ), '[]'::jsonb),
           'products', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',                       sp.id,
                        'product_type',             sp.product_type,
                        'timezone',                 sp.timezone,
                        'start_date',               sp.start_date,
                        'end_date',                 sp.end_date,
                        'primary_gedu_fee_cents',   sp.primary_gedu_fee_cents,
                        'assistant_gedu_fee_cents', sp.assistant_gedu_fee_cents,
                        'product_translations', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object('locale', pt.locale, 'name', pt.name)
                                   ORDER BY pt.locale
                                 )
                            FROM public.product_translations pt
                           WHERE pt.product_id = sp.id
                        ), '[]'::jsonb),
                        -- The plan: every date planned_session_dates puts
                        -- inside the month, clipped to the term by that
                        -- function — the dates a seat was due.
                        'planned_dates', COALESCE((
                          SELECT jsonb_agg(psd.session_date ORDER BY psd.session_date)
                            FROM public.planned_session_dates(sp.id, p_month_start, v_month_end) psd
                        ), '[]'::jsonb),
                        -- The holiday breaks touching the month, each with
                        -- the planned dates it withdrew inside it: the
                        -- invoice shows those as holiday lines at no charge.
                        'holiday_breaks', public.holiday_breaks_document(
                                            sp.id, p_month_start, v_month_end
                                          ),
                        'location',
                          CASE WHEN l.id IS NULL THEN NULL
                               ELSE jsonb_build_object(
                                      'id',        l.id,
                                      'name',      l.name,
                                      'name_i18n', l.name_i18n,
                                      'type',      l.type
                                    )
                          END,
                        'municipality',
                          CASE WHEN m.id IS NULL THEN NULL
                               ELSE jsonb_build_object(
                                      'id',        m.id,
                                      'name',      m.name,
                                      'name_i18n', m.name_i18n
                                    )
                          END
                      )
                      ORDER BY sp.id
                    )
               FROM seat_product sp
               LEFT JOIN public.locations l ON l.id = sp.location_id
               LEFT JOIN municipality m     ON m.origin_id = sp.location_id
           ), '[]'::jsonb)
         )
    INTO v_doc;

  RETURN v_doc;
END;
$$;

COMMENT ON FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) IS 'Internal builder behind gedu invoicing: one calendar month of the raw facts a gedu''s invoice is computed from, for one gedu (p_gedu_id) or for every gedu (NULL — only the admin wrapper passes that). Not granted to `authenticated`: the two guarded wrappers get_admin_gedu_invoicing and get_my_gedu_invoicing are its only client paths. p_month_start must be the first day of a month; anything else raises check_violation. Nothing is written or snapshotted — every figure is recomputed from today''s facts by a pure TypeScript builder, as municipality invoicing is. Per gedu it carries their id, name and email (the email on the gedu''s own entry only — on the gedu''s own read that is the caller''s address, and a counterpart is named but never addressed), and their SEATS: `assignments` (every group they are assigned to whose product''s term overlaps the month or which stored a session row in it, with the assignment role), `substitutions` (every `substituted` request inside the month naming them as the sub, with the role recorded on the request — the absent gedu''s at filing time — and the absent gedu''s id and name) and `absences` (their own non-withdrawn requests inside the month on a group they hold a seat on, with the seated sub''s id and name, or null while the request is open). Those are exactly the facts the substitution derivation needs to decide whether THIS gedu was expected at a (group, date); the builder runs the TypeScript twin of gedu_is_expected_at_session over them rather than this function re-deriving it. WHO covered for whom is named on both sides, so an admin can see why one gedu is not paid for a session another was, and a gedu can see who covered for them: that follows the substitution feature''s disclosure rule (src/services/session-substitution/CLAUDE.md) — the absent gedu is named to admins, to the requester, and to staff on the group, which a seated sub is; only the volunteer pool withholds it, and an unseated volunteer never reaches invoicing. A request''s REASON — its category and note — never appears. STAFFING IS TODAY''S: assignments carry no history (removing one deletes the row, a role change overwrites it), so a past month is computed from current assignments — a known, accepted limitation of v1, not an oversight. Beside the gedus ride every group their seats touch (with its stored group_sessions dates in the month that no cancellation in effect covers — the evidence a session ran — and the month''s cancelled dates in effect, both by group_session_is_cancelled, so a date is never in both, and neither holds a holiday date, which carries its break alone) and every product of those groups (type, timezone, term, both current gedu fees — NULL means not set, never zero — the whole product_translations array, planned_dates — the product''s planned session dates inside the month, as planned_session_dates answers them over the month (so clipped to the term), ascending, which are the dates its seats were due — holiday_breaks (holiday_breaks_document over the month: each break of a calendar the product follows touching it, with its name in every locale and the planned dates it withdrew inside the month), its own location and the nearest ancestor-or-self municipality, null where the chain reaches none). Every array ships as [] rather than null.';

REVOKE ALL ON FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- get_admin_dashboard
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
  -- is why the test below is the ADDRESS and not the role. `certified`
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
  -- `contract_accepted_at` is the candidate's standing against the
  -- CURRENT contract version, or NULL. It informs the certification decision and
  -- does not gate it — an unsigned candidate is still certifiable, and the admin
  -- is the one who decides what to make of the gap.
  --
  -- Standing is judged on the BASE version: a version string is
  -- `<base>/<language>` and the languages of one version are the same agreement,
  -- so signing either makes a candidate current. min() because a candidate may
  -- hold both languages' rows — the first signature is the moment they agreed,
  -- and a scalar subquery would error rather than answer.
  --
  -- `criminal_record_check_at` is when an admin recorded seeing this
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
  --   * `empty_groups_without_gedu` — a group with no educator AND no active
  --                           member. An admin pre-building next term's groups
  --                           has not made a mistake, which is why this is a
  --                           SEPARATE and LOWER-ranked kind rather than part
  --                           of the one above — but it is still a loose end
  --                           somebody has to come back to, so it is named
  --                           rather than carved out of the group check.
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
                             -- family thinking about them. Emitted so
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
        -- The same question asked of the OTHER half of the unstaffed groups:
        -- no educator, and nobody in it either. Deliberately a second
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
        -- not "is this product in an interesting state". An open seat
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
  --
  -- The sessions themselves are `planned_sessions`: planned_group_sessions over
  -- the product's window, [window_start, window_end), as rows of
  -- {session_date, starts_at, ends_at, cancelled_group_ids}. Cancellation is per
  -- (group, date) and the schedule is per product, so each product also carries
  -- `group_ids`, every group the product has (not only groups some other fact
  -- mentions), and the page decides each date from the two: a date every group
  -- cancelled is a cancelled date; a date some cancelled still runs for the rest.
  -- Beside them ride the product's `holiday_breaks` over the same window, each
  -- with the sessions it withdrew; a planned date is never a holiday, so no
  -- cancellation above is on one.
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
               'schedule_slots', sl.items,
               'group_ids',      gr.items,
               'planned_sessions', pl.items,
               'holiday_breaks', public.holiday_breaks_document(
                                   c.id, c.window_start, c.window_end - 1
                                 )
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
                   SELECT jsonb_agg(g.id ORDER BY g.id)
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) gr
        -- The window's end is exclusive and the plan's span is inclusive.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'session_date',        planned.session_date,
                              'starts_at',           planned.starts_at,
                              'ends_at',             planned.ends_at,
                              'cancelled_group_ids', to_jsonb(planned.cancelled_group_ids)
                            )
                            ORDER BY planned.session_date, planned.starts_at
                          )
                     FROM public.planned_group_sessions(
                            c.id, c.window_start, c.window_end - 1
                          ) AS planned
                 ), '[]'::jsonb) AS items
        ) pl
    ) s;

  RETURN jsonb_build_object(
    'users',              v_users,
    'certification_queue', v_queue,
    'attention_products', v_attention,
    'schedule_products',  v_schedule
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_dashboard() IS 'The whole admin dashboard in one document: per-role user counts (email-verified and, for gedus, certified — either can be NULL, where the stat has no meaning: certified only means something for an educator, and verified is NULL for a role none of whose accounts holds a real address, which is every gamer unless their parent chose sign-in mode email), the uncertified-gedu queue, live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Each queue candidate also carries contract_accepted_at — when they accepted the current gedu contract, or NULL — which informs the certification decision without gating it; that standing is judged on the version''s BASE, so either equally binding language of the current version counts, and a candidate holding both carries the earlier of the two signatures. Each candidate additionally carries criminal_record_check_at — when an admin recorded seeing their criminal record extract, or NULL — which informs the same decision on the same terms and gates nothing either; the flag beside it is not shipped because the stamp is non-NULL exactly when the flag is true. The waitlist attention item asks whether there is something for an admin to DO rather than what state the product is in: an open seat that already carries a live seat offer is subtracted, so a product whose every open seat has been offered drops out of the queue, and a decline or an expiry raises it again on its own. The count rides in the emitted object as live_offer_count so the page can explain the absence. An unstaffed group with NO active member is named too, in its own empty_groups_without_gedu array beside groups_without_gedu, and can put a product in the queue by itself: an admin pre-building next term has not made a mistake, and that reasoning decides the item''s RANK on the page rather than hiding it. The two arrays are disjoint by construction and neither holds a group somebody is assigned to. Both product sections ask effective_status() and nothing else: there is no stored status to pre-filter on, so the derived answer is the only lifecycle test either candidate set makes, and every date window is computed in the product''s own timezone. Each attention candidate also carries missing_invoice_customer — municipality clubs only, true when the club names no Fennoa invoice customer, and false everywhere else by construction because the CHECK forbids the column on any other product type. It puts a club in the queue on its own, exactly as the municipality fee beside it does: the link is nullable because a club is created before anybody has agreed who pays for it, and by the time it starts both the fee and the buyer are meant to be set, so a club still missing one is an admin omission rather than an ordinary state. The two are the bottom of the page''s ranking and sit together there, because both are a blank field on one form with one consequence — a month of invoices that cannot be written for that buyer. Each schedule product also carries group_ids, every group it has, and planned_sessions, planned_group_sessions over its window [product-local today - 30 days, + 4 months) as {session_date, starts_at, ends_at, cancelled_group_ids} rows, soonest first, so the page places each session at its start instant and can tell a date every group cancelled from one only some did, and holiday_breaks, holiday_breaks_document over the same window (each break of a calendar the product follows, with its name in every locale and the sessions it withdrew). Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';

REVOKE ALL ON FUNCTION public.get_admin_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO service_role;

