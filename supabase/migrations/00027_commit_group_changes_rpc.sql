-- Migration: Atomic commit_group_changes RPC
-- Description: Wraps all group/enrollment batch operations in a single transaction
--              so partial failures roll back instead of leaving inconsistent state.

-- =============================================================================
-- 1. Atomic batch function for group changes
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
  -- Verify product exists
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Compute next display_order
  SELECT COALESCE(MAX(display_order), -1) + 1
    INTO v_next_order
    FROM product_groups
   WHERE product_id = p_product_id;

  -- Step 1: Remove enrollments that are being moved (delete from source)
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

GRANT EXECUTE ON FUNCTION commit_group_changes(UUID, JSONB, JSONB, UUID[], JSONB) TO authenticated;
