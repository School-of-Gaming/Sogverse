-- Tighten site_details_v2 read access. Migration 00030 made the row
-- (full street address + member-visible site notes) anon-readable on
-- the rationale that anonymous browsers needed the address before
-- signing up. The browse / detail surfaces actually only need the
-- locations.name + parent.name (made anon-readable in 00037), which is
-- enough to render "Tapiolan koulu, Espoo" on a card. Exact addresses
-- and operational notes are member territory and should not be
-- harvested by anyone hitting PostgREST anonymously.
--
-- Today: admin (full access) + any gedu can read. There is no v2
-- enrollment / participation table yet, so we can't write a
-- "purchasing customer" predicate. When v2 enrollments land, extend
-- this policy with a customer-read clause keyed on
--   EXISTS (SELECT 1 FROM <participations_v2 join chain>
--           WHERE parent_id = auth.uid() AND product.location_id = <site>)
-- so families that have purchased can see the address + member notes.
-- Until that happens, the post-purchase address is delivered out-of-band
-- (admin-rendered confirmation, transactional email).

DROP POLICY "public_read_site_details_v2" ON site_details_v2;

-- Mirror the gedu_read_site_staff_details_v2 shape from 00030. Coarse
-- "any gedu can read" — narrows to "gedus assigned to a group on a
-- product at this site" once gedu_group_assignments_v2 ships.
CREATE POLICY "gedu_read_site_details_v2"
  ON site_details_v2 FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) = 'gedu');

-- Anon loses the implicit GRANT SELECT it picked up in 00030. The
-- admin_full_access policy + the gedu policy above are both TO
-- authenticated, so the table privilege only needs to live there.
REVOKE SELECT ON site_details_v2 FROM anon;
