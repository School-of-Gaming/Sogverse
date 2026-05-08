-- Replace profiles.display_name with first_name (NOT NULL) + last_name (nullable).
-- Backfill: first_name = display_name, last_name = '' (empty string).
-- Drop display_name. Rename RPC return-column aliases gedu_display_name →
-- gedu_first_name, gamer_display_name → gamer_first_name; same for the JSONB
-- keys returned by get_product_groups_v2_with_details.

-- =============================================================================
-- 1. Add nullable columns, backfill, then constrain
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN first_name TEXT,
  ADD COLUMN last_name  TEXT;

UPDATE profiles
   SET first_name = display_name,
       last_name  = '';

ALTER TABLE profiles ALTER COLUMN first_name SET NOT NULL;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_first_name_len
  CHECK (char_length(first_name) BETWEEN 2 AND 32);

ALTER TABLE profiles
  ADD CONSTRAINT profiles_last_name_len
  CHECK (last_name IS NULL OR char_length(last_name) <= 32);

-- =============================================================================
-- 2. Swap column-level UPDATE grants
-- =============================================================================

REVOKE UPDATE (display_name) ON profiles FROM authenticated;
GRANT  UPDATE (first_name, last_name) ON profiles TO authenticated;

-- =============================================================================
-- 3. handle_new_user trigger — read first_name/last_name from metadata,
--    fall back to display_name (legacy invite links) by using it whole as
--    first_name. Keeps backward compat without splitting into a 1-char first.
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  profile_first_name TEXT;
  profile_last_name  TEXT;
