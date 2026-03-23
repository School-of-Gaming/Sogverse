-- Voice rooms for real-time sessions via Daily.co, policies, and grants
-- Each voice room is linked 1:1 to a product group (schedule-driven),
-- or is a special always-open room (admin lounge, gedu lounge).

CREATE TABLE voice_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES product_groups(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL DEFAULT 'group' CHECK (room_type IN ('group', 'admin_only', 'gedu_only')),
  name TEXT NOT NULL,
  daily_room_name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Each product group maps to exactly one voice room
CREATE UNIQUE INDEX idx_voice_rooms_group ON voice_rooms(group_id) WHERE group_id IS NOT NULL;

-- Only one admin-only and one gedu-only room
CREATE UNIQUE INDEX idx_voice_rooms_admin_only ON voice_rooms(room_type) WHERE room_type = 'admin_only';
CREATE UNIQUE INDEX idx_voice_rooms_gedu_only ON voice_rooms(room_type) WHERE room_type = 'gedu_only';

CREATE INDEX idx_voice_rooms_room_type ON voice_rooms(room_type);

CREATE TRIGGER voice_rooms_updated_at
  BEFORE UPDATE ON voice_rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE voice_rooms ENABLE ROW LEVEL SECURITY;

-- REPLICA IDENTITY FULL is required for Supabase Realtime to deliver
-- UPDATE/DELETE events through RLS. Without this, only INSERT events
-- are delivered because Realtime cannot evaluate RLS against old row values.
ALTER TABLE voice_rooms REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE voice_rooms;

-- =============================================================================
-- Seed special rooms (Daily.co rooms are lazily created on first join)
-- =============================================================================

INSERT INTO voice_rooms (room_type, name, daily_room_name)
VALUES
  ('admin_only', 'Admin Lounge', 'admin-lounge'),
  ('gedu_only',  'Gedu Lounge',  'gedu-lounge');

-- =============================================================================
-- get_available_voice_rooms RPC
-- Role-aware: returns only rooms the caller is allowed to see.
-- Schedule data is returned so the client can compute isOpen display state.
-- Actual join authorization is enforced server-side in the token endpoint.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_available_voice_rooms()
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
  gedu_display_name TEXT,
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
    -- Admin sees all rooms
    RETURN QUERY
      SELECT
        vr.id, vr.group_id, vr.room_type, vr.name, vr.daily_room_name,
        p.name AS product_name,
        p.day_of_week, p.start_time, p.timezone, p.duration_minutes,
        gedu_prof.display_name AS gedu_display_name,
        pg.gedu_id,
        NULL::TIMESTAMPTZ AS enrolled_at
      FROM voice_rooms vr
      LEFT JOIN product_groups pg ON pg.id = vr.group_id
      LEFT JOIN products p ON p.id = pg.product_id
      LEFT JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      ORDER BY vr.room_type, p.day_of_week, p.start_time;

  ELSIF v_role = 'gedu' THEN
    -- Gedu sees gedu lounge + groups where they are the assigned gedu
    RETURN QUERY
      SELECT
        vr.id, vr.group_id, vr.room_type, vr.name, vr.daily_room_name,
        p.name AS product_name,
        p.day_of_week, p.start_time, p.timezone, p.duration_minutes,
        gedu_prof.display_name AS gedu_display_name,
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
    -- Gamer sees group rooms where they have an active enrollment
    RETURN QUERY
      SELECT
        vr.id, vr.group_id, vr.room_type, vr.name, vr.daily_room_name,
        p.name AS product_name,
        p.day_of_week, p.start_time, p.timezone, p.duration_minutes,
        gedu_prof.display_name AS gedu_display_name,
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
  -- Customers and other roles: return nothing (empty result set)
END;
$$;

-- =============================================================================
-- RLS policies
-- =============================================================================

CREATE POLICY "admin_full_access_voice_rooms"
  ON voice_rooms FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "gedu_view_voice_rooms"
  ON voice_rooms FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gedu'
    AND (
      room_type = 'gedu_only'
      OR (room_type = 'group' AND group_id IN (
        SELECT id FROM product_groups WHERE gedu_id = auth.uid()
      ))
    )
  );

CREATE POLICY "gamer_view_enrolled_voice_rooms"
  ON voice_rooms FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gamer'
    AND room_type = 'group'
    AND group_id IN (
      SELECT ge.group_id FROM group_enrollments ge
       WHERE ge.gamer_id = auth.uid()
         AND ge.status = 'active'
    )
  );

-- =============================================================================
-- Table grants
-- =============================================================================

REVOKE ALL ON voice_rooms FROM authenticated;
GRANT SELECT ON voice_rooms TO authenticated;

-- =============================================================================
-- Function grants
-- =============================================================================

REVOKE EXECUTE ON FUNCTION get_available_voice_rooms() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_available_voice_rooms() TO authenticated;
