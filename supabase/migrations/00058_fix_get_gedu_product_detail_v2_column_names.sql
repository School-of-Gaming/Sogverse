-- Migration: Fix get_gedu_product_detail_v2 column + key names
-- Description: 00057 was written against the legacy profiles.display_name shape
--              and emitted JSON keys `display_name` / `gamer_display_name`.
--              Migration 00053 dropped display_name in favour of first_name and
--              renamed the same keys in the admin counterpart RPC. plpgsql
--              doesn't type-check function bodies at CREATE time, so 00057
--              applied cleanly but the function failed at first call with
--              "column gp.display_name does not exist". CREATE OR REPLACE here
--              ships the corrected body; grant from 00057 persists.
--
--              Same pattern as 00050 fixing 00049 — append-only repair instead
--              of rewriting an applied migration.

CREATE OR REPLACE FUNCTION get_gedu_product_detail_v2(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_groups JSONB;
BEGIN
  IF (SELECT get_user_role()) <> 'gedu' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM gedu_group_assignments_v2
     WHERE product_id = p_product_id
       AND gedu_id    = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products_v2 WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'display_order', g->>'created_at'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'display_order', pg.display_order,
        'created_at',    pg.created_at,
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email
                   )
                   ORDER BY gp.first_name
                 )
            FROM gedu_group_assignments_v2 ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                  p.id,
                     'gamer_id',            p.gamer_id,
                     'gamer_first_name',    gmp.first_name,
                     'gamer_date_of_birth', gprof.date_of_birth,
                     'gamer_gender',        gprof.gender,
                     'status',              p.status,
                     'signed_up_at',        p.signed_up_at
                   )
                   ORDER BY gmp.first_name
                 )
            FROM participations_v2 p
            JOIN profiles gmp ON gmp.id = p.gamer_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
           WHERE p.group_id = pg.id
             AND p.status = 'active'
        ), '[]'::jsonb)
      ) AS g
        FROM product_groups_v2 pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups
  );
END;
$$;
