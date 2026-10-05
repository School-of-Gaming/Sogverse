-- Admins grant qualifications to gedus.
--
-- WHAT THIS ADDS
--
-- A qualification is an admin's statement that a game educator is qualified to
-- run a kind of group. The set is meant to grow, so a qualification is one
-- value of an enum and adding one is a new value plus its copy in the app.
-- Qualifications GATE NOTHING: no assignment, picker or check reads them.
--
-- 1. `gedu_qualification` — the enum of qualifications.
-- 2. `gedu_qualifications` — one row per qualification a gedu holds, stamped
--    with when and by which admin it was granted. Latest state only: revoking
--    deletes the row, and no history is kept. An admin reads every row, a gedu
--    reads their own. Seeded once from the assignments standing at deploy.
-- 3. `set_gedu_qualification(uuid, gedu_qualification, boolean)` — the one
--    writer: an admin grants or revokes one qualification for one gedu.

-- ---------------------------------------------------------------------------
-- 1. The qualifications
-- ---------------------------------------------------------------------------

CREATE TYPE public.gedu_qualification AS ENUM ('neuroinclusive', 'consumer_products');

COMMENT ON TYPE public.gedu_qualification IS 'A qualification an admin grants a game educator. neuroinclusive: qualified to run groups in products tagged neuroinclusive (product_tag). consumer_products: cleared to run the products families pay for themselves, which are the consumer_club, camp and event product types, everything except municipality_club. The name is broader than "consumer" on purpose: in this codebase "consumer" alone means the consumer_club product type, and this qualification also covers camps and events. Qualifications gate nothing: no assignment, picker or check reads them. The app lists them in the order declared here, so a new value goes where it should appear.';

-- ---------------------------------------------------------------------------
-- 2. Who holds which qualification
-- ---------------------------------------------------------------------------

CREATE TABLE public.gedu_qualifications (
    gedu_id uuid NOT NULL REFERENCES public.gedu_profiles(user_id) ON DELETE CASCADE,
    qualification public.gedu_qualification NOT NULL,
    granted_at timestamp with time zone NOT NULL DEFAULT now(),
    granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    PRIMARY KEY (gedu_id, qualification)
);

COMMENT ON TABLE public.gedu_qualifications IS 'The qualifications each game educator holds: a row means the gedu holds that qualification, and no row means they do not. Latest state only, with no history: revoking a qualification deletes its row. Keyed to gedu_profiles, so only an account carrying the gedu extension row can hold one, and the qualifications go with that row. Written only by set_gedu_qualification; authenticated holds SELECT alone, an admin reading every row and a gedu their own. Gates nothing.';
COMMENT ON COLUMN public.gedu_qualifications.granted_at IS 'When the qualification was first granted, stamped server-side by set_gedu_qualification. Granting a qualification the gedu already holds keeps this moment.';
COMMENT ON COLUMN public.gedu_qualifications.granted_by IS 'The admin who granted the qualification, stamped server-side by set_gedu_qualification from the calling session. ON DELETE SET NULL: a departed admin leaves the qualification held without the name.';

ALTER TABLE public.gedu_qualifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY gedu_qualifications_owner_or_admin_read ON public.gedu_qualifications
  FOR SELECT TO authenticated
  USING (gedu_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

REVOKE ALL ON TABLE public.gedu_qualifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gedu_qualifications TO authenticated;
GRANT ALL ON TABLE public.gedu_qualifications TO service_role;

-- The starting holdings: a one-time snapshot of assignments as they stand when
-- this deploys. A gedu assigned to any group (either role) on a product tagged
-- neuroinclusive starts with neuroinclusive, and one assigned to any group on a
-- consumer_club, camp or event product starts with consumer_products. No admin
-- made these grants, so granted_by is NULL and the card shows the date alone.
-- This runs once and nothing re-derives it: from here on every qualification
-- is an admin's decision, and assignments neither grant nor revoke one.
INSERT INTO public.gedu_qualifications (gedu_id, qualification)
SELECT DISTINCT a.gedu_id, q.qualification
  FROM public.gedu_group_assignments a
  JOIN public.gedu_profiles gp ON gp.user_id = a.gedu_id
  JOIN public.products p ON p.id = a.product_id
 CROSS JOIN LATERAL (
   SELECT 'neuroinclusive'::public.gedu_qualification AS qualification
    WHERE p.tag = 'neuroinclusive'
   UNION ALL
   SELECT 'consumer_products'::public.gedu_qualification
    WHERE p.product_type IN ('consumer_club', 'camp', 'event')
 ) q
ON CONFLICT (gedu_id, qualification) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Granting and revoking
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.set_gedu_qualification(p_gedu_id uuid, p_qualification public.gedu_qualification, p_held boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_qualification: % is not a gedu', p_gedu_id;
  END IF;

  IF p_held THEN
    INSERT INTO public.gedu_qualifications (gedu_id, qualification, granted_at, granted_by)
    VALUES (p_gedu_id, p_qualification, now(), (SELECT auth.uid()))
    ON CONFLICT (gedu_id, qualification) DO NOTHING;
  ELSE
    DELETE FROM public.gedu_qualifications
     WHERE gedu_id = p_gedu_id AND qualification = p_qualification;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_gedu_qualification(p_gedu_id uuid, p_qualification public.gedu_qualification, p_held boolean) IS 'Grant (p_held true) or revoke (p_held false) one qualification for one game educator. Admin-only, guard-first on assert_admin, and it refuses a target that is not a gedu. Granting stamps granted_at and granted_by server-side from the clock and the calling session; granting a qualification already held changes nothing, so the original moment and admin stand and a retry or double-click is harmless. Revoking deletes the row, and revoking a qualification not held is a no-op. SECURITY DEFINER because gedu_qualifications carries no write grant for any Data API role: this is its only writer. Called from the admin user-detail page through the admin''s own session, which is why authenticated is the only role granted EXECUTE.';

REVOKE ALL ON FUNCTION public.set_gedu_qualification(p_gedu_id uuid, p_qualification public.gedu_qualification, p_held boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_gedu_qualification(p_gedu_id uuid, p_qualification public.gedu_qualification, p_held boolean) TO authenticated;
