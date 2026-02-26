-- =============================================================================
-- Update get_customer_enrollments to return last_charge_session_date
-- =============================================================================
-- The client needs the latest charge's session_date to determine whether the
-- charged session has already started (and therefore whether a refund is possible).

DROP FUNCTION IF EXISTS get_customer_enrollments(UUID);

CREATE OR REPLACE FUNCTION get_customer_enrollments(p_customer_id UUID)
RETURNS TABLE(
  enrollment_id UUID,
  group_id UUID,
  gamer_id UUID,
  gamer_display_name TEXT,
  status TEXT,
  enrolled_at TIMESTAMPTZ,
  last_charged_at TIMESTAMPTZ,
  unenrolled_at TIMESTAMPTZ,
  product_id UUID,
  product_name TEXT,
  product_image_url TEXT,
  product_token_cost INTEGER,
  product_day_of_week SMALLINT,
  product_start_time TIME,
  product_timezone TEXT,
  product_duration_minutes INTEGER,
  gedu_display_name TEXT,
  last_charge_session_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ge.id AS enrollment_id,
    ge.group_id,
    ge.gamer_id,
    gp.display_name AS gamer_display_name,
    ge.status,
    ge.created_at AS enrolled_at,
    ge.last_charged_at,
    ge.unenrolled_at,
    p.id AS product_id,
    p.name AS product_name,
    p.image_url AS product_image_url,
    p.token_cost AS product_token_cost,
    p.day_of_week AS product_day_of_week,
    p.start_time AS product_start_time,
    p.timezone AS product_timezone,
    p.duration_minutes AS product_duration_minutes,
    gedu.display_name AS gedu_display_name,
    (SELECT ec.session_date
       FROM enrollment_charges ec
      WHERE ec.enrollment_id = ge.id
      ORDER BY ec.session_date DESC
      LIMIT 1
    ) AS last_charge_session_date
  FROM group_enrollments ge
  JOIN product_groups pg ON pg.id = ge.group_id
  JOIN products p ON p.id = pg.product_id
  JOIN profiles gp ON gp.id = ge.gamer_id
  JOIN profiles gedu ON gedu.id = pg.gedu_id
  WHERE ge.enrolled_by = p_customer_id
  ORDER BY
    CASE ge.status WHEN 'active' THEN 0 ELSE 1 END,
    ge.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_enrollments(UUID) TO authenticated;
