-- Voice rooms for real-time sessions via Daily.co

CREATE TYPE voice_room_status AS ENUM ('open', 'closed');

CREATE TABLE voice_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  daily_room_name TEXT UNIQUE NOT NULL,
  status voice_room_status NOT NULL DEFAULT 'closed',
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT voice_rooms_one_per_creator UNIQUE (creator_id)
);

CREATE INDEX idx_voice_rooms_status ON voice_rooms(status) WHERE status = 'open';
CREATE INDEX idx_voice_rooms_creator_id ON voice_rooms(creator_id);

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
-- get_open_voice_rooms RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION get_open_voice_rooms()
RETURNS TABLE (
  id UUID,
  creator_id UUID,
  name TEXT,
  daily_room_name TEXT,
  status voice_room_status,
  opened_at TIMESTAMPTZ,
  creator_display_name TEXT,
  creator_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      vr.id,
      vr.creator_id,
      vr.name,
      vr.daily_room_name,
      vr.status,
      vr.opened_at,
      p.display_name AS creator_display_name,
      p.role::TEXT AS creator_role
    FROM voice_rooms vr
    JOIN profiles p ON p.id = vr.creator_id
    WHERE vr.status = 'open'
    ORDER BY vr.opened_at DESC;
END;
$$;
