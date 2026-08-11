-- 00175: the rosters name their PARTICIPANT, and comp-enrollment stops
-- claiming to enroll a gamer.
--
-- 00172 renamed the columns, 00173 made a parent able to occupy a seat, and
-- 00174 renamed the one family-facing result key. What is left is the roster
-- half: seven functions whose *result keys* and one whose *name* still say
-- "gamer" about a shape that now carries whoever holds the seat. 00174's header
-- deferred exactly this, on the grounds that renaming the keys without their
-- consumers would break three panels; this migration is the step that rewrites
-- those consumers, so the keys come with it.
--
-- WHAT CHANGES — the whole inventory, old -> new
--
--   get_gedu_group_feed          roster: gamer_id -> participant_id
--   get_gedu_assigned_product    group:  gamer_count -> participant_count
--                                roster: gamer_id -> participant_id
--   get_product_groups_with_details (all THREE branches — grouped, unassigned
--                                and waitlisted — which carry one shape and
--                                must keep carrying one):
--                                gamer_id                 -> participant_id
--                                gamer_first_name         -> participant_first_name
--                                gamer_date_of_birth      -> participant_date_of_birth
--                                gamer_gender             -> participant_gender
--                                gamer_minecraft_username -> participant_minecraft_username
--                                gamer_minecraft_uuid     -> participant_minecraft_uuid
--                                gamer_parent_first_name  -> parent_first_name
--                                gamer_parent_last_name   -> parent_last_name
--   record_attendance            gamer_id -> participant_id (both return sites)
--   set_group_member_minecraft   gamer_id -> participant_id
--   get_my_assigned_products     RETURNS TABLE column gamer_count -> participant_count
--   get_my_gedu_assignment_summaries  group_gamer_count -> group_participant_count
--
--   admin_enroll_gamer(uuid, uuid) -> admin_enroll_participant(uuid, uuid)
--
-- The two parent-name keys drop the `gamer_` prefix rather than gaining a
-- `participant_` one. They do not describe the participant; they describe the
-- contact standing behind a child's seat, and the sibling rosters have spelled
-- that `parent_email` since 00173. One prefix per subject, and `parent_` is
-- already the prefix for this one.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--
--   * Every body's logic, its gates, its ordering and its error codes. Only the
--     spelling of output keys moves. The one exception is admin_enroll_gamer,
--     whose body is copied across verbatim under the new name — the audience
--     gate 00173 gave it included.
--   * The `parent_email` / `participant_email` pair on the two gedu rosters.
--     Those were spelled correctly when they were written.
--   * `parent_gamer`, `gamer_profiles`, `create_gamer` and every other name that
--     really is about children. A gamer is still a gamer; a *seat* is not.
--
-- ACL NOTE. Six of the eight are CREATE OR REPLACE (unchanged signature), so
-- their ACL and COMMENT survive; the grants are re-issued anyway because 00172
-- proved on staging that a function coming out of `db push` can come back
-- PUBLIC-executable. Two are genuine drop/recreate cycles — get_my_assigned_products
-- because an OUT column cannot be renamed in place, and admin_enroll_participant
-- because it is a new name — and those two lose their ACL outright, which is
-- what the assertions at the foot of this file check for rather than assume.

-- ---------------------------------------------------------------------------
-- 1. get_gedu_group_feed — the gedu workspace rail's roster.
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
        -- a mailbox and must never reach a copy-email affordance.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id THEN gmp.email END
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
  'One round trip for a gedu group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map. Contains no schedule expansion — the client owns the calendar math. Each roster row is keyed by participant_id (00175 — whoever holds the seat, child or adult) and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox).';

-- ---------------------------------------------------------------------------
-- 2. get_gedu_assigned_product — the peer-group list and the caller's roster.
-- ---------------------------------------------------------------------------

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
        -- Every active seat on the group, whoever holds it. Spelled for a gamer
        -- until 00175, at which point counting an adult parent under that name
        -- became a lie the badge repeated on screen.
        'participant_count',   (
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
                         'participant_id',     part.participant_id,
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
                         ),
                         -- Shape parity with get_gedu_group_feed, which is the
                         -- copy every rendered roster actually comes from. Kept
                         -- deliberately rather than left out: one roster shape
                         -- with two definitions is how the two drift, and the
                         -- next reader would delete the wrong one. Do not
                         -- remove this as unused.
                         'participant_email',
                           CASE WHEN part.participant_id = part.customer_id
                                THEN gmp.email END
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

REVOKE EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid) TO service_role;

