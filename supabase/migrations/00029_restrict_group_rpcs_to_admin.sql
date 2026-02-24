-- Migration: Restrict group RPCs to admin role
-- Description: Add role checks to SECURITY DEFINER RPCs so non-admin users
--              cannot call them directly via PostgREST, bypassing API route
--              authorization.

-- =============================================================================
-- 1. get_product_groups_with_details — admin only
-- =============================================================================
-- Must drop first — CREATE OR REPLACE cannot change return type columns
DROP FUNCTION IF EXISTS get_product_groups_with_details(UUID);

CREATE FUNCTION get_product_groups_with_details(p_product_id UUID)
RETURNS TABLE (
  group_id UUID,
  product_id UUID,
  gedu_id UUID,
  display_order INTEGER,
  gedu_display_name TEXT,
  gedu_email TEXT,
  gamer_id UUID,
  gamer_display_name TEXT,
  enrollment_id UUID,
  gamer_date_of_birth DATE,
  gamer_gender gender_type
) AS $$
BEGIN
  IF (SELECT get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pg.id AS group_id,
    pg.product_id,
    pg.gedu_id,
    pg.display_order,
    gp.display_name AS gedu_display_name,
    gp.email AS gedu_email,
    ge.gamer_id,
    gmp.display_name AS gamer_display_name,
    ge.id AS enrollment_id,
    gprof.date_of_birth AS gamer_date_of_birth,
    gprof.gender AS gamer_gender
  FROM product_groups pg
  JOIN profiles gp ON gp.id = pg.gedu_id
  LEFT JOIN group_enrollments ge ON ge.group_id = pg.id
  LEFT JOIN profiles gmp ON gmp.id = ge.gamer_id
  LEFT JOIN gamer_profiles gprof ON gprof.user_id = ge.gamer_id
  WHERE pg.product_id = p_product_id
  ORDER BY pg.display_order, gmp.display_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION get_product_groups_with_details(UUID) TO authenticated;

-- =============================================================================
-- 2. commit_group_changes — admin only
-- =============================================================================
CREATE OR REPLACE FUNCTION commit_group_changes(
  p_product_id UUID,
  p_added_groups JSONB DEFAULT '[]',
  p_updated_groups JSONB DEFAULT '[]',
  p_deleted_group_ids UUID[] DEFAULT '{}',
  p_enrollment_moves JSONB DEFAULT '[]'
)
RETURNS JSONB AS $$
DECLARE
  v_next_order INTEGER;
  v_group JSONB;
  v_move JSONB;
  v_new_id UUID;
  v_real_to_id UUID;
  v_group_count INTEGER;
  v_auto_hidden BOOLEAN := false;
  v_temp_map JSONB := '{}';
BEGIN
  IF (SELECT get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Verify product exists
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Compute next display_order
  SELECT COALESCE(MAX(display_order), -1) + 1
    INTO v_next_order
    FROM product_groups
   WHERE product_id = p_product_id;

  -- Step 1: Remove enrollments that are being moved (delete from source).
  -- MUST run before Step 2 — deleted groups may still have enrollments
  -- that are being moved out, and the RESTRICT FK would block deletion.
  FOR v_move IN SELECT * FROM jsonb_array_elements(p_enrollment_moves) LOOP
    DELETE FROM group_enrollments
     WHERE group_id = (v_move->>'fromGroupId')::UUID
       AND gamer_id = (v_move->>'gamerId')::UUID;
  END LOOP;

  -- Step 2: Delete groups (RESTRICT FK will abort the entire transaction
  -- if any group still has enrollments that weren't moved out in step 1)
  IF array_length(p_deleted_group_ids, 1) > 0 THEN
    DELETE FROM product_groups WHERE id = ANY(p_deleted_group_ids);
  END IF;

  -- Step 3: Insert new groups, building tempId → realId map
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups (product_id, gedu_id, display_order)
    VALUES (p_product_id, (v_group->>'geduId')::UUID, v_next_order)
    RETURNING id INTO v_new_id;

    v_next_order := v_next_order + 1;
    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);
  END LOOP;

  -- Step 4: Update existing groups (change gedu assignment)
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_updated_groups) LOOP
    UPDATE product_groups
       SET gedu_id = (v_group->>'geduId')::UUID,
           updated_at = NOW()
     WHERE id = (v_group->>'groupId')::UUID;
  END LOOP;

  -- Step 5: Insert enrollments into destination groups (resolve tempIds)
  FOR v_move IN SELECT * FROM jsonb_array_elements(p_enrollment_moves) LOOP
    IF v_temp_map ? (v_move->>'toGroupId') THEN
      v_real_to_id := (v_temp_map->> (v_move->>'toGroupId'))::UUID;
    ELSE
      v_real_to_id := (v_move->>'toGroupId')::UUID;
    END IF;

    INSERT INTO group_enrollments (group_id, gamer_id)
    VALUES (v_real_to_id, (v_move->>'gamerId')::UUID);
  END LOOP;

  -- Step 6: Auto-hide product if no groups remain
  SELECT COUNT(*) INTO v_group_count
    FROM product_groups
   WHERE product_id = p_product_id;

  IF v_group_count = 0 THEN
    UPDATE products
       SET is_visible = false
     WHERE id = p_product_id
       AND is_visible = true;

    IF FOUND THEN
      v_auto_hidden := true;
    END IF;
  END IF;

  RETURN jsonb_build_object('autoHidden', v_auto_hidden);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
