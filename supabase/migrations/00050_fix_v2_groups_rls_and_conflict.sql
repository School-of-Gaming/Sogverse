-- Migration: Fix v2 groups RLS + commit RPC ON CONFLICT target
-- Description: Three fixes for issues caught by db tests on the v2 groups
--              feature shipped in 00049:
--
--   1. commit_group_changes_v2 used `ON CONFLICT DO NOTHING` which silenced
--      ANY conflict — including the UNIQUE(gedu_id, product_id) violation
--      that should fire when an admin tries to assign the same Gedu to two
--      groups in one product. The legitimate de-dup is only the
--      (group_id, gedu_id) primary-key conflict (when the caller redundantly
--      lists the same pair). Make the conflict target explicit.
--
--   2. Admin RLS policies on product_groups_v2 and gedu_group_assignments_v2
--      were declared `FOR SELECT` instead of the `FOR ALL ... WITH CHECK`
--      pattern used by every other working v2 admin policy in the codebase.
--      Adminauth queries returned empty even though the data was there.
--      Aligning with the proven pattern.
--
--   3. The gedu policy on gedu_group_assignments_v2 referenced the same
--      table inside its USING clause ("see own + teammates on the same
--      product"), which is recursive and returns null/empty under RLS.
--      Replace with the simpler "see own only" policy. Teammate visibility
--      can come back later via a SECURITY DEFINER helper if a real surface
--      needs it; nothing in the product surfaces this today.

-- =============================================================================
-- 1. RPC: explicit ON CONFLICT target so cross-group unique violations fire
-- =============================================================================

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

  PERFORM 1 FROM products_v2 WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(display_order), -1) + 1
    INTO v_next_order
    FROM product_groups_v2
   WHERE product_id = p_product_id;

  -- Removes first so an admin can move a Gedu from group A to B in one batch.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_removed) LOOP
    DELETE FROM gedu_group_assignments_v2
     WHERE group_id = (v_assignment->>'groupId')::UUID
       AND gedu_id  = (v_assignment->>'geduId')::UUID;
  END LOOP;

  IF array_length(p_deleted_group_ids, 1) > 0 THEN
    DELETE FROM product_groups_v2
     WHERE id = ANY(p_deleted_group_ids)
       AND product_id = p_product_id;
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_renamed_groups) LOOP
    UPDATE product_groups_v2
       SET name = v_group->>'name'
     WHERE id = (v_group->>'groupId')::UUID
       AND product_id = p_product_id;
  END LOOP;

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

    IF jsonb_typeof(v_group->'geduIds') = 'array' THEN
      FOR v_gedu_id_text IN SELECT jsonb_array_elements_text(v_group->'geduIds') LOOP
        INSERT INTO gedu_group_assignments_v2 (group_id, gedu_id, product_id)
        VALUES (v_new_id, v_gedu_id_text::UUID, p_product_id);
      END LOOP;
    END IF;
  END LOOP;

  -- Step 5: explicit conflict target so the (gedu_id, product_id) UNIQUE
  -- violation propagates as an error (an admin trying to assign the same
  -- Gedu to two groups in one product should fail). Only the (group_id,
  -- gedu_id) primary-key conflict — which means the caller redundantly listed
  -- the same assignment also covered by step 4's inline gedus — is silenced.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_added) LOOP
    IF v_temp_map ? (v_assignment->>'groupId') THEN
      v_resolved_group := (v_temp_map->>(v_assignment->>'groupId'))::UUID;
    ELSE
      v_resolved_group := (v_assignment->>'groupId')::UUID;
    END IF;

    v_gedu_id := (v_assignment->>'geduId')::UUID;

    INSERT INTO gedu_group_assignments_v2 (group_id, gedu_id, product_id)
    VALUES (v_resolved_group, v_gedu_id, p_product_id)
    ON CONFLICT (group_id, gedu_id) DO NOTHING;
  END LOOP;

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

-- Grant stays the same as 00049; CREATE OR REPLACE preserves the function's
-- existing privileges.

-- =============================================================================
-- 2. Admin RLS — switch to FOR ALL ... USING ... WITH CHECK
-- =============================================================================
-- Every working v2 admin policy uses this pattern. The FOR SELECT variant in
-- 00049 returned empty for adminAuth queries even though the data was there.
-- Writes are still blocked at grant level (REVOKE ALL + GRANT SELECT) — the
-- WITH CHECK clause is moot in practice but matches the proven shape.

DROP POLICY IF EXISTS "admin_read_product_groups_v2" ON product_groups_v2;
CREATE POLICY "admin_full_access_product_groups_v2"
  ON product_groups_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

DROP POLICY IF EXISTS "admin_read_gedu_assignments_v2" ON gedu_group_assignments_v2;
CREATE POLICY "admin_full_access_gedu_assignments_v2"
  ON gedu_group_assignments_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- =============================================================================
-- 3. Gedu RLS on gedu_group_assignments_v2 — drop the recursive policy
-- =============================================================================
-- The original policy referenced gedu_group_assignments_v2 inside its own
-- USING clause to grant teammate visibility ("see assignments on products you
-- teach"). RLS doesn't recurse safely here — the inner subquery applies the
-- same policy, returning empty. Replace with a simpler self-only policy.
-- Adding teammate visibility back would need a SECURITY DEFINER helper that
-- bypasses RLS to enumerate the gedu's products; nothing in the product
-- surfaces it today, so it's left out for now.

DROP POLICY IF EXISTS "gedus_read_own_and_team_assignments_v2"
  ON gedu_group_assignments_v2;

CREATE POLICY "gedus_read_own_assignments_v2"
  ON gedu_group_assignments_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gedu'
    AND gedu_id = (SELECT auth.uid())
  );