BEGIN
  profile_first_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
    'New User'
  );

  profile_last_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    ''
  );

  INSERT INTO public.profiles (id, email, role, first_name, last_name)
  VALUES (NEW.id, NEW.email, 'customer', profile_first_name, profile_last_name);

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- =============================================================================
-- 4. Rewrite RPCs that read profiles.display_name. Aliases that previously
--    leaked the legacy column name (gedu_display_name, gamer_display_name)
--    are renamed to gedu_first_name / gamer_first_name. Return-table signatures
--    change, so DROP + CREATE (CREATE OR REPLACE can't change return type).
--    Re-issue grants — DROP wipes them.
-- =============================================================================

-- get_my_groups (last defined in 00029) ---------------------------------------

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
  product_token_cost INTEGER,
  game_id UUID,
  game_name TEXT,
  day_of_week SMALLINT,
  start_time TIME,
  timezone TEXT,
  duration_minutes INTEGER,
  display_order INTEGER,
  gedu_id UUID,
  gedu_first_name TEXT,
  voice_room_id UUID,
  gamer_id UUID,
  gamer_first_name TEXT,
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
        p.image_path AS product_image_path,
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
        gedu_prof.first_name AS gedu_first_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
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
        p.token_cost AS product_token_cost,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
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
        p.token_cost AS product_token_cost,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
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
        p.token_cost AS product_token_cost,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
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
      ORDER BY p.name, pg.display_order, gamer_prof.first_name;

  ELSE
    RAISE EXCEPTION 'Role % cannot access groups', v_role
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_my_groups() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_groups() TO authenticated;

-- get_product_groups_with_details (last defined in 00006) ---------------------

DROP FUNCTION IF EXISTS get_product_groups_with_details(UUID);

CREATE FUNCTION get_product_groups_with_details(p_product_id UUID)
RETURNS TABLE (
  group_id UUID,
  product_id UUID,
  gedu_id UUID,
  display_order INTEGER,
  gedu_first_name TEXT,
  gedu_email TEXT,
  gamer_id UUID,
  gamer_first_name TEXT,
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
    gp.first_name AS gedu_first_name,
    gp.email AS gedu_email,
    ge.gamer_id,
    gmp.first_name AS gamer_first_name,
    ge.id AS enrollment_id,
    gprof.date_of_birth AS gamer_date_of_birth,
    gprof.gender AS gamer_gender
  FROM product_groups pg
  JOIN profiles gp ON gp.id = pg.gedu_id
  LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
  LEFT JOIN profiles gmp ON gmp.id = ge.gamer_id
  LEFT JOIN gamer_profiles gprof ON gprof.user_id = ge.gamer_id
  WHERE pg.product_id = p_product_id
  ORDER BY pg.display_order, gmp.first_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE EXECUTE ON FUNCTION get_product_groups_with_details(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_product_groups_with_details(UUID) TO authenticated;

-- get_enrollment_groups (last defined in 00006) -------------------------------

DROP FUNCTION IF EXISTS get_enrollment_groups(UUID);

CREATE FUNCTION get_enrollment_groups(p_product_id UUID)
RETURNS TABLE(
  group_id UUID,
  gedu_first_name TEXT,
  gamer_count BIGINT,
  min_gamer_age INTEGER,
  max_gamer_age INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM products WHERE id = p_product_id AND is_visible = true
  ) THEN
    RAISE EXCEPTION 'Product not found or not visible';
  END IF;

  RETURN QUERY
  SELECT
    pg.id AS group_id,
    gedu.first_name AS gedu_first_name,
    COUNT(ge.id) AS gamer_count,
    MIN(EXTRACT(YEAR FROM AGE(gprof.date_of_birth))::INTEGER) AS min_gamer_age,
    MAX(EXTRACT(YEAR FROM AGE(gprof.date_of_birth))::INTEGER) AS max_gamer_age
  FROM product_groups pg
  JOIN profiles gedu ON gedu.id = pg.gedu_id
  LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
  LEFT JOIN gamer_profiles gprof ON gprof.user_id = ge.gamer_id
  WHERE pg.product_id = p_product_id
  GROUP BY pg.id, gedu.first_name, pg.display_order
  ORDER BY pg.display_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_enrollment_groups(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_enrollment_groups(UUID) TO authenticated;

-- get_available_voice_rooms (last defined in 00007) ---------------------------

DROP FUNCTION IF EXISTS get_available_voice_rooms();

CREATE FUNCTION get_available_voice_rooms()
RETURNS TABLE (
  id UUID,
  group_id UUID,
  room_type TEXT,
  name TEXT,
  daily_room_name TEXT,
  product_name TEXT,
  day_of_week SMALLINT,
  start_time TIME,
  timezone TEXT,
  duration_minutes INTEGER,
  gedu_first_name TEXT,
  gedu_id UUID,
  enrolled_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  v_role := get_user_role();

  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT
        vr.id, vr.group_id, vr.room_type, vr.name, vr.daily_room_name,
        p.name AS product_name,
        p.day_of_week, p.start_time, p.timezone, p.duration_minutes,
        gedu_prof.first_name AS gedu_first_name,
        pg.gedu_id,
        NULL::TIMESTAMPTZ AS enrolled_at
      FROM voice_rooms vr
      LEFT JOIN product_groups pg ON pg.id = vr.group_id
      LEFT JOIN products p ON p.id = pg.product_id
      LEFT JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      ORDER BY vr.room_type, p.day_of_week, p.start_time;

  ELSIF v_role = 'gedu' THEN
    RETURN QUERY
      SELECT
        vr.id, vr.group_id, vr.room_type, vr.name, vr.daily_room_name,
        p.name AS product_name,
        p.day_of_week, p.start_time, p.timezone, p.duration_minutes,
        gedu_prof.first_name AS gedu_first_name,
        pg.gedu_id,
        NULL::TIMESTAMPTZ AS enrolled_at
      FROM voice_rooms vr
      LEFT JOIN product_groups pg ON pg.id = vr.group_id
      LEFT JOIN products p ON p.id = pg.product_id
      LEFT JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      WHERE vr.room_type = 'gedu_only'
         OR (vr.room_type = 'group' AND pg.gedu_id = v_uid)
      ORDER BY vr.room_type, p.day_of_week, p.start_time;

  ELSIF v_role = 'gamer' THEN
    RETURN QUERY
      SELECT
        vr.id, vr.group_id, vr.room_type, vr.name, vr.daily_room_name,
        p.name AS product_name,
        p.day_of_week, p.start_time, p.timezone, p.duration_minutes,
        gedu_prof.first_name AS gedu_first_name,
        pg.gedu_id,
        ge.created_at AS enrolled_at
      FROM voice_rooms vr
      JOIN product_groups pg ON pg.id = vr.group_id
      JOIN products p ON p.id = pg.product_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      JOIN group_enrollments ge ON ge.group_id = vr.group_id
        AND ge.gamer_id = v_uid
        AND ge.status = 'active'
      WHERE vr.room_type = 'group'
      ORDER BY p.day_of_week, p.start_time;

  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_available_voice_rooms() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_available_voice_rooms() TO authenticated;

-- get_product_groups_v2_with_details (last defined in 00049) ------------------
-- Returns JSONB; the JSON keys `display_name` (gedu) and `gamer_display_name`
-- are renamed to `first_name` and `gamer_first_name`. Function signature is
-- unchanged so CREATE OR REPLACE works and the existing grant persists.

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

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                  p.id,
             'gamer_id',            p.gamer_id,
             'gamer_first_name',    gmp.first_name,
             'gamer_date_of_birth', gprof.date_of_birth,
             'gamer_gender',        gprof.gender,
             'status',              p.status,
             'signed_up_at',        p.signed_up_at
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

-- =============================================================================
-- 5. Drop the legacy column. RPCs above no longer reference it.
-- =============================================================================

ALTER TABLE profiles DROP COLUMN display_name;
