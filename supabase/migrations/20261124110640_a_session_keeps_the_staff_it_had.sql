-- A session keeps the staff it had.
--
-- An assignment is a period that ends and stays (owner's rulings, 2026-11-23),
-- and a session belongs to whoever held the group at its start. The database's
-- own predicate already reads it that way; the readers that hand a session's
-- staffing to a person did not:
--
-- 1. The three session documents — the admin product's sessions, the gedu's
--    group feed and the trainee's — handed the client's staffing derivation
--    every assignment row with no bounds, so a gedu taken off a group vanished
--    from every past session card and a replacement appeared on all of them.
--    Each now hands every period the group has had, ended ones included, with
--    started_at and ended_at, and the client places each session in the period
--    containing its start. Who may open each document is unchanged.
-- 2. The admin feedback page attributed every answer to the group's assignment
--    rows as they stand, so a gamer's answer about a past session was credited
--    to today's replacement. Its candidates, and their role, are now the gedus
--    assigned at the session — group_assignments_at at group_session_starts_at,
--    the instant computed once per (group, day).

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
    'delivery_mode', p.delivery_mode,
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

  -- The venue, on in-person and hybrid products — the same test
  -- `get_gedu_group_feed` makes, and for the same reason: an online municipality
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
    AND p.delivery_mode <> 'online';

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

        -- Every assignment period the group has had, ended ones included,
        -- each with its role and its bounds — the first input the session
        -- card's staffing line needs, in the same shape get_gedu_group_feed
        -- emits it, because one card component renders both documents. The
        -- client places each session in the period containing its start, so a
        -- past session keeps the gedu who held the group then.
        'gedus', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',         pr.id,
                   'first_name', pr.first_name,
                   'role',       ga.role,
                   'started_at', ga.started_at,
                   'ended_at',   ga.ended_at
                 ) ORDER BY pr.first_name, ga.started_at, ga.id)
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

