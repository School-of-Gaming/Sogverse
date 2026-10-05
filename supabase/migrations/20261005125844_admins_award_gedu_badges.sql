-- Admins award badges to gedus.
--
-- WHAT THIS ADDS
--
-- A badge is an admin's statement that a game educator has earned a
-- qualification. The set of badges is meant to grow (eSports, Minecraft,
-- programming and so on), so a badge is one value of an enum and adding one is
-- a new value plus its copy in the app. Badges GATE NOTHING: no assignment,
-- picker or check reads them.
--
-- 1. `gedu_badge` — the enum of badges.
-- 2. `gedu_badges` — one row per badge a gedu holds, stamped with when and by
--    which admin it was granted. Latest state only: revoking deletes the row,
--    and no history is kept. An admin reads every row, a gedu reads their own.
-- 3. `set_gedu_badge(uuid, gedu_badge, boolean)` — the one writer: an admin
--    grants or revokes one badge for one gedu.

-- ---------------------------------------------------------------------------
-- 1. The badges
-- ---------------------------------------------------------------------------

CREATE TYPE public.gedu_badge AS ENUM ('neuroinclusive', 'flagship');

COMMENT ON TYPE public.gedu_badge IS 'A badge an admin awards a game educator. neuroinclusive: qualified to run groups in products tagged neuroinclusive. flagship: cleared to run the products that are not municipality ones (consumer clubs, camps, events). Badges gate nothing: no assignment, picker or check reads them. The app lists them in the order declared here, so a new value goes where it should appear.';

-- ---------------------------------------------------------------------------
-- 2. Who holds which badge
-- ---------------------------------------------------------------------------

CREATE TABLE public.gedu_badges (
    gedu_id uuid NOT NULL REFERENCES public.gedu_profiles(user_id) ON DELETE CASCADE,
    badge public.gedu_badge NOT NULL,
    granted_at timestamp with time zone NOT NULL DEFAULT now(),
    granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    PRIMARY KEY (gedu_id, badge)
);

COMMENT ON TABLE public.gedu_badges IS 'The badges each game educator holds: a row means the gedu holds that badge, and no row means they do not. Latest state only, with no history: revoking a badge deletes its row. Keyed to gedu_profiles, so only an account carrying the gedu extension row can hold one, and the badges go with that row. Written only by set_gedu_badge; authenticated holds SELECT alone, an admin reading every row and a gedu their own. Gates nothing.';
COMMENT ON COLUMN public.gedu_badges.granted_at IS 'When the badge was first granted, stamped server-side by set_gedu_badge. Granting a badge the gedu already holds keeps this moment.';
COMMENT ON COLUMN public.gedu_badges.granted_by IS 'The admin who granted the badge, stamped server-side by set_gedu_badge from the calling session. ON DELETE SET NULL: a departed admin leaves the badge held without the name.';

ALTER TABLE public.gedu_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY gedu_badges_owner_or_admin_read ON public.gedu_badges
  FOR SELECT TO authenticated
  USING (gedu_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

REVOKE ALL ON TABLE public.gedu_badges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gedu_badges TO authenticated;
GRANT ALL ON TABLE public.gedu_badges TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Granting and revoking
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.set_gedu_badge(p_gedu_id uuid, p_badge public.gedu_badge, p_held boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_badge: % is not a gedu', p_gedu_id;
  END IF;

  IF p_held THEN
    INSERT INTO public.gedu_badges (gedu_id, badge, granted_at, granted_by)
    VALUES (p_gedu_id, p_badge, now(), (SELECT auth.uid()))
    ON CONFLICT (gedu_id, badge) DO NOTHING;
  ELSE
    DELETE FROM public.gedu_badges
     WHERE gedu_id = p_gedu_id AND badge = p_badge;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_gedu_badge(p_gedu_id uuid, p_badge public.gedu_badge, p_held boolean) IS 'Grant (p_held true) or revoke (p_held false) one badge for one game educator. Admin-only, guard-first on assert_admin, and it refuses a target that is not a gedu. Granting stamps granted_at and granted_by server-side from the clock and the calling session; granting a badge already held changes nothing, so the original moment and admin stand and a retry or double-click is harmless. Revoking deletes the row, and revoking a badge not held is a no-op. SECURITY DEFINER because gedu_badges carries no write grant for any Data API role: this is its only writer. Called from the admin user-detail page through the admin''s own session, which is why authenticated is the only role granted EXECUTE.';

REVOKE ALL ON FUNCTION public.set_gedu_badge(p_gedu_id uuid, p_badge public.gedu_badge, p_held boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_gedu_badge(p_gedu_id uuid, p_badge public.gedu_badge, p_held boolean) TO authenticated;
