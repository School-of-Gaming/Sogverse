-- Roblox travels beside Minecraft everywhere a roster does, and the gedu
-- product document learns its topic.
--
-- WHY
--
-- A product surface shows the game identity the product is actually about: a
-- Minecraft Java club shows the child's Minecraft handle, a Roblox Studio club
-- shows their Roblox one, and a topic naming neither (Programming, Esports,
-- AI…) shows no game identity at all. Today every roster-bearing document emits
-- the Minecraft columns alone, so the Roblox half of that sentence cannot be
-- rendered at any price, and the gedu's own product document does not even
-- carry the topic it would decide on.
--
-- The gap is one-sided in the same way on the write side. A gedu can fix a
-- roster child's Minecraft handle through `set_group_member_minecraft` and
-- cannot touch their Roblox one, because no RPC names those columns. Every
-- other surface that writes a game username (a person's own settings, a parent
-- editing their child, an admin editing anyone) treats the two platforms
-- identically; the gedu surface is the one place that does not.
--
-- WHAT CHANGES
--
--   * `get_product_groups_with_details` — every participation object on ALL
--     THREE branches (a group's members, the unassigned actives, the waitlist)
--     gains `participant_roblox_username` and `participant_roblox_user_id`,
--     from a LEFT JOIN mirroring the Minecraft one exactly. It does NOT gain
--     the topic: that panel's page already holds the product row.
--   * `get_gedu_assigned_product` — the product shell gains `topic`, and each
--     roster entry gains `roblox_username` / `roblox_user_id`.
--   * `get_gedu_group_feed` — each roster entry gains the same two. Its product
--     shell does not gain the topic: the page it feeds takes that from the
--     assigned-product document above, and the feed's roster is the copy that
--     is actually rendered, which is why the two rosters stay in parity.
--   * `set_group_member_roblox` is NEW — the Roblox twin of
--     `set_group_member_minecraft`, same guard, same scope check, same target
--     role check, same clear-clears-the-key semantics.
--
-- THE ACCOUNT KEY IS A BIGINT, AND THAT IS THE ONE PLACE THE TWIN DIVERGES
--
-- Mojang's key is a dashed UUID in a text column; Roblox's is an int64 in a
-- bigint one. So the Minecraft RPC's '' sentinel (its text arguments are
-- generated as non-null `string`, and '' is how a caller expresses "none")
-- has no bigint spelling, and the parameter carries `DEFAULT NULL` instead —
-- exactly as `create_gamer` already does for the same column. An omitted
-- argument is therefore how an UNVERIFIED save reaches this function, which is
-- the ordinary case: the calling route stores the name it was sent and takes
-- the account id only from its own server-side lookup, so a name Roblox could
-- not resolve lands with a NULL id. Presence of the id is the whole of
-- "verified", here as everywhere else.
--
-- Clearing works the same way it does for Minecraft: an empty or blank
-- username clears the id with it, because an account id with no name behind it
-- is a verified link to nothing.
--
-- A NOTE ON `get_gedu_group_feed` AND MIGRATION 00194
--
-- 00194 (`session_feeds_name_the_last_editor`, on its own unmerged branch) also
-- rewrites this function, adding `updated_by_first_name` to each session
-- object. It is applied to staging already and sorts BEFORE this file, so a
-- body copied from `schema.sql` — which describes `dev` and predates it —
-- would silently revert it, on staging immediately and on `dev` the moment both
-- branches land. That key is therefore carried through here verbatim. It is not
-- this migration's feature and nothing here reads it; it is preserved because
-- recreating a function must preserve everything it is not deliberately
-- changing, and the current definition of this one includes it.
--
-- CREATE OR REPLACE keeps every signature, so the ACLs and COMMENTs survive.
-- The grants are re-issued anyway: a function coming out of `db push` can come
-- back PUBLIC-executable regardless of the default-privilege entry 00099 set
-- (observed on staging during 00172), so the REVOKEs below are load-bearing
-- rather than historical.

