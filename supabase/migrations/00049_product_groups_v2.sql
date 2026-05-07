-- Migration: Product groups v2 — admin-only cohort layer for products_v2
-- Description: Adds product_groups_v2 (named, multi-Gedu) and gedu_group_assignments_v2,
--              repoints participations_v2.group_id to v2, and ships
--              get_product_groups_v2_with_details + commit_group_changes_v2 RPCs.
--              Mirrors the v1 staged-changes pattern in 00006_groups_and_enrollments.sql,
--              extended for named groups, multi-Gedu, and an unassigned inbox.
--              See docs/products-redesign.md §4.1, §5.4, §6.1a.

-- =============================================================================
-- 1. product_groups_v2 table — named cohort, 0+ Gedus, 0+ participations
-- =============================================================================

CREATE TABLE product_groups_v2 (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products_v2(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_product_groups_v2_name_not_blank
    CHECK (length(btrim(name)) > 0)
);

CREATE INDEX idx_product_groups_v2_product ON product_groups_v2(product_id);

ALTER TABLE product_groups_v2 ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER product_groups_v2_updated_at
  BEFORE UPDATE ON product_groups_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 2. gedu_group_assignments_v2 table — multi-Gedu join
-- =============================================================================

-- Denormalized product_id is what makes "one group per Gedu per product"
-- expressible as a UNIQUE constraint instead of a trigger. The denorm trigger
-- below keeps it consistent with the group's product_id.
CREATE TABLE gedu_group_assignments_v2 (
  group_id   UUID NOT NULL REFERENCES product_groups_v2(id) ON DELETE CASCADE,
  gedu_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products_v2(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (group_id, gedu_id),
  UNIQUE (gedu_id, product_id)
);

CREATE INDEX idx_gedu_group_assignments_v2_gedu
  ON gedu_group_assignments_v2(gedu_id);

CREATE INDEX idx_gedu_group_assignments_v2_product
  ON gedu_group_assignments_v2(product_id);

ALTER TABLE gedu_group_assignments_v2 ENABLE ROW LEVEL SECURITY;

-- Trigger: enforce that the denormalized product_id matches the group's product_id.
-- BEFORE INSERT/UPDATE so callers can omit product_id and have it filled in,
-- or pass it and have the mismatch rejected.
CREATE OR REPLACE FUNCTION validate_gedu_assignment_v2_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_product_id UUID;
BEGIN
  SELECT product_id INTO v_group_product_id
    FROM public.product_groups_v2
    WHERE id = NEW.group_id;

  IF v_group_product_id IS NULL THEN
    RAISE EXCEPTION 'group_id % does not exist', NEW.group_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.product_id IS NULL THEN
    NEW.product_id := v_group_product_id;
  ELSIF NEW.product_id <> v_group_product_id THEN
    RAISE EXCEPTION 'gedu_group_assignments_v2.product_id % does not match group %''s product_id %',
      NEW.product_id, NEW.group_id, v_group_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_gedu_assignment_v2_product() FROM authenticated, anon, public;

CREATE TRIGGER trg_validate_gedu_assignment_v2_product
  BEFORE INSERT OR UPDATE OF group_id, product_id ON gedu_group_assignments_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_gedu_assignment_v2_product();

-- =============================================================================
-- 3. Repoint participations_v2.group_id from v1 product_groups to v2
-- =============================================================================
-- v1 product_groups never gained any v2 participation rows (the FK existed but
-- the v2 group infrastructure shipped here). Safe to drop and re-add.

ALTER TABLE participations_v2
  DROP CONSTRAINT IF EXISTS participations_v2_group_id_fkey;

ALTER TABLE participations_v2
  ADD CONSTRAINT participations_v2_group_id_fkey
    FOREIGN KEY (group_id)
    REFERENCES product_groups_v2(id)
    ON DELETE SET NULL;

-- The validate trigger from 00039 references public.product_groups; rewrite it
-- to point at product_groups_v2. The trigger fires on group_id/product_id
-- updates only, so we keep the same trigger name and surface.
DROP TRIGGER IF EXISTS trg_validate_participations_v2_group ON participations_v2;
DROP FUNCTION IF EXISTS validate_participations_v2_group();

CREATE OR REPLACE FUNCTION validate_participations_v2_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_product_id UUID;
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT product_id INTO v_group_product_id
    FROM public.product_groups_v2
    WHERE id = NEW.group_id;

  IF v_group_product_id IS NULL THEN
    RAISE EXCEPTION 'group_id % does not exist', NEW.group_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_group_product_id <> NEW.product_id THEN
    RAISE EXCEPTION 'group_id % belongs to a different product', NEW.group_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_participations_v2_group() FROM authenticated, anon, public;

CREATE TRIGGER trg_validate_participations_v2_group
  BEFORE INSERT OR UPDATE OF group_id, product_id ON participations_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_participations_v2_group();

-- =============================================================================
-- 4. RLS — product_groups_v2
-- =============================================================================

-- Admin: full access (READ; writes flow through commit_group_changes_v2 which
-- runs SECURITY DEFINER and bypasses RLS).
CREATE POLICY "admin_read_product_groups_v2"
  ON product_groups_v2 FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) = 'admin');