COMMENT ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) IS 'One round trip behind the admin product page''s Sessions panel: the product''s schedule parameters, its venue and site notes on an in-person or hybrid product, and every group on it with its standing notes, its register roster and every stored session row with a sparse attendance map and its photos. Admin-only, guard-first on assert_admin. Product-keyed rather than group-keyed because the page shows one product and puts a group selector in front of the feed; asking per group would send the product shell and the site over the wire once per group. Carries the product''s planned sessions beside its schedule parameters, as the gedu feed does: a top-level `planned_sessions` — the plan from start_date to the furthest of the groups'' session_plan_horizon (the product''s own when it has no groups), so every group''s next running session is inside (planned_sessions_document), plain {session_date, starts_at, ends_at} rows with no cancellation folded in, once for every group because the plan is the product''s — a top-level `holiday_breaks`, holiday_breaks_document over the same span (each break of a calendar the product follows, with its name in every locale and the plan rows it withdrew), and on each group its `final_session_date` (group_final_session_date), since each group''s cancellations can move it. A stored session row on a holiday date does not travel, and no group lists a cancellation on one: that date carries its break and nothing else. The SESSION shape is get_gedu_group_feed''s verbatim, because one card component renders both and the two must not disagree about what a session is — which is why `images` ({id, width, height} per photo, ordered by (created_at, id), never the uploader) arrives here in the same shape and needs no versioned name: this document''s reader shares the gedu session''s tolerant schema, and only the strict family one needed get_my_family_product_feed_v2. The ROSTER deliberately is not the gedu feed''s — it carries participant_id and first_name alone, since the only thing this surface does with it is take the register, and the groups panel on the same page already answers who these people are. Each group additionally carries `gedus` (every assignment period the group has had, ended ones included, as {id, first_name, role, started_at, ended_at}, for the client to place each session in the period containing its start) and `substitutions` (every non-withdrawn substitution request on the group), both byte for byte get_gedu_group_feed''s — one card component renders the session cards of both documents, and the staffing line and the Set-a-sub / Clear-sub / Withdraw-request editor are drawn from exactly these two arrays. `reason` and `reason_note` DO travel here: this document is admin-only end to end, and the reason is what the editor shows beside the request.';

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
    'delivery_mode', p.delivery_mode,
    'voice_room_mode', p.voice_room_mode,
    'external_voice_url', p.external_voice_url,
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
               'description', pt.short_description,
               'voice_join_instructions', pt.voice_join_instructions
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

  -- The venue, on in-person and hybrid products. An online municipality club carries a
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
    AND p.delivery_mode <> 'online';

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

  -- The group's STAFF: every assignment period it has had, ended ones
  -- included, each with its role and its bounds. The client's staffing
  -- derivation needs two inputs — who was assigned at the session and in what
  -- role, and the non-withdrawn requests for the date — and this is the first
  -- of them; it places each session in the period containing its start, so a
  -- past session keeps the gedu who held the group then. First name only,
  -- exactly as every other staff list on this surface: a workspace names
  -- colleagues, it does not carry their records.
  SELECT COALESCE(
           jsonb_agg(entry ORDER BY first_name, started_at, period_id),
           '[]'::jsonb
         )
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name,
        'role',       ga.role,
        'started_at', ga.started_at,
        'ended_at',   ga.ended_at
      ) AS entry,
      pr.first_name,
      ga.started_at,
      ga.id AS period_id
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

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS 'One round trip for a group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person and hybrid products, the current roster, and every stored session row with its sparse attendance map and its photos — except a row on a holiday date, which carries its break and nothing else. Carries the product''s planned sessions beside its schedule parameters: `planned_sessions`, the plan from start_date to this group''s session_plan_horizon (planned_sessions_document), so the group''s next running session is inside however many dates ahead of it the group cancelled, as plain {session_date, starts_at, ends_at} rows with no cancellation folded in; `holiday_breaks`, holiday_breaks_document over the same span — each break of a calendar the product follows, with its name in every locale and the plan rows it withdrew; and `final_session_date`, this group''s group_final_session_date — NULL on an open-ended product. `cancellations` lists the cancellations in effect, none on a holiday date. Open to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s page body unchanged: one body fed by one document is what keeps the two surfaces one surface, where a second admin-shaped RPC would have started drifting field by field. An admin passes the ownership half outright; a gedu is shown only their OWN group''s feed, and a customer or a gamer is refused on the first statement, which is what keeps the material link and the three staff notes off every family surface. Each roster row is keyed by participant_id (whoever holds the seat, child or adult), carries both game identities (minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, independent of each other and drawn according to the product''s topic, which this document does not carry), and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox). Each roster row also carries the staff-only flair — group_joined_at (when the seat entered THIS group, as against signed_up_at, which is when it was taken on the product), note and note_updated_by_first_name — in deliberate parity with get_gedu_assigned_product''s roster, which is the parity the page depends on because it renders this copy. Each roster row additionally carries `creations` (always an array, [] when there is no row) — the one roster field that is NOT staff-only, since the member''s own family reads the same list — and the product shell carries requires_gamer_creations, because the final session''s fourth completeness condition is derived on the CLIENT from that flag, the schedule and this roster''s creations; no document carries an "owed" field. Each session row carries report_emailed_at — when its report was mailed to the families, NULL until it was — and never report_emailed_by, which is audit and renders nowhere. Each session row also carries `images`: {id, width, height} per photo, ordered by (created_at, id), with the uploader deliberately off the wire for the same reason the sender is. The key sits directly on the session rather than under a versioned name, because the gedu contracts schema is tolerant of unknown keys. The document carries two more members, both of them inputs to the client-side staffing derivation rather than answers from it: `gedus`, every assignment period the group has had, ended ones included, as {id, first_name, role, started_at, ended_at}, so the client places each session in the period containing its start and a past session keeps the gedu who held the group then; and `substitutions`, every NON-WITHDRAWN substitution request on the group, unbounded, in the one shape substitution_request_document defines and every substitution write returns. Withdrawn is the one status that does not travel, because it changes nothing about who is expected. The client merges substitutions onto its entries by date, and a projected date with no session row carries its requests like any other. `reason` and `reason_note` ride for an ADMIN caller only — this document is served to an admin too, so the flag is the CALLER''s role rather than a property of the RPC, which is what keeps a `sick` category off a colleague''s screen while the one document stays one document. `offer_count` rides for an admin and for the requester themselves. The GATE is gedu_teaches_group, which admits a live substitution on the group, so a sub opens the workspace they are substituting. It is the ONE caller that asks substitution_request_document to reveal the requester explicitly. The workspace is reached only by staff on the group and its session card''s staffing line names who is away; the REASON rides on the admin flag alone, so a colleague learns that somebody is absent and never that it was `sick`. `trainees` names the group''s trainee seats as {id, first_name} in placement order, drawn as Trainee-marked chips after the group''s gedus on every workspace shell; a trainee is not in `gedus`, and a trainee cannot read this document — gedu_teaches_group has no trainee arm, and their own read is get_trainee_group_feed.';

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
  v_today := (now() AT TIME ZONE v_timezone)::date;

  -- The shell, the material link included: a trainee prepares from the same
  -- material the session is run from.
  SELECT jsonb_build_object(
    'id',                       p.id,
    'product_type',             p.product_type,
    'timezone',                 p.timezone,
    'start_date',               p.start_date,
    'end_date',                 p.end_date,
    'delivery_mode',            p.delivery_mode,
    'voice_room_mode',          p.voice_room_mode,
    'external_voice_url',       p.external_voice_url,
    'material_url',             psd.material_url,
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description,
               'voice_join_instructions', pt.voice_join_instructions
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

  -- The venue on in-person and hybrid products, without its staff note.
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
    AND p.delivery_mode <> 'online';

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

  -- Every assignment period the group has had, ended ones included, as the
  -- gedu document names them.
  SELECT COALESCE(
           jsonb_agg(entry ORDER BY first_name, started_at, period_id),
           '[]'::jsonb
         )
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name,
        'role',       ga.role,
        'started_at', ga.started_at,
        'ended_at',   ga.ended_at
      ) AS entry,
      pr.first_name,
      ga.started_at,
      ga.id AS period_id
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

