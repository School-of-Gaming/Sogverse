-- Fix: Set search_path on all public functions to prevent search path manipulation
-- Resolves Supabase Linter: function_search_path_mutable (9 issues)

-- 1. get_user_role (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
BEGIN
  RETURN (
    SELECT role FROM public.profiles WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 2. is_admin (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 3. update_updated_at_column (trigger, SECURITY INVOKER)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 4. get_my_gamers (SECURITY DEFINER)
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

-- 5. get_my_parents (SECURITY DEFINER)
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

-- 6. is_parent_of (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION is_parent_of(gamer_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM parent_gamer
    WHERE parent_id = auth.uid() AND gamer_id = gamer_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 7. validate_parent_gamer_roles (trigger, SECURITY INVOKER)
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

-- 8. handle_orphaned_gamer (SECURITY DEFINER)
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

-- 9. get_active_products (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_active_products()
RETURNS SETOF products AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