-- ---------------------------------------------------------------------------
-- 1. The admin groups panel
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
                     -- The Roblox pair, on the same terms as the Minecraft one
                     -- next to it: both are LEFT-joined, both are null on a
                     -- person who has never given that platform a handle, and
                     -- neither implies the other. The chip shows whichever the
                     -- product's topic is about.
                     'participant_roblox_username',    rba.roblox_username,
                     'participant_roblox_user_id',     rba.roblox_user_id,
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
            -- user_id is this table's primary key, so this cannot fan the row
            -- out any more than the Minecraft join above it can.
            LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
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
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
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
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
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
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
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
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
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
  'Admin-gated snapshot behind the product Groups panel: groups with their gedus and active members, the unassigned actives, and the waitlist in derived (waitlisted_at, id) order. Every participation object carries the same fields, including the two the panel''s refusal dialogs are keyed to: has_live_subscription (a real read on ALL THREE branches since 00170 — a LEFT JOIN to family_subscriptions excluding status ''cancelled'', so it means live rather than ever-existed) and has_payment_marker (a real read of stripe_checkout_session_id — money once arrived for this seat, which demotion does not clear). Both are resolved here so the panel decides a drag from one snapshot rather than asking per chip. Since 00175 the person keys are participant_* (whoever holds the seat) and the contact behind a child''s seat is parent_first_name/parent_last_name; an adult seat names none of those and carries participant_email — its own address — instead. Since 00195 each chip also carries participant_roblox_username/participant_roblox_user_id beside the Minecraft pair, so the panel can show whichever identity the product''s topic is about; the topic itself is NOT emitted here, because the page already holds the product row.';

-- ---------------------------------------------------------------------------
-- 2. The gedu's product document
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
                LEFT JOIN roblox_accounts rba    ON rba.user_id   = part.participant_id
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
  'One round trip for a gedu opening a product they are assigned to: the product shell, which group is theirs, and every group on the product with its participant_count and gedus. The roster rides only on the caller''s own group and is keyed by participant_id (00175) — the same shape get_gedu_group_feed serves, kept in parity on purpose even though the rendered roster always comes from the feed''s fresher copy. Since 00195 the shell carries the product''s topic (which decides whether a game identity is shown at all, and which one) and each roster entry carries roblox_username/roblox_user_id beside the Minecraft pair.';

-- ---------------------------------------------------------------------------
-- 3. The gedu group workspace feed
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
  -- date_of_birth / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel (00195), and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
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
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
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
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
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
        -- 00194's field, carried through verbatim — see this migration's
        -- header. Nothing here reads it; it is the current definition of this
        -- function on the database this file is pushed to, and recreating a
        -- function preserves what it is not deliberately changing.
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
  'One round trip for a gedu group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map. Contains no schedule expansion — the client owns the calendar math. Each roster row is keyed by participant_id (00175 — whoever holds the seat, child or adult), carries both game identities since 00195 (minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, independent of each other and drawn according to the product''s topic, which this document does not carry), and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox).';

