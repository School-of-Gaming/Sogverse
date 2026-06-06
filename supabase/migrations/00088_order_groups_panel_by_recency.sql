-- Admin groups panel display order, done server-side by recency (single clock).
--
-- 00087 moved ordering to the client and exposed updated_at/assigned_at for it
-- to sort by. That turned out to be a mistake: the client mixed browser-clock
-- optimistic timestamps with Postgres-clock settled timestamps in one sort key,
-- so clock skew reordered chips for a frame on every move. The robust fix is to
-- let the server (one authoritative clock) do the single sort by recency, and
-- have the client just render the array and optimistically append on a move —
-- which matches, because a move bumps updated_at and lands the row last.
--
-- So: order participations by updated_at (a move bumps it via the
-- participations_updated_at trigger) and group Gedus by their assignment's
-- created_at; most-recently-touched is last. The client no longer sorts, so the
-- updated_at/assigned_at fields 00087 added to the payload are dropped again.

CREATE OR REPLACE FUNCTION public.get_product_groups_with_details(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
BEGIN
  IF (SELECT get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

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
                     'id',                       p.id,
                     'gamer_id',                 p.gamer_id,
                     'gamer_first_name',         gmp.first_name,
                     'gamer_date_of_birth',      gprof.date_of_birth,
                     'gamer_gender',             gprof.gender,
                     'gamer_minecraft_username', mca.minecraft_username,
                     'gamer_minecraft_uuid',     mca.minecraft_uuid,
                     'gamer_parent_first_name',  parent.first_name,
                     'gamer_parent_last_name',   parent.last_name,
                     'status',                   p.status,
                     'signed_up_at',             p.signed_up_at
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.gamer_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.gamer_id
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
             'id',                       p.id,
             'gamer_id',                 p.gamer_id,
             'gamer_first_name',         gmp.first_name,
             'gamer_date_of_birth',      gprof.date_of_birth,
             'gamer_gender',             gprof.gender,
             'gamer_minecraft_username', mca.minecraft_username,
             'gamer_minecraft_uuid',     mca.minecraft_uuid,
             'gamer_parent_first_name',  parent.first_name,
             'gamer_parent_last_name',   parent.last_name,
             'status',                   p.status,
             'signed_up_at',             p.signed_up_at
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.gamer_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.gamer_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.group_id IS NULL
     AND p.status = 'active';

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned
  );
END;
$$;