COMMENT ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) IS
  'One round trip for a gedu opening a product they are assigned to: the product shell, which group is theirs, and every group on the product with its participant_count and gedus. The roster rides only on the caller''s own group and is keyed by participant_id (00175) — the same shape get_gedu_group_feed serves, kept in parity on purpose even though the rendered roster always comes from the feed''s fresher copy.';

-- ---------------------------------------------------------------------------
-- 3. get_product_groups_with_details — the admin Groups panel snapshot.
--
-- Three branches, one shape. The panel drags a chip between them, so a key
-- renamed on two of the three would be a runtime bug no type could catch.
-- ---------------------------------------------------------------------------

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
                     'id',                             p.id,
                     'participant_id',                 p.participant_id,
                     'participant_first_name',         gmp.first_name,
                     'participant_date_of_birth',      gprof.date_of_birth,
                     'participant_gender',             gprof.gender,
                     'participant_minecraft_username', mca.minecraft_username,
                     'participant_minecraft_uuid',     mca.minecraft_uuid,
                     -- The contact behind a CHILD's seat, which is what these
                     -- two describe — not the participant. Hence `parent_`
                     -- rather than `participant_parent_`: one prefix per
                     -- subject, and parent_email next door already set it.
                     'parent_first_name',              parent.first_name,
                     'parent_last_name',               parent.last_name,
                     -- An adult seat has no linked parent to name, so the chip
                     -- shows an address instead. NULL on every child row: a
                     -- gamer profile's email is the synthetic
                     -- @gamer.sogverse.internal handle, not a mailbox.
                     'participant_email',
                       CASE WHEN p.participant_id = p.customer_id
                            THEN gmp.email END,
                     'status',                         p.status,
                     'signed_up_at',                   p.signed_up_at,
                     -- The demote/remove dialogs' condition, resolved
                     -- server-side so the panel needs no round trip per chip.
                     -- The join below excludes dead subscriptions, so this is
                     -- "live", not "ever existed".
                     'has_live_subscription',          (fs.id IS NOT NULL),
                     -- The promote dialog's condition (00167): money once
                     -- arrived for this seat.
                     'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL)
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
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_date_of_birth',      gprof.date_of_birth,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL)
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
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_date_of_birth',      gprof.date_of_birth,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL)
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

REVOKE EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO service_role;

COMMENT ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) IS
  'Admin-gated snapshot behind the product Groups panel: groups with their gedus and active members, the unassigned actives, and the waitlist in derived (waitlisted_at, id) order. Every participation object carries the same fields, including the two the panel''s refusal dialogs are keyed to: has_live_subscription (a real read on ALL THREE branches since 00170 — a LEFT JOIN to family_subscriptions excluding status ''cancelled'', so it means live rather than ever-existed) and has_payment_marker (a real read of stripe_checkout_session_id — money once arrived for this seat, which demotion does not clear). Both are resolved here so the panel decides a drag from one snapshot rather than asking per chip. Since 00175 the person keys are participant_* (whoever holds the seat) and the contact behind a child''s seat is parent_first_name/parent_last_name; an adult seat names none of those and carries participant_email — its own address — instead.';

-- ---------------------------------------------------------------------------
-- 4. record_attendance — a gedu marks whoever is on the roster.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) RETURNS jsonb
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

  -- Authorize the TARGET as well as the actor: the person must actually be on
  -- this group's roster. Without this, an assigned gedu could aim a mark at any
  -- profile id in the system. The predicate has never cared who the participant
  -- is, which is why an adult seat is markable with no branch here.
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
      'session_id',     v_session_id,
      'participant_id', p_participant_id,
      'status',         NULL
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
    'session_id',     v_session_id,
    'participant_id', p_participant_id,
    'status',         v_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_attendance(uuid, date, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_attendance(uuid, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_attendance(uuid, date, uuid, text) TO service_role;

COMMENT ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) IS
  'Record (or, with a NULL status, clear) ONE participant''s attendance mark for one session. Per-mark so concurrent gedus cannot clobber each other; marks open at the session''s scheduled start (roll call during the session is the standard pattern) and never before; authorizes both the calling gedu and the target. The target is whoever holds the seat — a gedu marks an adult present exactly as they mark a child, with no branch for it.';

-- ---------------------------------------------------------------------------
-- 5. set_group_member_minecraft — the roster row's inline username edit.
--
-- An adult has no linked game account and the roster row renders that slot
-- empty by design (parent game-account linking is deferred, see the plan), so
-- this function is reachable only for a child in practice. Its result key
-- renames anyway: the key describes the row it answers about, and the row is a
-- participant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_uuid     text;
BEGIN
  PERFORM public.assert_role('gedu');

  -- Actor AND target: the participant must be actively participating in a group
  -- the caller is assigned to. A gedu may fix a username for the people they
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
    'participant_id',     p_participant_id,
    'minecraft_username', v_username,
    'minecraft_uuid',     v_uuid
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) IS
  'Set a group member''s Minecraft username + resolved UUID, scoped to participants actively enrolled in a group the calling gedu teaches. The Mojang lookup happens in the calling route, so a successful edit lands verified. In practice this is always a child: an adult seat carries no linked game account and the roster row shows that slot empty by design.';

