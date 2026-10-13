-- The session documents carry the plan.
--
-- Every document a session list is drawn from — the gedu and trainee group
-- workspaces, the admin product's Sessions panel, the family product page and
-- the gedu and trainee product doors — carried the product's schedule
-- parameters and left the client to walk them into dates. Each now also
-- carries the walked dates themselves, from the database's one expansion of
-- the plan, so the client can stop walking. Nothing is taken away: the
-- schedule parameters still travel, and no reader changes in this migration.
--
-- WHAT THIS CHANGES
--
-- 1. planned_sessions_document(product, to) — the product's planned sessions
--    from its start_date to `to`, as the JSON array every document carries.
-- 2. Each document gains `planned_sessions`. Its span ends at the product's
--    session_plan_horizon: end_date on a dated product, the eighth unfinished
--    session the group has not cancelled on an open-ended one. Every
--    group-scoped document asks the horizon for its own group, so the group's
--    next running session is inside however many dates ahead of it are
--    cancelled; the admin document, one plan for every group, reads to the
--    furthest of its groups' horizons. The family document also raises its
--    horizon to the date a cancelled membership is paid through, so a family's
--    plan reaches the last session they may attend.
-- 3. The group-scoped documents gain `final_session_date`
--    (group_final_session_date): on the workspaces and the product doors at
--    the top level, for the document's group; on the admin document on each
--    group.
--
-- Cancellations are not folded into the planned rows. The documents keep
-- their own cancellation lists, which also carry cancellations over kept
-- records the plan no longer has and, for an admin, the reason.

-- ---------------------------------------------------------------------------
-- 1. The plan as a document member
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.planned_sessions_document(p_product_id uuid, p_to date) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'session_date', planned.session_date,
               'starts_at',    planned.starts_at,
               'ends_at',      planned.ends_at
             )
             ORDER BY planned.session_date, planned.starts_at
           ),
           '[]'::jsonb
         )
    FROM public.products p
   CROSS JOIN LATERAL public.planned_session_dates(p.id, p.start_date, p_to) AS planned
   WHERE p.id = p_product_id;
$$;

COMMENT ON FUNCTION public.planned_sessions_document(p_product_id uuid, p_to date) IS 'A product''s planned sessions from its start_date to p_to (planned_session_dates), as the `planned_sessions` member every session document carries: a JSON array of {session_date, starts_at, ends_at}, soonest first, and [] when the span plans nothing — including when p_to is NULL, which session_plan_horizon answers only for a product that does not exist. Plain plan rows: cancellations are not folded in. Service role only; the documents that call it are SECURITY DEFINER.';