-- Gedu: read groups they're assigned to.
CREATE POLICY "gedus_read_assigned_groups_v2"
  ON product_groups_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gedu'
    AND id IN (
      SELECT group_id FROM gedu_group_assignments_v2 WHERE gedu_id = auth.uid()
    )
  );

-- Gamer: read own group (the one their participation links to).
CREATE POLICY "gamers_read_own_group_v2"
  ON product_groups_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gamer'
    AND id IN (
      SELECT group_id FROM participations_v2
      WHERE gamer_id = auth.uid() AND group_id IS NOT NULL
    )
  );

-- Customer: read groups for products their gamers participate in.
CREATE POLICY "customers_read_groups_via_gamers_v2"
  ON product_groups_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND id IN (
      SELECT group_id FROM participations_v2
      WHERE customer_id = auth.uid() AND group_id IS NOT NULL
    )
  );

-- =============================================================================
-- 5. RLS — gedu_group_assignments_v2
-- =============================================================================

-- Admin: read.
CREATE POLICY "admin_read_gedu_assignments_v2"
  ON gedu_group_assignments_v2 FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) = 'admin');

-- Gedu: read own assignments + colleagues on the same products.
-- A Gedu assigned to product X needs to know who their teammates are.
CREATE POLICY "gedus_read_own_and_team_assignments_v2"
  ON gedu_group_assignments_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gedu'
    AND product_id IN (
      SELECT product_id FROM gedu_group_assignments_v2 WHERE gedu_id = auth.uid()
    )
  );

-- Customer: read assignments for products their gamers participate in
-- (so the parent surface can show "your child's Gedu is X").
CREATE POLICY "customers_read_assignments_via_gamers_v2"
  ON gedu_group_assignments_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND product_id IN (
      SELECT product_id FROM participations_v2 WHERE customer_id = auth.uid()
    )
  );

-- =============================================================================
-- 6. Grants — read only; writes via commit_group_changes_v2
-- =============================================================================

REVOKE ALL ON product_groups_v2 FROM authenticated;
REVOKE ALL ON gedu_group_assignments_v2 FROM authenticated;

GRANT SELECT ON product_groups_v2 TO authenticated;
GRANT SELECT ON gedu_group_assignments_v2 TO authenticated;

-- =============================================================================
-- 7. RPC: get_product_groups_v2_with_details — admin read for the panel
-- =============================================================================
-- Returns a JSONB document with three top-level keys: groups (array of group
-- objects with their gedus and assigned participations), unassigned (array of
-- active participations with group_id IS NULL), and product_id (echoed back).
-- A single round-trip rebuilds the entire admin Groups panel.

