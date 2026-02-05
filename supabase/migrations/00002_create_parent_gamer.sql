-- Migration: Create parent_gamer junction table
-- Description: Links customer (parent) accounts to gamer (child) accounts

CREATE TABLE parent_gamer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gamer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'parent',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate links
  CONSTRAINT unique_parent_gamer UNIQUE (parent_id, gamer_id),

  -- Prevent self-linking
  CONSTRAINT no_self_link CHECK (parent_id != gamer_id)
);

-- Indexes for efficient lookups
CREATE INDEX idx_parent_gamer_parent ON parent_gamer(parent_id);
CREATE INDEX idx_parent_gamer_gamer ON parent_gamer(gamer_id);

-- Trigger to validate parent is a customer and gamer is a gamer
CREATE OR REPLACE FUNCTION validate_parent_gamer_roles()
RETURNS TRIGGER AS $$
DECLARE
  parent_role user_role;
  gamer_role user_role;
BEGIN
  -- Get roles
  SELECT role INTO parent_role FROM profiles WHERE id = NEW.parent_id;
  SELECT role INTO gamer_role FROM profiles WHERE id = NEW.gamer_id;

  -- Validate parent is a customer
  IF parent_role != 'customer' THEN
    RAISE EXCEPTION 'Parent must be a customer account, got: %', parent_role;
  END IF;

  -- Validate gamer is a gamer
  IF gamer_role != 'gamer' THEN
    RAISE EXCEPTION 'Child must be a gamer account, got: %', gamer_role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_parent_gamer_on_insert
  BEFORE INSERT ON parent_gamer
  FOR EACH ROW
  EXECUTE FUNCTION validate_parent_gamer_roles();

-- Helper function to check if current user is parent of a gamer
CREATE OR REPLACE FUNCTION is_parent_of(gamer_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM parent_gamer
    WHERE parent_id = auth.uid() AND gamer_id = gamer_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to get all gamers linked to current user (parent)
CREATE OR REPLACE FUNCTION get_my_gamers()
RETURNS SETOF profiles AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM profiles p
  INNER JOIN parent_gamer pg ON p.id = pg.gamer_id
  WHERE pg.parent_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to get all parents of current user (gamer)
CREATE OR REPLACE FUNCTION get_my_parents()
RETURNS SETOF profiles AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM profiles p
  INNER JOIN parent_gamer pg ON p.id = pg.parent_id
  WHERE pg.gamer_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Trigger to delete orphaned gamers when last parent is removed
CREATE OR REPLACE FUNCTION handle_orphaned_gamer()
RETURNS TRIGGER AS $$
DECLARE
  remaining_parents INTEGER;
BEGIN
  -- Count remaining parents for this gamer
  SELECT COUNT(*) INTO remaining_parents
  FROM parent_gamer
  WHERE gamer_id = OLD.gamer_id;

  -- If no parents remain, delete the gamer account
  IF remaining_parents = 0 THEN
    DELETE FROM auth.users WHERE id = OLD.gamer_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_parent_gamer_deleted
  AFTER DELETE ON parent_gamer
  FOR EACH ROW
  EXECUTE FUNCTION handle_orphaned_gamer();

COMMENT ON TABLE parent_gamer IS 'Junction table linking parent (customer) accounts to child (gamer) accounts';
COMMENT ON COLUMN parent_gamer.relationship IS 'Relationship type (parent, guardian, etc.)';
