-- Every join surface reads the voice room.
--
-- An online product now picks how its sessions are joined: the Sogverse room,
-- a link to a meeting elsewhere, or no room and join instructions written per
-- locale. Every read that draws a Join button hands its reader the product's
-- shell, and the shell now carries the choice: voice_room_mode and
-- external_voice_url beside is_remote, and voice_join_instructions on each
-- translation beside its name. Every version is returned and none is picked;
-- the app picks the reader's locale with resolveTranslation(), as it does the
-- name.
--
-- The family enrolment cards read products straight through PostgREST and need
-- nothing here. The shared shell (session_product_document) reaches the gedus'
-- substitution pool, the admin Substitutions page and the gedu's own seat
-- cards; the five documents below each build their own shell and are
-- replaced in place, signatures unchanged. Nothing more is disclosed than
-- before: both columns are readable by anon on the tables themselves.

-- ---------------------------------------------------------------------------
-- 1. The shared shell — the substitution surfaces and the gedu's seat cards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.session_product_document(p_product public.products) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'id',                   p_product.id,
    'product_type',         p_product.product_type,
    'tag',                  p_product.tag,
    'topic',                p_product.topic,
    'spoken_language_code', p_product.spoken_language_code,
    'timezone',             p_product.timezone,
    'is_remote',            p_product.is_remote,
    'voice_room_mode',      p_product.voice_room_mode,
    'external_voice_url',   p_product.external_voice_url,
    'start_date',           p_product.start_date,
    'end_date',             p_product.end_date,
    -- The venue, on in-person products only. The test is the remote flag and
    -- never the presence of a location: a remote municipality club carries a
    -- location_id (a municipality, by CHECK) and has no building.
    'site_name', (
      SELECT l.name
        FROM public.locations l
       WHERE l.id = p_product.location_id
         AND p_product.is_remote = false
    ),
    -- `description` is the short teaser; the output key predates the column's
    -- `short_description` name and every reader parses it under this one.
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description,
                 'voice_join_instructions', pt.voice_join_instructions
               )
               ORDER BY pt.locale
             )
        FROM public.product_translations pt
       WHERE pt.product_id = p_product.id
    ), '[]'::jsonb),
    -- Slots and never an instant: the client owns the calendar maths on every
    -- surface, so the reader is handed the date's product, not its start.
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM public.schedule_slots ss
       WHERE ss.product_id = p_product.id
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.session_product_document(public.products) IS 'Internal: the ONE description of the product a session belongs to, as every substitution surface states it — id, type, tag (null when untagged), topic, spoken language, timezone, the remote flag, how the sessions are joined (voice_room_mode, with external_voice_url, set only when that mode is external), the venue (site_name, the location''s name on an in-person product and null on a remote one, tested on is_remote because a remote municipality club still carries a location), the term dates, the translations (locale, name, the short teaser as `description`, and voice_join_instructions, that locale''s join instructions when the mode is none and null otherwise) and the schedule slots. The type and tag are what the app reads the qualifications a session requires from. Called by get_open_substitution_requests, get_admin_substitution_requests and get_my_assigned_products, so the gedus'' pool, the admin Substitutions page and the sub''s own card on My SOG cannot disagree about the session, and a fact added here reaches all three. It carries NOTHING about a person, which is what makes it safe to share: who is absent, why, who offered and what the role pays stay in each reader''s own body under that reader''s own rules. Slots and never an instant — the client owns the calendar maths. SECURITY INVOKER and reached only from inside SECURITY DEFINER readers, so it reads as their owner; not granted to `authenticated`.';

REVOKE EXECUTE ON FUNCTION public.session_product_document(public.products) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.session_product_document(public.products) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The gedu's product page
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
    'voice_room_mode', p.voice_room_mode,
    'external_voice_url', p.external_voice_url,
    -- In shell parity with get_gedu_group_feed's, for the same reason the
    -- rosters are in parity: the page composes both documents.
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description,
                 'voice_join_instructions', pt.voice_join_instructions
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

REVOKE EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The trainee's product page
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
    'voice_room_mode',          p.voice_room_mode,
    'external_voice_url',       p.external_voice_url,
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description,
               'voice_join_instructions', pt.voice_join_instructions
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

REVOKE EXECUTE ON FUNCTION public.get_trainee_assigned_product(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_trainee_assigned_product(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_trainee_assigned_product(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The gedu's group workspace
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

REVOKE EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The trainee's group workspace
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

REVOKE EXECUTE ON FUNCTION public.get_trainee_group_feed(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_trainee_group_feed(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_trainee_group_feed(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The family product page
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
    'voice_room_mode', p.voice_room_mode,
    'external_voice_url', p.external_voice_url,
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

REVOKE EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid) TO service_role;