-- ---------------------------------------------------------------------------
-- 4. The gedu's Roblox write path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_user_id  bigint;
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

  -- Target must be a GAMER (00177). A game account is a child's; an adult seat
  -- carries none and the roster renders that slot empty by design, so a row
  -- keyed to a customer would be an orphan the admin twin already refuses to
  -- write. The scope check above does not care about the target's role, so this
  -- stands on its own.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_participant_id
       AND pr.role = 'gamer'
  ) THEN
    RAISE EXCEPTION 'participant % is not a gamer', p_participant_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_username := NULLIF(btrim(COALESCE(p_roblox_username, '')), '');
  -- Clearing the username clears the account id with it: an id without a name
  -- is a verified link to nothing. An omitted (or NULL) id alongside a name is
  -- the UNVERIFIED save — the calling route stores the name it was sent and
  -- takes the id only from its own server-side lookup, so a name Roblox could
  -- not resolve lands here with nothing beside it.
  v_user_id := CASE WHEN v_username IS NULL
                    THEN NULL
                    ELSE p_roblox_user_id
               END;

  INSERT INTO public.roblox_accounts (user_id, roblox_username, roblox_user_id)
  VALUES (p_participant_id, v_username, v_user_id)
  ON CONFLICT (user_id) DO UPDATE
    SET roblox_username = EXCLUDED.roblox_username,
        roblox_user_id  = EXCLUDED.roblox_user_id;

  RETURN jsonb_build_object(
    'participant_id',  p_participant_id,
    'roblox_username', v_username,
    'roblox_user_id',  v_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_group_member_roblox(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_member_roblox(uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_member_roblox(uuid, text, bigint) TO service_role;

COMMENT ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) IS
  'Set a group member''s Roblox username + resolved account id, scoped to participants actively enrolled in a group the calling gedu teaches. The Roblox twin of set_group_member_minecraft, and identical to it in every respect but the key''s type: Roblox''s id is an int64, so the account-id parameter is a DEFAULTed bigint rather than a text column carrying an '''' sentinel, and omitting it is how an unverified save is expressed. The Roblox lookup happens in the calling route (neither Roblox API is reachable from a browser), so an id arriving here was resolved server-side and its presence is the whole of "verified". Clearing the username clears the id with it. In practice the target is always a child: an adult seat carries no linked game account and the roster row shows that slot empty by design.';

-- ---------------------------------------------------------------------------
-- 5. End state
-- ---------------------------------------------------------------------------
--
-- Each read body is grepped for the keys it must now emit, quoted with the
-- comma that follows, so the word appearing in a comment cannot satisfy the
-- check. The three-branch claim on the admin snapshot is asserted by COUNT
-- rather than by presence: the whole failure this migration is most likely to
-- make is adding the pair to one branch and forgetting the other two.

DO $assert$
DECLARE
  c_admin    text;
  c_assigned text;
  c_feed     text;
  c_write    text;
  n_occur    integer;
BEGIN
  SELECT p.prosrc INTO c_admin
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_product_groups_with_details';

  SELECT p.prosrc INTO c_assigned
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_gedu_assigned_product';

  SELECT p.prosrc INTO c_feed
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_gedu_group_feed';

  SELECT p.prosrc INTO c_write
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'set_group_member_roblox';

  IF c_admin IS NULL OR c_assigned IS NULL OR c_feed IS NULL OR c_write IS NULL THEN
    RAISE EXCEPTION 'a function this migration defines is missing after 00195';
  END IF;

  -- All three branches of the admin snapshot, counted.
  n_occur := (length(c_admin) - length(replace(c_admin, '''participant_roblox_username'',', '')))
             / length('''participant_roblox_username'',');
  IF n_occur <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details emits participant_roblox_username on % of 3 branches',
      n_occur;
  END IF;

  n_occur := (length(c_admin) - length(replace(c_admin, '''participant_roblox_user_id'',', '')))
             / length('''participant_roblox_user_id'',');
  IF n_occur <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details emits participant_roblox_user_id on % of 3 branches',
      n_occur;
  END IF;

  IF position('''topic'',' IN c_assigned) = 0 THEN
    RAISE EXCEPTION 'get_gedu_assigned_product does not emit topic';
  END IF;

  IF position('''roblox_username'',' IN c_assigned) = 0
     OR position('''roblox_user_id'',' IN c_assigned) = 0 THEN
    RAISE EXCEPTION 'get_gedu_assigned_product roster is missing the Roblox pair';
  END IF;

  IF position('''roblox_username'',' IN c_feed) = 0
     OR position('''roblox_user_id'',' IN c_feed) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed roster is missing the Roblox pair';
  END IF;

  -- 00194's key, preserved through this recreation rather than reverted. See
  -- the header: this file sorts after that one and would otherwise silently
  -- undo it.
  IF position('''updated_by_first_name''' IN c_feed) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed no longer emits updated_by_first_name';
  END IF;

  -- The write path's guard has to be its FIRST statement, or the authorization
  -- spine's role matrix is testing nothing.
  IF position('assert_role' IN c_write) = 0 THEN
    RAISE EXCEPTION 'set_group_member_roblox has no role guard';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'set_group_member_roblox'
       AND p.proisstrict
  ) THEN
    RAISE EXCEPTION 'set_group_member_roblox is STRICT — its guard would be skipped on NULL input';
  END IF;

  IF has_function_privilege('anon', 'public.set_group_member_roblox(uuid, text, bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'set_group_member_roblox is reachable by anon — the REVOKE FROM PUBLIC did not take';
  END IF;

  IF NOT has_function_privilege(
    'authenticated', 'public.set_group_member_roblox(uuid, text, bigint)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'set_group_member_roblox is not executable by authenticated';
  END IF;

  IF NOT has_function_privilege(
    'service_role', 'public.set_group_member_roblox(uuid, text, bigint)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'set_group_member_roblox is not executable by service_role';
  END IF;

  IF has_function_privilege('anon', 'public.get_gedu_assigned_product(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_gedu_group_feed(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_product_groups_with_details(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a recreated read RPC is reachable by anon — a REVOKE FROM PUBLIC did not take';
  END IF;
END
$assert$;
