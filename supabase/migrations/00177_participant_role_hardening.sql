-- 00177: two role-aware hardenings the products-for-parents seat model left open.
--
-- Since 00173 a participation seat can be held by an adult `customer`, not only
-- a child `gamer`. Two places still inferred "this seat is a gamer's" from
-- something OTHER than the role, and both misfire on a hand-written row — the
-- manual Stripe-sub-adoption process writes participation rows directly, so an
-- id transposed by hand is a real input, not a hypothetical.
--
-- HARDENING #7 — the adult-row email discriminator checks the ROLE, not just id
-- equality.
--
--   Three roster RPCs compute a seat's own email with an arm shaped
--   `CASE WHEN <p>.participant_id = <p>.customer_id THEN <profile>.email END`.
--   That infers "adult seat" positionally. A row with a gamer's id transposed
--   into customer_id satisfies the equality, so the arm would emit that gamer's
--   profile email — the synthetic `@gamer.sogverse.internal` handle, which is
--   not a mailbox — into a gedu's copy-all-emails affordance. Adding
--   `AND <participant profile>.role = 'customer'` makes an id transposition
--   yield NULL (no email) instead of a leak. Zero change for legitimate data:
--   a real adult seat is a `customer` and still emits its address; a real child
--   seat already emitted NULL and still does.
--
--     get_gedu_group_feed              (one arm)
--     get_gedu_assigned_product        (one arm — shape parity with the feed)
--     get_product_groups_with_details  (three arms: grouped, unassigned,
--                                       waitlisted — one shape, kept in lockstep)
--
-- HARDENING #3 — set_group_member_minecraft refuses a non-gamer target.
--
--   It re-derives scope (the target is an active participant in a group the
--   caller teaches) but never checks the target's ROLE, so a crafted gedu PATCH
--   aimed at an adult seat's participant_id would write a minecraft_accounts row
--   keyed to a `customer` — an orphan no UI renders, which the admin twin
--   already refuses. A guard after the scope check makes it a clean refusal.
--
-- WHAT DELIBERATELY DOES NOT CHANGE. Every body's logic, gates, ordering, error
-- codes, emitted JSON key spellings and columns are reproduced verbatim except
-- for the added predicates. Signatures are unchanged, so these are CREATE OR
-- REPLACE, not drop/recreate — the ACL and COMMENT survive. The grants are
-- re-issued anyway: 00172 proved on staging that a function coming out of
-- `db push` can come back PUBLIC-executable, so the REVOKE ... FROM PUBLIC is
-- load-bearing rather than defensive (supabase/CLAUDE.md).

-- ---------------------------------------------------------------------------
-- #7.1 get_gedu_group_feed — the gedu workspace rail's roster.
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

-- ---------------------------------------------------------------------------
-- #7.2 get_gedu_assigned_product — the peer-group list and the caller's roster.
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
                         -- remove this as unused. The role check (00177) keeps
                         -- it in step with the feed: an id transposition yields
                         -- NULL rather than a gamer's synthetic handle.
                         'participant_email',
                           CASE WHEN part.participant_id = part.customer_id
                                 AND gmp.role = 'customer'
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

-- ---------------------------------------------------------------------------
-- #7.3 get_product_groups_with_details — the admin Groups panel snapshot.
--
-- Three branches, one shape. The panel drags a chip between them, so the arm
-- must gain the role check on ALL THREE — grouped, unassigned, waitlisted —
-- which the end-state block below counts.
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
                     -- @gamer.sogverse.internal handle, not a mailbox. The role
                     -- check (00177) makes "adult seat" the ROLE, not the id
                     -- equality alone — a transposed id yields NULL, not a leak.
                     'participant_email',
                       CASE WHEN p.participant_id = p.customer_id
                             AND gmp.role = 'customer'
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
                     AND gmp.role = 'customer'
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
                     AND gmp.role = 'customer'
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

-- ---------------------------------------------------------------------------
-- #3 set_group_member_minecraft — refuse a non-gamer target.
--
-- The scope check proves the caller teaches the seat; the new guard proves the
-- seat is a gamer's. Without it a crafted PATCH aimed at an adult seat writes a
-- minecraft_accounts row keyed to a `customer` — an orphan no UI renders.
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

  -- Target must be a GAMER (00177). A Minecraft link is a child's; an adult
  -- seat carries no game account and the roster renders that slot empty by
  -- design, so a row keyed to a customer would be an orphan the admin twin
  -- already refuses to write. The scope check above does not care about the
  -- target's role, so this stands on its own.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_participant_id
       AND pr.role = 'gamer'
  ) THEN
    RAISE EXCEPTION 'participant % is not a gamer', p_participant_id
      USING ERRCODE = 'check_violation';
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

