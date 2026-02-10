-- Migration: Create voice_rooms table
-- Description: Voice chat rooms for real-time gedu-to-gamer communication via Daily.co.
-- Each gedu gets one room (UNIQUE constraint on gedu_id).

-- Enum for room status
CREATE TYPE voice_room_status AS ENUM ('open', 'closed');

-- Voice rooms table
CREATE TABLE voice_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gedu_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  daily_room_name TEXT UNIQUE NOT NULL,
  status voice_room_status NOT NULL DEFAULT 'closed',
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voice_rooms_one_per_gedu UNIQUE (gedu_id)
);

-- Indexes
CREATE INDEX idx_voice_rooms_status ON voice_rooms(status) WHERE status = 'open';
CREATE INDEX idx_voice_rooms_gedu_id ON voice_rooms(gedu_id);

-- Updated timestamp trigger (reuses existing function)
CREATE TRIGGER voice_rooms_updated_at
  BEFORE UPDATE ON voice_rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE voice_rooms ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Admin: full access
CREATE POLICY "admin_full_access_voice_rooms"
  ON voice_rooms FOR ALL TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Gedu: full access to own room
CREATE POLICY "gedu_manage_own_voice_room"
  ON voice_rooms FOR ALL TO authenticated
  USING (get_user_role() = 'gedu' AND gedu_id = auth.uid())
  WITH CHECK (get_user_role() = 'gedu' AND gedu_id = auth.uid());

-- Gamer: read-only access to view room status
CREATE POLICY "gamer_view_voice_rooms"
  ON voice_rooms FOR SELECT TO authenticated
  USING (get_user_role() = 'gamer');

-- Grant permissions
GRANT SELECT ON voice_rooms TO authenticated;
GRANT INSERT, UPDATE, DELETE ON voice_rooms TO authenticated;

-- Helper function: get open voice rooms with gedu display name
CREATE OR REPLACE FUNCTION get_open_voice_rooms()
RETURNS TABLE (
  id UUID,
  gedu_id UUID,
  name TEXT,
  daily_room_name TEXT,
  status voice_room_status,
  opened_at TIMESTAMPTZ,
  gedu_display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      vr.id,
      vr.gedu_id,
      vr.name,
      vr.daily_room_name,
      vr.status,
      vr.opened_at,
      COALESCE(p.display_name, p.username, 'Educator') AS gedu_display_name
    FROM voice_rooms vr
    JOIN profiles p ON p.id = vr.gedu_id
    WHERE vr.status = 'open'
    ORDER BY vr.opened_at DESC;
END;
$$;

-- Enable Realtime for voice_rooms
ALTER PUBLICATION supabase_realtime ADD TABLE voice_rooms;

COMMENT ON TABLE voice_rooms IS 'Voice chat rooms managed by gedus for live sessions with gamers';