REVOKE ALL ON FUNCTION public.planned_sessions_document(p_product_id uuid, p_to date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planned_sessions_document(p_product_id uuid, p_to date) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. get_gedu_group_feed
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
  -- learns that the session is off and nothing about why.
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
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date);

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
    'planned_sessions', public.planned_sessions_document(
                          v_product_id, public.session_plan_horizon(v_product_id, p_group_id)
                        ),
    -- The run's last session the group has not cancelled, NULL on an
    -- open-ended product: the session that owes creations.
    'final_session_date', public.group_final_session_date(p_group_id)
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS 'One round trip for a group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map and its photos. Carries the product''s planned sessions beside its schedule parameters: `planned_sessions`, the plan from start_date to this group''s session_plan_horizon (planned_sessions_document), so the group''s next running session is inside however many dates ahead of it the group cancelled, as plain {session_date, starts_at, ends_at} rows with no cancellation folded in, and `final_session_date`, this group''s group_final_session_date — NULL on an open-ended product. Open to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s page body unchanged: one body fed by one document is what keeps the two surfaces one surface, where a second admin-shaped RPC would have started drifting field by field. An admin passes the ownership half outright; a gedu is shown only their OWN group''s feed, and a customer or a gamer is refused on the first statement, which is what keeps the material link and the three staff notes off every family surface. Each roster row is keyed by participant_id (whoever holds the seat, child or adult), carries both game identities (minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, independent of each other and drawn according to the product''s topic, which this document does not carry), and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox). Each roster row also carries the staff-only flair — group_joined_at (when the seat entered THIS group, as against signed_up_at, which is when it was taken on the product), note and note_updated_by_first_name — in deliberate parity with get_gedu_assigned_product''s roster, which is the parity the page depends on because it renders this copy. Each roster row additionally carries `creations` (always an array, [] when there is no row) — the one roster field that is NOT staff-only, since the member''s own family reads the same list — and the product shell carries requires_gamer_creations, because the final session''s fourth completeness condition is derived on the CLIENT from that flag, the schedule and this roster''s creations; no document carries an "owed" field. Each session row carries report_emailed_at — when its report was mailed to the families, NULL until it was — and never report_emailed_by, which is audit and renders nowhere. Each session row also carries `images`: {id, width, height} per photo, ordered by (created_at, id), with the uploader deliberately off the wire for the same reason the sender is. The key sits directly on the session rather than under a versioned name, because the gedu contracts schema is tolerant of unknown keys. The document carries two more members, both of them inputs to the client-side staffing derivation rather than answers from it: `gedus`, the group''s assignments as {id, first_name, role}; and `substitutions`, every NON-WITHDRAWN substitution request on the group, unbounded, in the one shape substitution_request_document defines and every substitution write returns. Withdrawn is the one status that does not travel, because it changes nothing about who is expected. The client merges substitutions onto its entries by date, and a projected date with no session row carries its requests like any other. `reason` and `reason_note` ride for an ADMIN caller only — this document is served to an admin too, so the flag is the CALLER''s role rather than a property of the RPC, which is what keeps a `sick` category off a colleague''s screen while the one document stays one document. `offer_count` rides for an admin and for the requester themselves. The GATE is gedu_teaches_group, which admits a live substitution on the group, so a sub opens the workspace they are substituting. It is the ONE caller that asks substitution_request_document to reveal the requester explicitly. The workspace is reached only by staff on the group and its session card''s staffing line names who is away; the REASON rides on the admin flag alone, so a colleague learns that somebody is absent and never that it was `sick`. `trainees` names the group''s trainee seats as {id, first_name} in placement order, drawn as Trainee-marked chips after the group''s gedus on every workspace shell; a trainee is not in `gedus`, and a trainee cannot read this document — gedu_teaches_group has no trainee arm, and their own read is get_trainee_group_feed.';

REVOKE ALL ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. get_trainee_group_feed
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

  SELECT g.product_id, p.timezone
    INTO v_product_id, v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

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
  -- detail left null: that a session is off, never why.
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
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date);

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
    -- schedule is no secret from anyone on the group.
    'planned_sessions', public.planned_sessions_document(
                          v_product_id, public.session_plan_horizon(v_product_id, p_group_id)
                        ),
    'final_session_date', public.group_final_session_date(p_group_id)
  );
END;
$$;

COMMENT ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) IS 'The trainee''s group workspace: the same document get_gedu_group_feed serves, with everything a trainee may not see ABSENT from the wire rather than blanked, so the same page body renders it. A trainee sees what a gamer on the group sees, plus the material link and the roster. Guard-first on assert_role (an admin or a gedu), then gedu_trains_group as a second 42501; an admin passes outright, to preview the trainee''s view. Carries: the product shell with material_url; the group''s public note (never gedu_note); the site''s name, address and public note (never gedu_note); a roster row per active seat with participant_id, first_name, signed_up_at, group_joined_at, an integer `age` (never the birth year or month), gender, both game identities, `has_note` (whether a staff note exists, never its text or editor) and `creations` always []; no parent_email or participant_email. Every stored session a family is shown — a record kept under a cancellation does not travel — with report, report_emailed_at, updated_by and updated_by_first_name, images, and `attendance` always {}; never gedu_note, created_at, created_by or updated_at. `gedus` as {id, first_name, role}; `substitutions` always []; `cancellations` in session_cancellation_document''s shape with the admin-only detail null; `trainees` as {id, first_name}; `planned_sessions` and `final_session_date` as get_gedu_group_feed carries them. Photo-consent answers are not on it and the trainee cannot read them elsewhere: their read policy asks gedu_teaches_gamer, which has no trainee arm.';

