-- Migration: get_gedu_product_detail_v2 RPC
-- Description: SECURITY DEFINER read for the Gedu's product detail page.
--              Returns the same JSONB shape as get_product_groups_v2_with_details
--              (groups[] with gedus[] + participations[]) but is callable by any
--              Gedu who has a gedu_group_assignments_v2 row on the product.
--
--              The table-level RLS shipped in 00049 + 00050 only lets a Gedu
--              read their OWN assignment, their OWN group, and (for participations
--              and gamer profiles) nothing at all. The product surface needs
--              "any group in this product, full roster" — sister groups included —
--              and an admin's nudge that lets future "jump between groups" flows
--              work without re-touching RLS. Bypassing RLS inside a guarded
--              function is the pattern the codebase already uses for cohort/roster
--              reads (cf. get_my_groups for v1, get_product_groups_v2_with_details
--              for admin v2). The teammate-visibility recursion bug fixed in 00050
--              is sidestepped: this function never queries gedu_group_assignments_v2
--              from inside an RLS context — it's SECURITY DEFINER, so policies
--              don't apply to the function's reads.
--
--              See docs/products-redesign.md §RLS table (line 884) for the design
--              intent this function realises for the gedu role on participations,
--              groups, and assignments. The unassigned inbox is intentionally
--              omitted in step one — see docs/products-v2-architecture.md
--              "Future improvements" § "Gedu details page — unassigned-gamers tray".

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

  -- Caller must be assigned to at least one group on this product. Anything
  -- else is a 403 — a Gedu can't snoop on products they don't teach.
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
                     'id',           gp.id,
                     'display_name', gp.display_name,
                     'email',        gp.email
                   )
                   ORDER BY gp.display_name
                 )
            FROM gedu_group_assignments_v2 ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                 p.id,
                     'gamer_id',           p.gamer_id,
                     'gamer_display_name', gmp.display_name,
                     'gamer_date_of_birth', gprof.date_of_birth,
                     'gamer_gender',       gprof.gender,
                     'status',             p.status,
                     'signed_up_at',       p.signed_up_at
                   )
                   ORDER BY gmp.display_name
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

REVOKE EXECUTE ON FUNCTION get_gedu_product_detail_v2(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_gedu_product_detail_v2(UUID) TO authenticated;
