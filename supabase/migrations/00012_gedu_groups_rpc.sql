-- get_my_groups RPC
-- Returns groups for the current user based on their role:
--   admin    → all groups
--   gedu     → assigned groups only
--   gamer    → enrolled groups only (DOB/gender stripped for privacy)
--   customer → groups where the customer enrolled their gamers (DOB/gender stripped for non-own gamers)
-- Flat rows (one per gamer per group); service layer reshapes to nested.

-- Drop the old functions
DROP FUNCTION IF EXISTS get_gedu_groups();
DROP FUNCTION IF EXISTS get_my_groups();

CREATE OR REPLACE FUNCTION get_my_groups()
RETURNS TABLE (
  group_id UUID,
  product_id UUID,
  product_name TEXT,
  product_description TEXT,
  product_image_url TEXT,
  product_padlet_url TEXT,
  product_min_age INTEGER,
  product_max_age INTEGER,
  product_token_cost INTEGER,
  game_id UUID,
  game_name TEXT,
  day_of_week SMALLINT,
  start_time TIME,
  timezone TEXT,
  duration_minutes INTEGER,
  display_order INTEGER,
  gedu_id UUID,
  gedu_display_name TEXT,
  voice_room_id UUID,
  gamer_id UUID,
  gamer_display_name TEXT,
  gamer_date_of_birth DATE,
  gamer_gender TEXT,
  enrollment_id UUID,
  last_charge_session_date DATE
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
        p.image_url AS product_image_url,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        p.token_cost AS product_token_cost,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.display_name AS gedu_display_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.display_name AS gamer_display_name,
        gamer_gp.date_of_birth AS gamer_date_of_birth,
        gamer_gp.gender::TEXT AS gamer_gender,
        ge.id AS enrollment_id,
        (SELECT MAX(ec.session_date) FROM enrollment_charges ec WHERE ec.enrollment_id = ge.id) AS last_charge_session_date
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN voice_rooms vr ON vr.group_id = pg.id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      LEFT JOIN gamer_profiles gamer_gp ON gamer_gp.user_id = ge.gamer_id
      ORDER BY p.name, pg.display_order, gamer_prof.display_name;

  ELSIF v_role = 'gedu' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_url AS product_image_url,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        p.token_cost AS product_token_cost,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.display_name AS gedu_display_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.display_name AS gamer_display_name,
        gamer_gp.date_of_birth AS gamer_date_of_birth,
        gamer_gp.gender::TEXT AS gamer_gender,
        ge.id AS enrollment_id,
        (SELECT MAX(ec.session_date) FROM enrollment_charges ec WHERE ec.enrollment_id = ge.id) AS last_charge_session_date
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN voice_rooms vr ON vr.group_id = pg.id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      LEFT JOIN gamer_profiles gamer_gp ON gamer_gp.user_id = ge.gamer_id
      WHERE pg.gedu_id = auth.uid()
      ORDER BY p.name, pg.display_order, gamer_prof.display_name;

  ELSIF v_role = 'gamer' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_url AS product_image_url,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        p.token_cost AS product_token_cost,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.display_name AS gedu_display_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.display_name AS gamer_display_name,
        NULL::DATE AS gamer_date_of_birth,
        NULL::TEXT AS gamer_gender,
        ge.id AS enrollment_id,
        NULL::DATE AS last_charge_session_date
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN voice_rooms vr ON vr.group_id = pg.id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      WHERE pg.id IN (
        SELECT my_ge.group_id FROM group_enrollments my_ge
        WHERE my_ge.gamer_id = auth.uid() AND my_ge.status = 'active'
      )
      ORDER BY p.name, pg.display_order, gamer_prof.display_name;

  ELSIF v_role = 'customer' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_url AS product_image_url,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        p.token_cost AS product_token_cost,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.display_name AS gedu_display_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.display_name AS gamer_display_name,
        CASE WHEN ge.enrolled_by = auth.uid() THEN gamer_gp.date_of_birth ELSE NULL END AS gamer_date_of_birth,
        CASE WHEN ge.enrolled_by = auth.uid() THEN gamer_gp.gender::TEXT ELSE NULL END AS gamer_gender,
        ge.id AS enrollment_id,
        CASE WHEN ge.enrolled_by = auth.uid()
          THEN (SELECT MAX(ec.session_date) FROM enrollment_charges ec WHERE ec.enrollment_id = ge.id)
          ELSE NULL
        END AS last_charge_session_date
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN voice_rooms vr ON vr.group_id = pg.id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      LEFT JOIN gamer_profiles gamer_gp ON gamer_gp.user_id = ge.gamer_id
      WHERE pg.id IN (
        SELECT my_ge.group_id FROM group_enrollments my_ge
        WHERE my_ge.enrolled_by = auth.uid() AND my_ge.status = 'active'
      )
      ORDER BY p.name, pg.display_order, gamer_prof.display_name;

  ELSE
    RAISE EXCEPTION 'Role % cannot access groups', v_role
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Private by default: revoke from all roles, then grant to authenticated
REVOKE EXECUTE ON FUNCTION get_my_groups() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_groups() TO authenticated;