-- ---------------------------------------------------------------------------
-- 6. get_my_gedu_assignment_summaries — the gedu dashboard cards' roster size.
-- ---------------------------------------------------------------------------

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
               'product_id',              a.product_id,
               'group_id',                a.group_id,
               'group_name',              g.name,
               -- Renamed from group_gamer_count in 00175: the count is every
               -- active seat on the group, and since 00173 one of those can be
               -- an adult.
               'group_participant_count', roster.roster_size,
               'site_name',               site.name,
               'attention_count',         COALESCE(owed.owed_count, 0)
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
             -- — which is why someone joining a long-running group reopens
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

REVOKE EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO service_role;

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS
  'One row per gedu assignment for the dashboard cards: group name, that group''s participant count (renamed from group_gamer_count in 00175 — an active seat may be held by an adult since 00173), the venue name on in-person products, and how many past sessions still owe a register or a family-facing report. A finished session on or after the epoch counts until BOTH are in. The enforcement epoch travels in as an argument because it is a code constant, not a column.';

-- ---------------------------------------------------------------------------
-- 7. get_my_assigned_products — a genuine drop/recreate.
--
-- An OUT/TABLE column cannot be renamed by CREATE OR REPLACE (Postgres refuses:
-- "cannot change name of input parameter" for IN, "cannot change return type"
-- for the row type). So this one is dropped and rebuilt, and comes back with no
-- ACL at all — the grants below are load-bearing rather than defensive.
-- ---------------------------------------------------------------------------

