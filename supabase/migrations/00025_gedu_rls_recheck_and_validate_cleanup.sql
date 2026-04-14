-- Hardening follow-ups to migration 00024.
--
-- 1. gedu_manage_own_locations: re-check role in USING, not just WITH CHECK.
--    Without this, a former gedu (role flipped to another role) could still
--    SELECT and DELETE their orphaned coverage rows. Per the "actor AND target"
--    rule in CLAUDE.md, both sides need to be authorized on every operation.
--
-- 2. validate_product_location: the "location does not exist" branch is
--    unreachable — the REFERENCES locations(id) FK rejects the row first at
--    a lower level. Dropped to keep the trigger readable.

-- =============================================================================
-- 1. gedu_manage_own_locations policy: recheck role in USING
-- =============================================================================

DROP POLICY IF EXISTS "gedu_manage_own_locations" ON gedu_locations;

CREATE POLICY "gedu_manage_own_locations"
  ON gedu_locations FOR ALL TO authenticated
  USING (
    gedu_id = (SELECT auth.uid())
    AND (SELECT get_user_role()) = 'gedu'
  )
  WITH CHECK (
    gedu_id = (SELECT auth.uid())
    AND (SELECT get_user_role()) = 'gedu'
  );

-- =============================================================================
-- 2. validate_product_location: drop unreachable "missing FK" branch
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_product_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  loc_type public.location_type;
BEGIN
  IF NEW.location_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT type INTO loc_type FROM public.locations WHERE id = NEW.location_id;

  IF loc_type <> 'site' THEN
    RAISE EXCEPTION 'Product location must be a site (leaf), got %', loc_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_product_location() FROM authenticated, anon, public;
