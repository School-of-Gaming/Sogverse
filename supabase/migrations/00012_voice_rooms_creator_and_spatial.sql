-- Migration: Rename gedu_id → creator_id and update RLS/RPC for spatial voice rooms
-- Description: Allows admins and gedus to create voice rooms. All roles can join any open room.
-- NOTE: Written idempotently so it can be re-run safely if partially applied.

-- 1. Rename column (idempotent: only if gedu_id still exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voice_rooms' AND column_name = 'gedu_id'
  ) THEN
    ALTER TABLE voice_rooms RENAME COLUMN gedu_id TO creator_id;
  END IF;
END $$;

-- 2. Drop old constraint and index, recreate with new names
ALTER TABLE voice_rooms DROP CONSTRAINT IF EXISTS voice_rooms_one_per_gedu;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voice_rooms_one_per_creator'
  ) THEN
    ALTER TABLE voice_rooms ADD CONSTRAINT voice_rooms_one_per_creator UNIQUE (creator_id);
  END IF;
END $$;

DROP INDEX IF EXISTS idx_voice_rooms_gedu_id;
CREATE INDEX IF NOT EXISTS idx_voice_rooms_creator_id ON voice_rooms(creator_id);

-- 3. Drop old RLS policies (safe to re-run)
DROP POLICY IF EXISTS "admin_full_access_voice_rooms" ON voice_rooms;
DROP POLICY IF EXISTS "gedu_manage_own_voice_room" ON voice_rooms;
DROP POLICY IF EXISTS "gamer_view_voice_rooms" ON voice_rooms;
DROP POLICY IF EXISTS "gedu_view_all_voice_rooms" ON voice_rooms;

-- 4. Recreate RLS policies with updated column name

-- Admin: full access
CREATE POLICY "admin_full_access_voice_rooms"
  ON voice_rooms FOR ALL TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Gedu: full access to own room
CREATE POLICY "gedu_manage_own_voice_room"
  ON voice_rooms FOR ALL TO authenticated
  USING (get_user_role() = 'gedu' AND creator_id = auth.uid())
  WITH CHECK (get_user_role() = 'gedu' AND creator_id = auth.uid());

-- Gedu: can view all voice rooms (to browse and join other rooms)
CREATE POLICY "gedu_view_all_voice_rooms"
  ON voice_rooms FOR SELECT TO authenticated
  USING (get_user_role() = 'gedu');

-- Gamer: read-only access to view room status
CREATE POLICY "gamer_view_voice_rooms"
  ON voice_rooms FOR SELECT TO authenticated
  USING (get_user_role() = 'gamer');

-- 5. Drop and recreate the RPC function with updated column names
DROP FUNCTION IF EXISTS get_open_voice_rooms();
CREATE FUNCTION get_open_voice_rooms()
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
      COALESCE(p.display_name, p.username, 'Host') AS creator_display_name,
      p.role::TEXT AS creator_role
    FROM voice_rooms vr
    JOIN profiles p ON p.id = vr.creator_id
    WHERE vr.status = 'open'
    ORDER BY vr.opened_at DESC;
END;
$$;

COMMENT ON TABLE voice_rooms IS 'Voice chat rooms for live spatial sessions. Admins and gedus can create rooms; all roles can join.';