REVOKE ALL ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. get_admin_product_sessions
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
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

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
        -- still restore it, and an inert one is never surfaced.
        'cancellations', COALESCE((
          SELECT jsonb_agg(
                   public.session_cancellation_document(sc, true)
                   ORDER BY sc.session_date DESC
                 )
            FROM public.session_cancellations sc
           WHERE sc.group_id = g.id
             AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
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
    -- It reads to the furthest of the groups' own horizons, so every group's
    -- next running session is inside; a product with no groups reads to the
    -- product's horizon.
    'planned_sessions', public.planned_sessions_document(
                          p_product_id,
                          COALESCE(
                            (SELECT max(public.session_plan_horizon(p_product_id, g.id))
                               FROM public.product_groups g
                              WHERE g.product_id = p_product_id),
                            public.session_plan_horizon(p_product_id)
                          )
                        )
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) IS 'One round trip behind the admin product page''s Sessions panel: the product''s schedule parameters, its venue and site notes on an in-person product, and every group on it with its standing notes, its register roster and every stored session row with a sparse attendance map and its photos. Admin-only, guard-first on assert_admin. Product-keyed rather than group-keyed because the page shows one product and puts a group selector in front of the feed; asking per group would send the product shell and the site over the wire once per group. Carries the product''s planned sessions beside its schedule parameters, as the gedu feed does: a top-level `planned_sessions` — the plan from start_date to the furthest of the groups'' session_plan_horizon (the product''s own when it has no groups), so every group''s next running session is inside (planned_sessions_document), plain {session_date, starts_at, ends_at} rows with no cancellation folded in, once for every group because the plan is the product''s — and on each group its `final_session_date` (group_final_session_date), since each group''s cancellations can move it. The SESSION shape is get_gedu_group_feed''s verbatim, because one card component renders both and the two must not disagree about what a session is — which is why `images` ({id, width, height} per photo, ordered by (created_at, id), never the uploader) arrives here in the same shape and needs no versioned name: this document''s reader shares the gedu session''s tolerant schema, and only the strict family one needed get_my_family_product_feed_v2. The ROSTER deliberately is not the gedu feed''s — it carries participant_id and first_name alone, since the only thing this surface does with it is take the register, and the groups panel on the same page already answers who these people are. Each group additionally carries `gedus` ({id, first_name, role}) and `substitutions` (every non-withdrawn substitution request on the group), both byte for byte get_gedu_group_feed''s — one card component renders the session cards of both documents, and the staffing line and the Set-a-sub / Clear-sub / Withdraw-request editor are drawn from exactly these two arrays. `reason` and `reason_note` DO travel here: this document is admin-only end to end, and the reason is what the editor shows beside the request.';

REVOKE ALL ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. get_my_family_product_feed
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
  -- simply stops being shown rather than showing the report.
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
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date);

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
    'planned_sessions', public.planned_sessions_document(
                          v_product_id,
                          public.session_plan_horizon(v_product_id, v_group_id, v_paid_through)
                        )
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) IS 'One round trip for a family club/camp/event page, scoped to ONE participation: the product shell, the group name and its family-facing note, the venue on in-person products, the teaching gedus'' first names, the group''s full stored session history with reports and PHOTOS, the named participant''s own attendance marks, and that participant''s own creations. Each session carries updated_by and the last editor''s first name — last editor of the SESSION, not author of the report: an attendance mark or a staff-note edit moves it. The name travels per session because a past session''s editor may no longer teach the group. Each session also carries `images`: {id, width, height} per photo, ordered by (created_at, id), the same shape the gedu and admin documents carry because one shared gallery renders all three, and never the uploader, which is safeguarding audit. That key rides on this strict family document under no versioned twin of its own, on the severity paragraph in docs/plans/CLAUDE.md: transient read-side breakage inside a release window is accepted. `creations` is a TOP-LEVEL array of {title, url} — this participant''s own, in this group, and structurally incapable of holding anybody else''s because it is not a map keyed by participant. It is the one staff-authored family-facing field that carries links, an owner-approved exception to the link-free rule session reports follow, and the render side parses each URL and degrades to the title as plain text when it is not http(s). Empty array when there is nothing, so the card renders on emptiness and never on null. `planned_sessions` is the product''s plan from start_date to session_plan_horizon for this group (planned_sessions_document), raised to the product-local date a `canceling` subscription''s current_period_end falls on — the paid-through instant the page clamps the list at — as plain {session_date, starts_at, ends_at} rows; the cancellations stay their own list. Self-scoping — the caller must be the participation''s participant (a child, or a parent holding a seat of their own) or a parent linked to them; an unplaced participation has no page and answers P0002; a row that does not exist and a row belonging to another family are refused identically, so it cannot be used as an oracle for enrollment ids. Carries no gedu note of any scope, no roster, no other participant''s marks or creations, no parent email, no material link, no requires_gamer_creations flag and no owed/completeness state.';