CREATE OR REPLACE FUNCTION get_product_groups_v2_with_details(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
BEGIN
  IF (SELECT get_user_role()) <> 'admin' THEN
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
                     'id',                p.id,
                     'gamer_id',          p.gamer_id,
                     'gamer_display_name', gmp.display_name,
                     'gamer_date_of_birth', gprof.date_of_birth,
                     'gamer_gender',      gprof.gender,
                     'status',            p.status,
                     'signed_up_at',      p.signed_up_at
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

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                p.id,
             'gamer_id',          p.gamer_id,
             'gamer_display_name', gmp.display_name,
             'gamer_date_of_birth', gprof.date_of_birth,
             'gamer_gender',      gprof.gender,
             'status',            p.status,
             'signed_up_at',      p.signed_up_at
           )
           ORDER BY p.signed_up_at
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations_v2 p
    JOIN profiles gmp ON gmp.id = p.gamer_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
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

REVOKE EXECUTE ON FUNCTION get_product_groups_v2_with_details(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_product_groups_v2_with_details(UUID) TO authenticated;

-- =============================================================================
-- 8. RPC: commit_group_changes_v2 — atomic batch commit
-- =============================================================================
-- Mirrors the v1 staged-changes pattern. Inputs:
--   p_added_groups: [{tempId, name, displayOrder?, geduIds?: [...]}]
--   p_renamed_groups: [{groupId, name}]
--   p_deleted_group_ids: UUID[]
--   p_gedu_assignments_added: [{groupId, geduId}]   -- groupId may be a tempId
--   p_gedu_assignments_removed: [{groupId, geduId}]
--   p_participation_moves: [{participationId, toGroupId | null}]
--                                                    -- toGroupId may be a tempId
--                                                    -- toGroupId=null = unassign
--
-- Returns: jsonb { tempMap: { tempId: realUuid } }
--
-- Order of operations is chosen so unique constraints don't fire spuriously:
--   1. Lock the product row (serialize with participation flow)
--   2. Removes first (gedu unassigns, group deletes) so a subsequent add of the
--      same Gedu to a different group doesn't trip the (gedu_id, product_id) unique
--   3. Renames
--   4. Inserts (groups + their inline gedus)
--   5. Add Gedus to existing groups
--   6. Move participations (resolving temp IDs)

CREATE OR REPLACE FUNCTION commit_group_changes_v2(
  p_product_id                UUID,
  p_added_groups              JSONB DEFAULT '[]'::jsonb,
  p_renamed_groups            JSONB DEFAULT '[]'::jsonb,
  p_deleted_group_ids         UUID[] DEFAULT '{}',
  p_gedu_assignments_added    JSONB DEFAULT '[]'::jsonb,
  p_gedu_assignments_removed  JSONB DEFAULT '[]'::jsonb,
  p_participation_moves       JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_order      INTEGER;
  v_group           JSONB;
  v_assignment      JSONB;
  v_move            JSONB;
  v_new_id          UUID;
  v_real_to_id      UUID;
  v_resolved_group  UUID;
  v_gedu_id         UUID;
  v_gedu_id_text    TEXT;
  v_temp_map        JSONB := '{}'::jsonb;
BEGIN
  IF (SELECT get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Lock the product row. Serializes group/participation mutations on the same
  -- product so concurrent admin edits and signups don't race.
  PERFORM 1 FROM products_v2 WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(display_order), -1) + 1
    INTO v_next_order
    FROM product_groups_v2
   WHERE product_id = p_product_id;

  -- ---- 2a. Remove gedu assignments first ----------------------------------
  -- Removing before adding lets an admin "move a Gedu from group A to group B"
  -- in one batch without tripping the (gedu_id, product_id) unique constraint.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_removed) LOOP
    DELETE FROM gedu_group_assignments_v2
     WHERE group_id = (v_assignment->>'groupId')::UUID
       AND gedu_id  = (v_assignment->>'geduId')::UUID;
  END LOOP;

  -- ---- 2b. Delete groups --------------------------------------------------
  -- ON DELETE CASCADE on gedu_group_assignments_v2.group_id drops assignments.
  -- ON DELETE SET NULL on participations_v2.group_id sends gamers back to the
  -- unassigned inbox.
  IF array_length(p_deleted_group_ids, 1) > 0 THEN
    DELETE FROM product_groups_v2
     WHERE id = ANY(p_deleted_group_ids)
       AND product_id = p_product_id;
  END IF;

  -- ---- 3. Rename existing groups ------------------------------------------
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_renamed_groups) LOOP
    UPDATE product_groups_v2
       SET name = v_group->>'name'
     WHERE id = (v_group->>'groupId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  -- ---- 4. Insert new groups (with inline geduIds) -------------------------
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups_v2 (product_id, name, display_order)
    VALUES (
      p_product_id,
      v_group->>'name',
      COALESCE((v_group->>'displayOrder')::INTEGER, v_next_order)
    )
    RETURNING id INTO v_new_id;

    v_next_order := GREATEST(v_next_order, COALESCE((v_group->>'displayOrder')::INTEGER, v_next_order)) + 1;
    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);

    -- Inline Gedu assignments for this new group, if any.
    IF jsonb_typeof(v_group->'geduIds') = 'array' THEN
      FOR v_gedu_id_text IN SELECT jsonb_array_elements_text(v_group->'geduIds') LOOP
        INSERT INTO gedu_group_assignments_v2 (group_id, gedu_id, product_id)
        VALUES (v_new_id, v_gedu_id_text::UUID, p_product_id);
      END LOOP;
    END IF;
  END LOOP;

  -- ---- 5. Add Gedu assignments to existing groups -------------------------
  -- groupId may be a tempId from this same batch (newly-created group); resolve
  -- via temp_map. Or a real UUID for an existing group.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_added) LOOP
    IF v_temp_map ? (v_assignment->>'groupId') THEN
      v_resolved_group := (v_temp_map->>(v_assignment->>'groupId'))::UUID;
    ELSE
      v_resolved_group := (v_assignment->>'groupId')::UUID;
    END IF;

    v_gedu_id := (v_assignment->>'geduId')::UUID;

    -- A new group inserted in step 4 already had its inline gedus inserted —
    -- ON CONFLICT DO NOTHING avoids duplicate-key errors for callers that
    -- redundantly include the same assignment in both buckets.
    INSERT INTO gedu_group_assignments_v2 (group_id, gedu_id, product_id)
    VALUES (v_resolved_group, v_gedu_id, p_product_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ---- 6. Move participations ---------------------------------------------
  -- Each move sets participations_v2.group_id. toGroupId may be NULL
  -- (unassign, send to inbox) or a tempId (resolve via temp_map) or a real UUID.
  FOR v_move IN SELECT * FROM jsonb_array_elements(p_participation_moves) LOOP
    IF (v_move->'toGroupId') IS NULL OR jsonb_typeof(v_move->'toGroupId') = 'null' THEN
      v_real_to_id := NULL;
    ELSIF v_temp_map ? (v_move->>'toGroupId') THEN
      v_real_to_id := (v_temp_map->>(v_move->>'toGroupId'))::UUID;
    ELSE
      v_real_to_id := (v_move->>'toGroupId')::UUID;
    END IF;

    UPDATE participations_v2
       SET group_id = v_real_to_id
     WHERE id = (v_move->>'participationId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  RETURN jsonb_build_object('tempMap', v_temp_map);
END;
$$;

REVOKE EXECUTE ON FUNCTION commit_group_changes_v2(UUID, JSONB, JSONB, UUID[], JSONB, JSONB, JSONB)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION commit_group_changes_v2(UUID, JSONB, JSONB, UUID[], JSONB, JSONB, JSONB)
  TO authenticated;
