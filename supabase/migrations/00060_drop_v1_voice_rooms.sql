-- Drop the v1 voice room system entirely. The v2 voice room flow lives in
-- /api/voice/token's groupId branch and derives the Daily.co room name
-- from product_groups_v2 + the current session window on the fly — there
-- is no backing table. The v1 surface (voice_rooms + get_available_voice_rooms
-- + the lounge concept) had no remaining users by the time we cut over.
--
-- What this migration removes:
--   * get_available_voice_rooms()   — RPC that listed v1 rooms by role.
--   * voice_rooms (table)            — with its policies, indexes, and
--                                      supabase_realtime publication entry
--                                      (DROP TABLE CASCADE handles them).
--   * the voice_room_id column from get_my_groups()'s return type.
--   * the voice_rooms INSERT inside commit_group_changes().
--
-- What survives:
--   * Everything v2 (product_groups_v2, schedule_slots_v2, etc.).
--   * v1 product_groups itself — get_my_groups still joins through it for
--     the admin/gedu/customer groups pages. Only the voice surface is
--     stripped from those pages.

-- 1. RPC that depends on voice_rooms must be dropped before the table.

DROP FUNCTION IF EXISTS get_available_voice_rooms();

-- 2. Re-define get_my_groups WITHOUT the voice_room_id column. Return-type
--    change means DROP + CREATE (CREATE OR REPLACE can't change the type).
--    Logic is otherwise identical to 00059's definition (which already
--    dropped product_token_cost + last_charge_session_date) — just the
--    `LEFT JOIN voice_rooms` and the `vr.id AS voice_room_id` lines go away.

DROP FUNCTION IF EXISTS get_my_groups();