DROP FUNCTION public.get_my_assigned_products();

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(product_id uuid, group_id uuid, timezone text, start_date date, end_date date, is_remote boolean, product_type public.product_type, product_translations jsonb, schedule_slots jsonb, group_count integer, participant_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_gedu_id UUID := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN QUERY
  SELECT
    p.id            AS product_id,
    a.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
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
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS participant_count
  FROM gedu_group_assignments a
  JOIN products p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_assigned_products() TO service_role;

COMMENT ON FUNCTION public.get_my_assigned_products() IS
  'Every product the calling gedu is assigned to, one row per assignment, with the product shell, its schedule slots, how many groups it has and how many active seats (participant_count — renamed from gamer_count in 00175, because a seat may be held by an adult since 00173). Gedu-gated on its first statement.';

-- ---------------------------------------------------------------------------
-- 8. admin_enroll_gamer -> admin_enroll_participant.
--
-- The last function name in the schema that says "gamer" about something that
-- is not one. 00173 already taught the body to enroll an adult onto a
-- for-parents product; the name kept claiming otherwise, on the one surface
-- (comp-enrollment) an admin uses to do exactly that.
--
-- DROP + CREATE rather than ALTER FUNCTION ... RENAME TO, so the grants and the
-- COMMENT are re-stated in this file rather than inherited invisibly. The body
-- is unchanged from 00173's, with only the parent-link comment reworded.
-- ---------------------------------------------------------------------------

DROP FUNCTION public.admin_enroll_gamer(uuid, uuid);

CREATE FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type     public.product_type;
  v_billing_mode     public.billing_mode;
  v_for_gamers       boolean;
  v_for_parents      boolean;
  v_participant_role public.user_role;
  v_customer_id      uuid;
  v_participation_id uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_type, billing_mode, for_gamers, for_parents
    INTO v_product_type, v_billing_mode, v_for_gamers, v_for_parents
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

  -- This function derives the customer rather than being told one, so "is this
  -- a self seat" is decided from the participant's ROLE. A `customer` profile
  -- is an adult taking a seat on their own account; every other role (and a
  -- participant who does not exist at all, whose role reads NULL and so fails
  -- this comparison) goes down the child path and is resolved through the
  -- parent link exactly as before — including the error it has always raised.
  SELECT role INTO v_participant_role
    FROM public.profiles WHERE id = p_participant_id;

  IF v_participant_role = 'customer' THEN
    IF NOT v_for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- An adult pays for their own seat: they are the customer AND the
    -- participant. This is the row shape the dropped no-self-signup CHECK used
    -- to forbid.
    v_customer_id := p_participant_id;
  ELSE
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

    IF NOT v_for_gamers THEN
      RAISE EXCEPTION 'product % is not open to gamers', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
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

REVOKE EXECUTE ON FUNCTION public.admin_enroll_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_enroll_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enroll_participant(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) IS
  'Admin-gated comp-enrollment: drops a participant onto a product with status=active, bypassing payment, seat caps and registration windows by design. Refuses only a paid consumer club — the one shape whose seat requires a Stripe subscription this function cannot create; free clubs enroll like any free camp or event. Since 00173 it also enforces the audience: a customer profile takes a seat as their own customer and needs for_parents, anyone else is resolved through the parent link and needs for_gamers. Renamed from admin_enroll_gamer in 00175 — it has not only enrolled gamers since 00173.';

-- ---------------------------------------------------------------------------
-- End state.
--
-- Every claim below has a way of being wrong that nothing else would catch: a
-- key renamed in two of three branches, an old key left behind beside its
-- replacement, a drop/recreate that came back PUBLIC-executable or without its
-- authenticated grant, a rename that left the old function in place so both
-- names answer. Type-check and the jsdom suites are blind to all of it —
-- a stale key arrives as `undefined` at a zod parse in CI at the earliest, and
-- a surviving old function never fails at all.
--
-- The counting assertions are what make this non-vacuous: `position(...) = 0`
-- alone would pass on a body that emitted the key once and dropped it from the
-- other two branches.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  c_src   text;
  c_count integer;
  c_key   text;
  -- The whole rename inventory, as (function, key) pairs. Each new key must
  -- appear, quoted, and the matching old key must be gone.
  c_pairs text[][] := ARRAY[
    ['get_gedu_group_feed',              'participant_id',                 'gamer_id'],
    ['get_gedu_assigned_product',        'participant_id',                 'gamer_id'],
    ['get_gedu_assigned_product',        'participant_count',              'gamer_count'],
    ['get_product_groups_with_details',  'participant_id',                 'gamer_id'],
    ['get_product_groups_with_details',  'participant_first_name',         'gamer_first_name'],
    ['get_product_groups_with_details',  'participant_date_of_birth',      'gamer_date_of_birth'],
    ['get_product_groups_with_details',  'participant_gender',             'gamer_gender'],
    ['get_product_groups_with_details',  'participant_minecraft_username', 'gamer_minecraft_username'],
    ['get_product_groups_with_details',  'participant_minecraft_uuid',     'gamer_minecraft_uuid'],
    ['get_product_groups_with_details',  'parent_first_name',              'gamer_parent_first_name'],
    ['get_product_groups_with_details',  'parent_last_name',               'gamer_parent_last_name'],
    ['record_attendance',                'participant_id',                 'gamer_id'],
    ['set_group_member_minecraft',       'participant_id',                 'gamer_id'],
    ['get_my_gedu_assignment_summaries', 'group_participant_count',        'group_gamer_count']
  ];
  i integer;
BEGIN
  FOR i IN 1 .. array_length(c_pairs, 1) LOOP
    SELECT p.prosrc INTO c_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = c_pairs[i][1];

    IF c_src IS NULL THEN
      RAISE EXCEPTION '% is missing after 00175', c_pairs[i][1];
    END IF;

    -- Quoted with the trailing quote and comma so a mention inside a comment
    -- cannot satisfy this, and so `'participant_id'` is not matched by a search
    -- for `'participant_i'`.
    c_key := '''' || c_pairs[i][2] || ''',';
    IF position(c_key IN c_src) = 0 THEN
      RAISE EXCEPTION '% does not emit a % key', c_pairs[i][1], c_pairs[i][2];
    END IF;

    c_key := '''' || c_pairs[i][3] || ''',';
    IF position(c_key IN c_src) > 0 THEN
      RAISE EXCEPTION '% still emits the old % key', c_pairs[i][1], c_pairs[i][3];
    END IF;
  END LOOP;

  -- The three-branch shape. The admin panel drags one chip between grouped,
  -- unassigned and waitlisted, so a key present twice is a chip that loses a
  -- field the moment it moves — which is precisely the bug the loop above
  -- cannot see.
  SELECT p.prosrc INTO c_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_product_groups_with_details';

  FOREACH c_key IN ARRAY ARRAY[
    'participant_id', 'participant_first_name', 'participant_date_of_birth',
    'participant_gender', 'participant_minecraft_username',
    'participant_minecraft_uuid', 'parent_first_name', 'parent_last_name',
    'participant_email'
  ] LOOP
    c_count := (length(c_src) - length(replace(c_src, '''' || c_key || '''', '')))
               / (length(c_key) + 2);
    IF c_count <> 3 THEN
      RAISE EXCEPTION
        'get_product_groups_with_details emits % on % of its 3 branches, not 3',
        c_key, c_count;
    END IF;
  END LOOP;

  -- record_attendance answers from two places (a cleared mark and a set one).
  SELECT p.prosrc INTO c_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_attendance';
  c_count := (length(c_src) - length(replace(c_src, '''participant_id''', '')))
             / length('''participant_id''');
  IF c_count <> 2 THEN
    RAISE EXCEPTION 'record_attendance emits participant_id % times, not 2', c_count;
  END IF;

  -- The renamed OUT column. Not in prosrc at all — it lives in proargnames.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_my_assigned_products'
       AND 'participant_count' = ANY(p.proargnames)
  ) THEN
    RAISE EXCEPTION 'get_my_assigned_products does not return participant_count';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_my_assigned_products'
       AND 'gamer_count' = ANY(p.proargnames)
  ) THEN
    RAISE EXCEPTION 'get_my_assigned_products still returns gamer_count';
  END IF;

  -- The function rename, both halves. The old name surviving is the dangerous
  -- direction: nothing would fail, and the app would go on calling a function
  -- this file thinks it deleted.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'admin_enroll_gamer'
  ) THEN
    RAISE EXCEPTION 'admin_enroll_gamer still exists after 00175';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'admin_enroll_participant'
  ) THEN
    RAISE EXCEPTION 'admin_enroll_participant is missing after 00175';
  END IF;

  -- The two drop/recreate cycles lost their ACL outright. anon must not have
  -- come back with one, and authenticated must have got one back.
  FOREACH c_key IN ARRAY ARRAY[
    'public.admin_enroll_participant(uuid, uuid)',
    'public.get_my_assigned_products()',
    'public.get_gedu_group_feed(uuid)',
    'public.get_gedu_assigned_product(uuid)',
    'public.get_product_groups_with_details(uuid)',
    'public.record_attendance(uuid, date, uuid, text)',
    'public.set_group_member_minecraft(uuid, text, text)',
    'public.get_my_gedu_assignment_summaries(date)'
  ] LOOP
    IF has_function_privilege('anon', c_key, 'EXECUTE') THEN
      RAISE EXCEPTION '% is reachable by anon', c_key;
    END IF;
    IF NOT has_function_privilege('authenticated', c_key, 'EXECUTE') THEN
      RAISE EXCEPTION '% is not executable by authenticated', c_key;
    END IF;
  END LOOP;