REVOKE ALL ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. get_gedu_assigned_product
-- ---------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
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

  -- This RPC is the door to the whole workspace, so its gate and its "which
  -- group is mine" resolution are ONE question and are answered together. A
  -- substitution has no assignment row to resolve a group from, which is why the
  -- resolution had to be widened alongside the gate rather than only the gate.
  IF p_group_id IS NOT NULL THEN
    -- An explicit group: the substitution card's link carries one, so a gedu substituting
    -- a SIBLING group of a product they already teach lands in the right
    -- workspace instead of their own group's. It must belong to this product
    -- and be one the caller is assigned to or substitutes on — gedu_teaches_group is
    -- exactly that pair of questions since this migration.
    SELECT g.id
      INTO v_my_group_id
      FROM product_groups g
     WHERE g.id         = p_group_id
       AND g.product_id = p_product_id
       AND public.gedu_teaches_group(g.id);
  ELSE
    SELECT group_id
      INTO v_my_group_id
      FROM gedu_group_assignments
     WHERE product_id = p_product_id
       AND gedu_id    = v_caller_id
     LIMIT 1;

    -- No assignment on this product: a pure substitution. Resolve the substituted group,
    -- deterministically ordered so two live substitutions on one product answer the
    -- same way every call. (The card always sends p_group_id, so this arm is
    -- the fallback for a bare link rather than the normal path.)
    IF v_my_group_id IS NULL THEN
      SELECT g.id
        INTO v_my_group_id
        FROM product_groups g
       WHERE g.product_id = p_product_id
         AND public.gedu_substitutes_group(g.id)
       ORDER BY g.created_at, g.id
       LIMIT 1;
    END IF;
  END IF;

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    -- Which game identity this product's surfaces are about, if any. The enum
    -- travels as its text value; the mapping from a topic to a platform is a
    -- client-side decision (minecraft_java -> Minecraft, roblox_studio ->
    -- Roblox, everything else -> no game identity), deliberately not encoded
    -- here: a topic gaining or losing a platform is a product decision, not a
    -- schema change.
    'topic',        p.topic,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- In shell parity with get_gedu_group_feed's, for the same reason the
    -- rosters are in parity: the page composes both documents.
    'requires_gamer_creations', p.requires_gamer_creations,
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
        -- Every active seat on the group, whoever holds it — named for the
        -- participant rather than for a gamer, because an adult parent can hold
        -- one and a gamer-shaped name would be a lie the badge repeats on screen.
        'participant_count',   (
          SELECT COUNT(*)::INTEGER
            FROM participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'
        ),
        -- Each educator now carries their assignment ROLE — primary or
        -- assistant. Every read that LISTS a group's staff carries it, because
        -- "who is on this group" and "in what capacity" are one answer, and the
        -- role is a pay CLASS rather than a figure.
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'role',       ga.role
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
                         'participant_id',     part.participant_id,
                         'first_name',         gmp.first_name,
                         'birth_year',         gprof.birth_year,
                         'birth_month',        gprof.birth_month,
                         'gender',             gprof.gender,
                         'minecraft_username', mca.minecraft_username,
                         'minecraft_uuid',     mca.minecraft_uuid,
                         'roblox_username',    rba.roblox_username,
                         'roblox_user_id',     rba.roblox_user_id,
                         'parent_email',       (
                           SELECT pp.email
                             FROM parent_gamer pgm
                             JOIN profiles pp ON pp.id = pgm.parent_id
                            WHERE pgm.gamer_id = part.participant_id
                            ORDER BY pgm.created_at ASC NULLS LAST,
                                     pgm.id           ASC
                            LIMIT 1
                         ),
                         -- Shape parity with get_gedu_group_feed, which is the
                         -- copy every rendered roster actually comes from. Kept
                         -- deliberately rather than left out: one roster shape
                         -- with two definitions is how the two drift, and the
                         -- next reader would delete the wrong one. Do not
                         -- remove this as unused. The role check keeps it in
                         -- step with the feed: an id transposition yields NULL
                         -- rather than a gamer's synthetic handle.
                         'participant_email',
                           CASE WHEN part.participant_id = part.customer_id
                                 AND gmp.role = 'customer'
                                THEN gmp.email END,
                         -- The staff-only flair. Emitted for every roster row,
                         -- note or no note, stamp or no stamp. The
                         -- join stamp is a FACT and the clubs-only newcomer
                         -- rule is a PRESENTATION rule applied client-side, so
                         -- nothing here is nulled out by product type.
                         'group_joined_at',            part.group_joined_at,
                         'note',                       gn.note,
                         'note_updated_by_first_name', ned.first_name,
                         -- In parity with the feed's roster. Always an array,
                         -- never null.
                         'creations',                  COALESCE(gc.creations, '[]'::jsonb)
                       )
                       ORDER BY gmp.first_name
                     )
                FROM participations part
                JOIN profiles gmp              ON gmp.id        = part.participant_id
                LEFT JOIN gamer_profiles gprof  ON gprof.user_id = part.participant_id
                LEFT JOIN minecraft_accounts mca ON mca.user_id  = part.participant_id
                LEFT JOIN roblox_accounts rba    ON rba.user_id   = part.participant_id
                -- Keyed on exactly (group_id, participant_id), so this cannot
                -- fan the row out; profiles.id behind it is a primary key.
                LEFT JOIN public.gamer_group_notes gn
                       ON gn.group_id       = part.group_id
                      AND gn.participant_id = part.participant_id
                LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
                -- Same key, same guarantee.
                LEFT JOIN public.gamer_group_creations gc
                       ON gc.group_id       = part.group_id
                      AND gc.participant_id = part.participant_id
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
    'groups',      v_groups,
    -- The plan to the caller's group's horizon and its final session, in parity with
    -- get_gedu_group_feed's, for the reason the shell and the roster are in
    -- parity: the page composes both documents.
    'planned_sessions', public.planned_sessions_document(
                          p_product_id, public.session_plan_horizon(p_product_id, v_my_group_id)
                        ),
    'final_session_date', public.group_final_session_date(v_my_group_id)
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid) IS 'One round trip for a gedu opening a product they have a seat on: the product shell, which group is theirs, and every group on the product with its participant_count and gedus. The roster rides only on the caller''s own group and is keyed by participant_id — the same shape get_gedu_group_feed serves, kept in parity on purpose even though the rendered roster always comes from the feed''s fresher copy. The shell carries the product''s topic (which decides whether a game identity is shown at all, and which one) and each roster entry carries roblox_username/roblox_user_id beside the Minecraft pair. Each roster entry also carries the staff-only flair — group_joined_at, note and note_updated_by_first_name — emitted unconditionally, because the join stamp is a fact and the clubs-only newcomer rule is applied by the client. Each roster entry carries `creations` too (always an array, [] when there is no row) and the shell carries requires_gamer_creations, both in parity with get_gedu_group_feed for the same reason every other field is: the page composes both documents. THIS IS THE DOOR A SUBSTITUTION COMES THROUGH, and both halves of it are widened rather than only the gate: p_group_id is optional and, when given, must name a group of this product that the caller is assigned to or substitutes on — which is what lets a gedu substituting a SIBLING group of a product they already teach land in the right workspace instead of their own group''s. Without it the assignment group is resolved, and a caller with no assignment on the product falls back to their substituted group, deterministically ordered. A caller with neither is refused with 42501. Each entry of `gedus` additionally carries the assignment `role`. The document also carries `planned_sessions`, read to the resolved group''s session_plan_horizon, and that group''s `final_session_date`, in parity with get_gedu_group_feed.';

