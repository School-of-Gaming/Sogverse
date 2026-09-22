--
-- Name: get_gedu_assigned_product(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
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
    'groups',      v_groups
  );
END;
$$;


--
-- Name: FUNCTION get_gedu_assigned_product(p_product_id uuid, p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid) IS 'One round trip for a gedu opening a product they have a seat on: the product shell, which group is theirs, and every group on the product with its participant_count and gedus. The roster rides only on the caller''s own group and is keyed by participant_id — the same shape get_gedu_group_feed serves, kept in parity on purpose even though the rendered roster always comes from the feed''s fresher copy. The shell carries the product''s topic (which decides whether a game identity is shown at all, and which one) and each roster entry carries roblox_username/roblox_user_id beside the Minecraft pair. Each roster entry also carries the staff-only flair — group_joined_at, note and note_updated_by_first_name — emitted unconditionally, because the join stamp is a fact and the clubs-only newcomer rule is applied by the client. Each roster entry carries `creations` too (always an array, [] when there is no row) and the shell carries requires_gamer_creations, both in parity with get_gedu_group_feed for the same reason every other field is: the page composes both documents. THIS IS THE DOOR A SUBSTITUTION COMES THROUGH, and both halves of it are widened rather than only the gate: p_group_id is optional and, when given, must name a group of this product that the caller is assigned to or substitutes on — which is what lets a gedu substituting a SIBLING group of a product they already teach land in the right workspace instead of their own group''s. Without it the assignment group is resolved, and a caller with no assignment on the product falls back to their substituted group, deterministically ordered. A caller with neither is refused with 42501. Each entry of `gedus` additionally carries the assignment `role`.';


--
-- Name: FUNCTION get_gedu_assigned_product(p_product_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid) TO service_role;