END
$assert$;

-- ---------------------------------------------------------------------------
-- Proof the assertions can fail.
--
-- A self-checking migration is only worth its lines if a wrong end state really
-- raises. The cheap, faithful way to know is to reconstruct the state this file
-- was written to replace — the real body of get_gedu_group_feed with its key
-- put back the way it was five minutes ago — and run the same two predicates
-- over it. The new-key test must raise, the old-key test must raise, and if
-- either passes then the corresponding check in the block above is decoration.
--
-- Reconstructing from real source rather than planting a stub is the point: a
-- hand-written stub proves a `position()` call works, which was never in doubt.
-- This proves the predicates recognise THE pre-migration body.
-- ---------------------------------------------------------------------------

DO $proof$
DECLARE
  c_src       text;
  c_pre       text;
  c_new_fired boolean := false;
  c_old_fired boolean := false;
BEGIN
  SELECT p.prosrc INTO c_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_gedu_group_feed';

  c_pre := replace(c_src, '''participant_id'',', '''gamer_id'',');

  IF c_pre = c_src THEN
    RAISE EXCEPTION
      '00175 proof could not rebuild the pre-rename body — the key it renames is not in the source';
  END IF;

  BEGIN
    IF position('''participant_id'',' IN c_pre) = 0 THEN
      RAISE EXCEPTION 'pre-rename body does not emit a participant_id key';
    END IF;
  EXCEPTION WHEN raise_exception THEN
    c_new_fired := true;
  END;

  BEGIN
    IF position('''gamer_id'',' IN c_pre) > 0 THEN
      RAISE EXCEPTION 'pre-rename body still emits the old gamer_id key';
    END IF;
  EXCEPTION WHEN raise_exception THEN
    c_old_fired := true;
  END;

  IF NOT c_new_fired THEN
    RAISE EXCEPTION
      '00175 new-key assertion is vacuous: the pre-rename body passed it';
  END IF;
  IF NOT c_old_fired THEN
    RAISE EXCEPTION
      '00175 old-key assertion is vacuous: the pre-rename body passed it';
  END IF;
END
$proof$;
