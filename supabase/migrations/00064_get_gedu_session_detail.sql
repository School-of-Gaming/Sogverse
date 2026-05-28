-- Migration: replace get_gedu_product_detail_v2 with get_gedu_session_detail
-- Description: The marketing-page gedu body (ProductGeduDetailBody at
--              /clubs/[slug] etc.) is being removed in favour of a dedicated
--              gedu dashboard surface — /gedu/clubs/[id], /gedu/camps/[id],
--              /gedu/events/[id] — backed by this new RPC. Both pages would
--              have wanted nearly the same shape; rather than carry two
--              similar functions, drop the old one and ship a single
--              well-shaped one.
--
--              Returns a single jsonb document:
--                product     — id, product_type, padlet_url, timezone,
--                              dates, is_remote, translations[],
--                              schedule_slots[]
--                my_group_id — the caller's assigned group on this product
--                              (the "Your group" anchor for the UI)
--                groups[]    — every group on the product:
--                              {id, name, display_order, created_at,
--                               is_my_group, gamer_count,
--                               gedus[]   ({id, first_name}),
--                               roster    null for sister groups; an array
--                                         of {gamer_id, first_name,
--                                         date_of_birth, gender,
--                                         parent_email} for the caller's
--                                         own group.}
--
--              Authorization: caller must be role='gedu' AND have at least
--              one gedu_group_assignments_v2 row on the product. Sister-
--              group metadata (counts + gedu pills) is visible to assigned
--              gedus by design — collegial visibility within a product the
--              gedu serves on. Roster + parent email are intentionally
--              limited to the caller's own group; a gedu can copy parent
--              emails for kids they teach, not for kids in a peer's group.
--
--              Parent email picks the oldest parent_gamer link by
--              created_at (a gamer can have multiple parents in the DB; the
--              UI assumes one — pick deterministically, fall back to id for
--              stable ordering when created_at is null).

DROP FUNCTION IF EXISTS get_gedu_product_detail_v2(UUID);

CREATE OR REPLACE FUNCTION get_gedu_session_detail(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_caller_id   UUID := (SELECT auth.uid());
  v_my_group_id UUID;
  v_product     JSONB;
  v_groups      JSONB;
BEGIN
  IF (SELECT get_user_role()) <> 'gedu' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT group_id
    INTO v_my_group_id
    FROM gedu_group_assignments_v2
   WHERE product_id = p_product_id
     AND gedu_id    = v_caller_id
   LIMIT 1;

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'padlet_url',   p.padlet_url,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.description
               )
             )
        FROM product_translations_v2 pt
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
        FROM schedule_slots_v2 ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM products_v2 p
  WHERE p.id = p_product_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'display_order', g->>'created_at'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'display_order', pg.display_order,
        'created_at',    pg.created_at,
        'is_my_group',   (pg.id = v_my_group_id),
        'gamer_count',   (
          SELECT COUNT(*)::INTEGER
            FROM participations_v2 part
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
            FROM gedu_group_assignments_v2 ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster',
          CASE WHEN pg.id = v_my_group_id THEN
            COALESCE((
              SELECT jsonb_agg(
                       jsonb_build_object(
                         'gamer_id',      part.gamer_id,
                         'first_name',    gmp.first_name,
                         'date_of_birth', gprof.date_of_birth,
                         'gender',        gprof.gender,
                         'parent_email',  (
                           SELECT pp.email
                             FROM parent_gamer pgm
                             JOIN profiles pp ON pp.id = pgm.parent_id
                            WHERE pgm.gamer_id = part.gamer_id
                            ORDER BY pgm.created_at ASC NULLS LAST,
                                     pgm.id           ASC
                            LIMIT 1
                         )
                       )
                       ORDER BY gmp.first_name
                     )
                FROM participations_v2 part
                JOIN profiles gmp           ON gmp.id        = part.gamer_id
                LEFT JOIN gamer_profiles gprof ON gprof.user_id = part.gamer_id
               WHERE part.group_id = pg.id
                 AND part.status   = 'active'
            ), '[]'::jsonb)
          ELSE NULL
          END
      ) AS g
        FROM product_groups_v2 pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_gedu_session_detail(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_gedu_session_detail(UUID) TO authenticated;
