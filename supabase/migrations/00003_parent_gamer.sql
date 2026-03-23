-- Parent-gamer linking, role validation, orphan cleanup, policies, and grants

CREATE TABLE parent_gamer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gamer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'parent',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_parent_gamer UNIQUE (parent_id, gamer_id),
  CONSTRAINT no_self_link CHECK (parent_id != gamer_id)
);

CREATE INDEX idx_parent_gamer_parent ON parent_gamer(parent_id);
CREATE INDEX idx_parent_gamer_gamer ON parent_gamer(gamer_id);

ALTER TABLE parent_gamer ENABLE ROW LEVEL SECURITY;

-- Validate parent is customer, gamer is gamer
CREATE OR REPLACE FUNCTION validate_parent_gamer_roles()
RETURNS TRIGGER AS $$
DECLARE
  parent_role user_role;
  gamer_role user_role;
BEGIN
  SELECT role INTO parent_role FROM profiles WHERE id = NEW.parent_id;
  SELECT role INTO gamer_role FROM profiles WHERE id = NEW.gamer_id;

  IF parent_role != 'customer' THEN
    RAISE EXCEPTION 'Parent must be a customer account, got: %', parent_role;
  END IF;

  IF gamer_role != 'gamer' THEN
    RAISE EXCEPTION 'Child must be a gamer account, got: %', gamer_role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_parent_gamer_on_insert
  BEFORE INSERT ON parent_gamer
  FOR EACH ROW
  EXECUTE FUNCTION validate_parent_gamer_roles();

-- Delete orphaned gamer when last parent is removed
CREATE OR REPLACE FUNCTION handle_orphaned_gamer()
RETURNS TRIGGER AS $$
DECLARE
  remaining_parents INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_parents
  FROM parent_gamer
  WHERE gamer_id = OLD.gamer_id;

  IF remaining_parents = 0 THEN
    DELETE FROM auth.users WHERE id = OLD.gamer_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_parent_gamer_deleted
  AFTER DELETE ON parent_gamer
  FOR EACH ROW
  EXECUTE FUNCTION handle_orphaned_gamer();

-- =============================================================================
-- Parent-gamer helper functions
-- =============================================================================

CREATE OR REPLACE FUNCTION is_parent_of(gamer_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM parent_gamer
    WHERE parent_id = auth.uid() AND gamer_id = gamer_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION get_my_gamers()
RETURNS SETOF profiles AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM profiles p
  INNER JOIN parent_gamer pg ON p.id = pg.gamer_id
  WHERE pg.parent_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION get_my_parents()
RETURNS SETOF profiles AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM profiles p
  INNER JOIN parent_gamer pg ON p.id = pg.parent_id
  WHERE pg.gamer_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================================================
-- RLS policies
-- =============================================================================

-- No INSERT policy: all linking goes through the server-side /api/gamers/create
-- route using the service-role client, which bypasses RLS entirely.

CREATE POLICY "admin_full_access_parent_gamer"
  ON parent_gamer FOR ALL TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "customers_view_own_links"
  ON parent_gamer FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'customer' AND
    parent_id = (select auth.uid())
  );

CREATE POLICY "customers_delete_own_links"
  ON parent_gamer FOR DELETE TO authenticated
  USING (
    (select get_user_role()) = 'customer' AND
    parent_id = (select auth.uid())
  );

CREATE POLICY "gamers_view_parent_links"
  ON parent_gamer FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'gamer' AND
    gamer_id = (select auth.uid())
  );

-- Parent-linked policies for tables defined in 00002.
-- These live here because they depend on parent_gamer / is_parent_of().

CREATE POLICY "parents_view_linked_gamers"
  ON profiles FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'customer' AND
    id IN (SELECT gamer_id FROM parent_gamer WHERE parent_id = (select auth.uid()))
  );

CREATE POLICY "parents_read_linked_gamer_profiles"
  ON gamer_profiles FOR SELECT TO authenticated
  USING (is_parent_of(user_id));

CREATE POLICY "parents_read_linked_gamer_minecraft"
  ON minecraft_accounts FOR SELECT TO authenticated
  USING (is_parent_of(user_id));

-- =============================================================================
-- Table grants
-- =============================================================================

REVOKE ALL ON parent_gamer FROM authenticated;
GRANT SELECT, DELETE ON parent_gamer TO authenticated;

-- =============================================================================
-- Function grants
-- =============================================================================

REVOKE EXECUTE ON FUNCTION is_parent_of(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION is_parent_of(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_my_gamers() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_gamers() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_my_parents() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_parents() TO authenticated;