-- ---------------------------------------------------------------------------
-- End state.
--
-- Each hardening has a way of being wrong that nothing else would catch: an
-- email arm that dropped the role check on one of three branches (so a chip
-- leaks the moment it is dragged there), or a #3 guard that was never added.
-- Type-check and the jsdom suites are blind to both — a leaked synthetic handle
-- is a well-typed string, and a missing SQL guard fails nothing until an
-- attacker exercises it.
--
-- The proof block that follows is what makes these non-vacuous: each positive
-- check is paired with a reconstruction of the PRE-hardening body (the exact
-- predicate stripped out) that the same check must then reject.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  c_src   text;
  c_pre   text;
  c_count integer;
  c_fn    text;
  c_fns   text[] := ARRAY[
    'get_gedu_group_feed',
    'get_gedu_assigned_product',
    'get_product_groups_with_details'
  ];
BEGIN
  -- #7 — every roster function's email arm now carries the role predicate.
  FOREACH c_fn IN ARRAY c_fns LOOP
    SELECT p.prosrc INTO c_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = c_fn;

    IF c_src IS NULL THEN
      RAISE EXCEPTION '% is missing after 00177', c_fn;
    END IF;

    IF position('gmp.role = ''customer''' IN c_src) = 0 THEN
      RAISE EXCEPTION
        '%: the participant_email arm does not check the customer role', c_fn;
    END IF;

    -- Non-vacuous: strip the predicate everywhere it appears and require the
    -- check to fail on what remains — i.e. the pre-hardening body would NOT
    -- have passed.
    c_pre := replace(c_src, 'gmp.role = ''customer''', '');
    IF position('gmp.role = ''customer''' IN c_pre) > 0 THEN
      RAISE EXCEPTION
        '00177 #7 proof is vacuous for %: the predicate survived stripping', c_fn;
    END IF;
  END LOOP;

  -- The three-branch shape of the admin snapshot: the role check must land on
  -- ALL THREE branches (grouped, unassigned, waitlisted), because the panel
  -- drags one chip between them and a branch missing the check leaks on arrival.
  SELECT p.prosrc INTO c_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_product_groups_with_details';

  c_count := (length(c_src) - length(replace(c_src, 'gmp.role = ''customer''', '')))
             / length('gmp.role = ''customer''');
  IF c_count <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details checks the customer role on % of its 3 branches, not 3',
      c_count;
  END IF;

  -- #3 — set_group_member_minecraft now refuses a non-gamer target.
  SELECT p.prosrc INTO c_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'set_group_member_minecraft';

  IF c_src IS NULL THEN
    RAISE EXCEPTION 'set_group_member_minecraft is missing after 00177';
  END IF;

  IF position('pr.role = ''gamer''' IN c_src) = 0 THEN
    RAISE EXCEPTION
      'set_group_member_minecraft does not guard the target role';
  END IF;

  -- Non-vacuous: the pre-hardening body (the guard predicate removed) would not
  -- pass the check above.
  c_pre := replace(c_src, 'pr.role = ''gamer''', '');
  IF position('pr.role = ''gamer''' IN c_pre) > 0 THEN
    RAISE EXCEPTION
      '00177 #3 proof is vacuous: the guard predicate survived stripping';
  END IF;

  -- The recreates must not have come back PUBLIC-executable, and both granted
  -- roles must still reach them — service_role included, the admin-client path
  -- that no browser-side test would catch.
  FOREACH c_fn IN ARRAY ARRAY[
    'public.get_gedu_group_feed(uuid)',
    'public.get_gedu_assigned_product(uuid)',
    'public.get_product_groups_with_details(uuid)',
    'public.set_group_member_minecraft(uuid, text, text)'
  ] LOOP
    IF has_function_privilege('anon', c_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% is reachable by anon', c_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', c_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% is not executable by authenticated', c_fn;
    END IF;
    IF NOT has_function_privilege('service_role', c_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% is not executable by service_role', c_fn;
    END IF;
  END LOOP;
END
$assert$;