COMMENT ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) IS 'The trainee''s group workspace: the same document get_gedu_group_feed serves, with everything a trainee may not see ABSENT from the wire rather than blanked, so the same page body renders it. A trainee sees what a gamer on the group sees, plus the material link and the roster. Guard-first on assert_role (an admin or a gedu), then gedu_trains_group as a second 42501; an admin passes outright, to preview the trainee''s view. Carries: the product shell with material_url; the group''s public note (never gedu_note); the site''s name, address and public note (never gedu_note); a roster row per active seat with participant_id, first_name, signed_up_at, group_joined_at, an integer `age` (never the birth year or month), gender, both game identities, `has_note` (whether a staff note exists, never its text or editor) and `creations` always []; no parent_email or participant_email. Every stored session a family is shown — a record kept under a cancellation does not travel — with report, report_emailed_at, updated_by and updated_by_first_name, images, and `attendance` always {}; never gedu_note, created_at, created_by or updated_at. `gedus` as get_gedu_group_feed carries them — every assignment period, ended ones included, as {id, first_name, role, started_at, ended_at}; `substitutions` always []; `cancellations` in session_cancellation_document''s shape with the admin-only detail null, none on a holiday date; `trainees` as {id, first_name}; `planned_sessions`, `holiday_breaks` and `final_session_date` as get_gedu_group_feed carries them. Photo-consent answers are not on it and the trainee cannot read them elsewhere: their read policy asks gedu_teaches_gamer, which has no trainee arm.';

