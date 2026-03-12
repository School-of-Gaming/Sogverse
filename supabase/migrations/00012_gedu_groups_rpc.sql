-- get_gedu_groups RPC
-- Returns all groups for the current gedu with product info and enrolled gamers.
-- Flat rows (one per gamer per group); service layer reshapes to nested.

CREATE OR REPLACE FUNCTION get_gedu_groups()
RETURNS TABLE (
  group_id UUID,
  product_id UUID,
  product_name TEXT,
  product_image_url TEXT,
  day_of_week SMALLINT,
  start_time TIME,
  timezone TEXT,
  duration_minutes INTEGER,
  display_order INTEGER,
  gedu_display_name TEXT,
  gamer_id UUID,
  gamer_display_name TEXT,
  gamer_date_of_birth DATE,
  gamer_gender TEXT,
  enrollment_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF get_user_role() <> 'gedu' THEN
    RAISE EXCEPTION 'Only gedus can call this function'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      pg.id AS group_id,
      pg.product_id,
      p.name AS product_name,
      p.image_url AS product_image_url,
      p.day_of_week,
      p.start_time,
      p.timezone,
      p.duration_minutes,
      pg.display_order,
      gedu_prof.display_name AS gedu_display_name,
      ge.gamer_id,
      gamer_prof.display_name AS gamer_display_name,
      gamer_gp.date_of_birth AS gamer_date_of_birth,
      gamer_gp.gender::TEXT AS gamer_gender,
      ge.id AS enrollment_id
    FROM product_groups pg
    JOIN products p ON p.id = pg.product_id
    JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
    LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
    LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
    LEFT JOIN gamer_profiles gamer_gp ON gamer_gp.user_id = ge.gamer_id
    WHERE pg.gedu_id = auth.uid()
    ORDER BY p.name, pg.display_order, gamer_prof.display_name;
END;
$$;

-- Private by default: revoke from all roles, then grant to authenticated
REVOKE EXECUTE ON FUNCTION get_gedu_groups() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_gedu_groups() TO authenticated;