CREATE FUNCTION get_my_groups()
RETURNS TABLE (
  group_id UUID,
  product_id UUID,
  product_name TEXT,
  product_description TEXT,
  product_image_path TEXT,
  product_padlet_url TEXT,
  product_min_age INTEGER,
  product_max_age INTEGER,
  game_id UUID,
  game_name TEXT,
  day_of_week SMALLINT,
  start_time TIME,
  timezone TEXT,
  duration_minutes INTEGER,
  display_order INTEGER,
  gedu_id UUID,
  gedu_first_name TEXT,
  gamer_id UUID,
  gamer_first_name TEXT,
  gamer_date_of_birth DATE,
  gamer_gender TEXT,
  enrollment_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role TEXT := get_user_role();
BEGIN
  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_path AS product_image_path,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
        gamer_gp.date_of_birth AS gamer_date_of_birth,
        gamer_gp.gender::TEXT AS gamer_gender,
        ge.id AS enrollment_id
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      LEFT JOIN gamer_profiles gamer_gp ON gamer_gp.user_id = ge.gamer_id
      ORDER BY p.name, pg.display_order, gamer_prof.first_name;

  ELSIF v_role = 'gedu' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_path AS product_image_path,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
        gamer_gp.date_of_birth AS gamer_date_of_birth,
        gamer_gp.gender::TEXT AS gamer_gender,
        ge.id AS enrollment_id
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      LEFT JOIN gamer_profiles gamer_gp ON gamer_gp.user_id = ge.gamer_id
      WHERE pg.gedu_id = auth.uid()
      ORDER BY p.name, pg.display_order, gamer_prof.first_name;

  ELSIF v_role = 'gamer' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_path AS product_image_path,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
        NULL::DATE AS gamer_date_of_birth,
        NULL::TEXT AS gamer_gender,
        ge.id AS enrollment_id
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      WHERE pg.id IN (
        SELECT my_ge.group_id FROM group_enrollments my_ge
        WHERE my_ge.gamer_id = auth.uid() AND my_ge.status = 'active'
      )
      ORDER BY p.name, pg.display_order, gamer_prof.first_name;

  ELSIF v_role = 'customer' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_path AS product_image_path,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
        CASE WHEN ge.enrolled_by = auth.uid() THEN gamer_gp.date_of_birth ELSE NULL END AS gamer_date_of_birth,
        CASE WHEN ge.enrolled_by = auth.uid() THEN gamer_gp.gender::TEXT ELSE NULL END AS gamer_gender,
        ge.id AS enrollment_id
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      LEFT JOIN gamer_profiles gamer_gp ON gamer_gp.user_id = ge.gamer_id
      WHERE pg.id IN (
        SELECT my_ge.group_id FROM group_enrollments my_ge
        WHERE my_ge.enrolled_by = auth.uid() AND my_ge.status = 'active'
      )
      ORDER BY p.name, pg.display_order, gamer_prof.first_name;

  ELSE
    RAISE EXCEPTION 'Role % cannot access groups', v_role
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_my_groups() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_my_groups() TO authenticated;

-- 3. Drop the table. CASCADE removes RLS policies, indexes, and the
--    supabase_realtime publication membership in one step. The FK from
--    voice_rooms.group_id → product_groups went the other way, so dropping
--    voice_rooms is safe for product_groups.

DROP TABLE IF EXISTS voice_rooms CASCADE;

-- 4. commit_group_changes used to INSERT a voice_rooms row alongside each
--    new product_group. With the table gone the function would error on
--    every group add — rewrite it without the INSERT. Everything else
--    (auto-hide on last group removed, enrollment moves, CASCADE-friendly
--    delete) is unchanged.

CREATE OR REPLACE FUNCTION commit_group_changes(
  p_product_id UUID,
  p_added_groups JSONB DEFAULT '[]'::jsonb,
  p_updated_groups JSONB DEFAULT '[]'::jsonb,
  p_deleted_group_ids UUID[] DEFAULT '{}'::uuid[],
  p_enrollment_moves JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  SELECT COALESCE(MAX(display_order), -1) + 1
    INTO v_next_order
    FROM product_groups
   WHERE product_id = p_product_id;

  -- Step 1: Insert new groups, building tempId → realId map.
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups (product_id, gedu_id, display_order)
    VALUES (p_product_id, (v_group->>'geduId')::UUID, v_next_order)
    RETURNING id INTO v_new_id;

    v_next_order := v_next_order + 1;
    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);
  END LOOP;

  -- Step 2: Update existing groups (change gedu assignment).
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_updated_groups) LOOP
    UPDATE product_groups
       SET gedu_id = (v_group->>'geduId')::UUID,
           updated_at = NOW()
     WHERE id = (v_group->>'groupId')::UUID;
  END LOOP;

  -- Step 3: Move enrollments via UPDATE (preserves enrollment_id + metadata).
  FOR v_move IN SELECT * FROM jsonb_array_elements(p_enrollment_moves) LOOP
    IF v_temp_map ? (v_move->>'toGroupId') THEN
      v_real_to_id := (v_temp_map->> (v_move->>'toGroupId'))::UUID;
    ELSE
      v_real_to_id := (v_move->>'toGroupId')::UUID;
    END IF;

    UPDATE group_enrollments
       SET group_id = v_real_to_id
     WHERE group_id = (v_move->>'fromGroupId')::UUID
       AND gamer_id = (v_move->>'gamerId')::UUID;
  END LOOP;

  -- Step 4: Delete groups (clean up unenrolled enrollments first so the FK
  -- allows it; active enrollments would have been moved in step 3).
  IF array_length(p_deleted_group_ids, 1) > 0 THEN
    DELETE FROM group_enrollments
     WHERE group_id = ANY(p_deleted_group_ids)
       AND status = 'unenrolled';

    DELETE FROM product_groups WHERE id = ANY(p_deleted_group_ids);
  END IF;

  -- Step 5: Auto-hide product if no groups remain.
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

  RETURN jsonb_build_object('autoHidden', v_auto_hidden, 'tempMap', v_temp_map);
END;
$$;