-- ---------------------------------------------------------------------------
-- get_admin_session_feedback
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_session_feedback(p_from date, p_to date, p_window_before_minutes integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.assert_admin();

  IF p_from IS NULL OR p_to IS NULL OR p_window_before_minutes IS NULL THEN
    RAISE EXCEPTION 'A range and a window are required' USING ERRCODE = '22004';
  END IF;

  IF p_from > p_to THEN
    RAISE EXCEPTION 'The range ends before it starts' USING ERRCODE = '22023';
  END IF;

  WITH
  -- Every non-empty gamer answer whose session day falls in the range. The
  -- opening instant is first narrowed by a two-day slack around the range,
  -- which no timezone offset can exceed, so the exact day is computed only for
  -- rows that can match. Seat state is deliberately not consulted: a gamer who
  -- has since left the group still answered about a session they were in.
  answered AS (
    SELECT sf.group_id,
           sf.participant_id,
           sf.answers,
           sf.note,
           sf.updated_at,
           ((sf.session_opens_at + make_interval(mins => p_window_before_minutes))
              AT TIME ZONE p.timezone)::date AS session_date
      FROM public.session_feedback sf
      JOIN public.product_groups g ON g.id = sf.group_id
      JOIN public.products p       ON p.id = g.product_id
      JOIN public.profiles pr      ON pr.id = sf.participant_id
     WHERE pr.role = 'gamer'::public.user_role
       -- A note of nothing but whitespace (newlines and tabs too, as the
       -- client's trim() reads it) is blank.
       AND NOT (sf.answers = '{}'::jsonb AND sf.note ~ '^\s*$')
       AND sf.session_opens_at >= (p_from::timestamp AT TIME ZONE 'UTC') - interval '2 days'
       AND sf.session_opens_at <  (p_to::timestamp   AT TIME ZONE 'UTC') + interval '3 days'
  ),
  responses_in_range AS (
    SELECT * FROM answered a WHERE a.session_date BETWEEN p_from AND p_to
  ),
  -- Every recorded session of a product with a voice room, online or hybrid,
  -- in the range, with how many
  -- gamers were marked present. A cancelled session is left out: it is not a
  -- session anybody could have answered about.
  sessions_in_range AS (
    SELECT s.group_id,
           s.session_date,
           (SELECT count(*)
              FROM public.session_attendance sa
              JOIN public.profiles pr ON pr.id = sa.participant_id
             WHERE sa.session_id = s.id
               AND sa.status = 'present'
               AND pr.role = 'gamer'::public.user_role) AS eligible_count
      FROM public.group_sessions s
      JOIN public.product_groups g ON g.id = s.group_id
      JOIN public.products p       ON p.id = g.product_id
     WHERE p.delivery_mode IN ('online', 'hybrid')
       AND s.session_date BETWEEN p_from AND p_to
       AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
  ),
  session_keys AS (
    SELECT group_id, session_date FROM responses_in_range
    UNION
    SELECT group_id, session_date FROM sessions_in_range
  ),
  -- Each (group, day)'s session start instant, computed once per key: the
  -- instant a session is placed in an assignment period by.
  key_instants AS MATERIALIZED (
    SELECT k.group_id,
           k.session_date,
           public.group_session_starts_at(k.group_id, k.session_date) AS starts_at
      FROM session_keys k
  ),
  -- The candidates who can be expected at (group, day): the gedus assigned to
  -- the group at that session, each with that period's role, and the
  -- substitutes seated on that day who are not also assigned at it. The
  -- predicate decides which of them are expected.
  key_gedus AS (
    SELECT k.group_id,
           k.session_date,
           jsonb_agg(
             jsonb_build_object(
               'id',   gp.id,
               'name', concat_ws(' ', gp.first_name, NULLIF(gp.last_name, '')),
               'role', c.role
             )
             ORDER BY CASE c.role WHEN 'primary' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END,
                      gp.first_name, gp.last_name, gp.id
           ) AS gedus
      FROM key_instants k
      CROSS JOIN LATERAL (
        SELECT held.gedu_id, held.role::text AS role
          FROM public.group_assignments_at(k.group_id, k.starts_at) held
        UNION
        SELECT r.substitute_id, 'substitute'
          FROM public.session_substitution_requests r
         WHERE r.group_id     = k.group_id
           AND r.session_date = k.session_date
           AND r.status       = 'substituted'::public.substitution_request_status
           AND NOT EXISTS (
                 SELECT 1
                   FROM public.group_assignments_at(k.group_id, k.starts_at) held
                  WHERE held.gedu_id = r.substitute_id
               )
      ) c
      JOIN public.profiles gp ON gp.id = c.gedu_id
     WHERE public.gedu_is_expected_at_session(c.gedu_id, k.group_id, k.session_date)
     GROUP BY k.group_id, k.session_date
  ),
  -- The group and product every entry names. The product's name is per
  -- locale, so every translation travels and the reader picks one.
  group_refs AS (
    SELECT g.id AS group_id,
           jsonb_build_object(
             'groupId',     g.id,
             'groupName',   g.name,
             'productId',   p.id,
             'productType', p.product_type,
             'deliveryMode', p.delivery_mode,
             'productTranslations', COALESCE((
               SELECT jsonb_agg(
                        jsonb_build_object('locale', pt.locale, 'name', pt.name)
                        ORDER BY pt.locale
                      )
                 FROM public.product_translations pt
                WHERE pt.product_id = p.id
             ), '[]'::jsonb)
           ) AS ref
      FROM public.product_groups g
      JOIN public.products p ON p.id = g.product_id
     WHERE g.id IN (SELECT group_id FROM session_keys)
  )
  SELECT jsonb_build_object(
    'responses', COALESCE((
      SELECT jsonb_agg(
               gr.ref || jsonb_build_object(
                 'source',      'gamer_online',
                 'sessionDate', r.session_date,
                 'respondent',  jsonb_build_object(
                   'id',   pr.id,
                   'name', concat_ws(' ', pr.first_name, NULLIF(pr.last_name, ''))
                 ),
                 'gedus',       COALESCE(kg.gedus, '[]'::jsonb),
                 'answers',     r.answers,
                 'note',        r.note,
                 -- The response rate is "of the gamers marked present, how
                 -- many answered", so only an answer from a gamer the session's
                 -- register marks present counts toward it, and a cancelled
                 -- session has no register, exactly as the sessions list reads it.
                 -- The session must be one sessions_in_range counts — an online
                 -- or hybrid product's — so the numerator is never outside the
                 -- denominator.
                 'countsTowardRate', EXISTS (
                   SELECT 1
                     FROM public.group_sessions s
                     JOIN public.session_attendance sa ON sa.session_id = s.id
                     JOIN public.product_groups sg     ON sg.id = s.group_id
                     JOIN public.products sp           ON sp.id = sg.product_id
                    WHERE sp.delivery_mode IN ('online', 'hybrid')
                      AND s.group_id        = r.group_id
                      AND s.session_date    = r.session_date
                      AND sa.participant_id = r.participant_id
                      AND sa.status         = 'present'
                      AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
                 ),
                 'submittedAt', r.updated_at
               )
               ORDER BY r.session_date, r.group_id, r.updated_at, r.participant_id
             )
        FROM responses_in_range r
        JOIN group_refs gr      ON gr.group_id = r.group_id
        JOIN public.profiles pr ON pr.id = r.participant_id
        LEFT JOIN key_gedus kg  ON kg.group_id = r.group_id AND kg.session_date = r.session_date
    ), '[]'::jsonb),
    'sessions', COALESCE((
      SELECT jsonb_agg(
               gr.ref || jsonb_build_object(
                 'source',        'gamer_online',
                 'sessionDate',   s.session_date,
                 'eligibleCount', s.eligible_count,
                 'gedus',         COALESCE(kg.gedus, '[]'::jsonb)
               )
               ORDER BY s.session_date, s.group_id
             )
        FROM sessions_in_range s
        JOIN group_refs gr     ON gr.group_id = s.group_id
        LEFT JOIN key_gedus kg ON kg.group_id = s.group_id AND kg.session_date = s.session_date
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$_$;

COMMENT ON FUNCTION public.get_admin_session_feedback(p_from date, p_to date, p_window_before_minutes integer) IS 'The admin feedback page''s whole read: every gamer''s feedback answer whose session day falls in [p_from, p_to], and every recorded session of an online or hybrid product in that range as the response rate''s denominator. Admin-only, guard-first on assert_admin; it crosses the boundary that session_feedback''s policies draw around each child''s own row. A row''s session day is its opening instant shifted forward by p_window_before_minutes, read in its product''s timezone — the caller passes the voice window constant so the number has one home. RESPONSES are gamers'' rows only, never an empty one (no answer and a blank note), and never filtered by whether the gamer still holds a seat: history is the point. Each carries its group and product, the respondent''s id and full name, every gedu expected at that (group, day) as decided by gedu_is_expected_at_session over the gedus assigned to the group at that session — group_assignments_at at group_session_starts_at, the instant computed once per (group, day) — and the day''s seated substitutes (an assigned gedu keeps the role of the period containing the session, so a past session stays attributed to whoever held the group then and never to a later replacement; a substitute is ''substitute''), the stored answers verbatim with retired keys included, the note, the last save as submittedAt, and countsTowardRate: true exactly when a non-cancelled group_sessions row exists for that (group, day) and its session_attendance marks the respondent present, so the response rate reads "of the gamers marked present, how many answered" and can never pass 100%. SESSIONS are group_sessions rows on online and hybrid products, the ones with a voice room, in the range, cancelled ones left out, each with the count of gamers marked present and the same expected gedus; a session nobody was marked present at still travels. A response whose session has no recorded row travels without a partner in sessions. Every entry carries all of its product''s name translations, and the reader picks one by locale. Keys are camelCase in the shape the page''s contract parses.';