REVOKE ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. get_trainee_assigned_product
-- ---------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_my_group_id uuid;
  v_timezone    text;
  v_today       date;
  v_product     jsonb;
  v_groups      jsonb;
BEGIN
  PERFORM public.assert_role('gedu');

  -- The caller's trainee group on this product. There is at most one (the
  -- table is UNIQUE on gedu and product), so a named group only has to agree
  -- with it.
  SELECT t.group_id
    INTO v_my_group_id
    FROM public.gedu_group_trainees t
   WHERE t.product_id = p_product_id
     AND t.gedu_id    = (SELECT auth.uid())
     AND (p_group_id IS NULL OR t.group_id = p_group_id);

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',                       p.id,
    'product_type',             p.product_type,
    'topic',                    p.topic,
    'timezone',                 p.timezone,
    'start_date',               p.start_date,
    'end_date',                 p.end_date,
    'is_remote',                p.is_remote,
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ))
        FROM public.product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  ), p.timezone
  INTO v_product, v_timezone
  FROM public.products p
  WHERE p.id = p_product_id;

  v_today := (now() AT TIME ZONE COALESCE(v_timezone, 'UTC'))::date;

  -- Every group of the product, ordered as get_gedu_assigned_product orders
  -- them. A sibling group is shown by name only, so the trainee can see it
  -- exists (its voice room, locked): its size, its staff and its members are
  -- nothing a gamer on this group is shown. The caller's own group carries the
  -- rest, and its roster is the trainee workspace document's, row for row.
  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT CASE WHEN pg.id <> v_my_group_id THEN
        jsonb_build_object(
          'id',          pg.id,
          'name',        pg.name,
          'created_at',  pg.created_at,
          'is_my_group', false
        )
      ELSE jsonb_build_object(
        'id',          pg.id,
        'name',        pg.name,
        'created_at',  pg.created_at,
        'is_my_group', true,
        'participant_count', (
          SELECT COUNT(*)::integer
            FROM public.participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'::public.participation_status
        ),
        'gedus', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',         gp.id,
                   'first_name', gp.first_name,
                   'role',       ga.role
                 ) ORDER BY gp.first_name)
            FROM public.gedu_group_assignments ga
            JOIN public.profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
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
                   'has_note',           (gn.participant_id IS NOT NULL),
                   'creations',          '[]'::jsonb
                 ) ORDER BY gmp.first_name)
            FROM public.participations part
            JOIN public.profiles gmp                ON gmp.id        = part.participant_id
            LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
            LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
            LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = part.group_id
                  AND gn.participant_id = part.participant_id
           WHERE part.group_id = pg.id
             AND part.status   = 'active'::public.participation_status
        ), '[]'::jsonb)
      ) END AS g
        FROM public.product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups,
    -- As get_gedu_assigned_product carries them, for the trainee's own group.
    'planned_sessions', public.planned_sessions_document(
                          p_product_id, public.session_plan_horizon(p_product_id, v_my_group_id)
                        ),
    'final_session_date', public.group_final_session_date(v_my_group_id)
  );
END;
$$;

COMMENT ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) IS 'The trainee''s door to a product: get_gedu_assigned_product''s document for a gedu holding a TRAINEE seat on it, refused with 42501 otherwise (gedu-only on its first statement). p_group_id is optional and, when given, must be the caller''s trainee group. The shell is the gedu one''s (topic included). `groups` holds every group of the product, ordered by created_at then id. A sibling group carries {id, name, created_at, is_my_group: false} and nothing else — its name is shown so the trainee can see it exists, but its size, staff and members are nothing a gamer on this group is shown. The caller''s own group carries is_my_group true, participant_count, `gedus` as {id, first_name, role}, and the same redacted roster get_trainee_group_feed serves: an integer `age` instead of the birth year and month, `has_note` instead of the note, `creations` always [], and no contact address. It also carries `planned_sessions`, read to the trainee group''s session_plan_horizon, and that group''s `final_session_date`, as get_gedu_assigned_product does.';

REVOKE ALL ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) TO service_role;

