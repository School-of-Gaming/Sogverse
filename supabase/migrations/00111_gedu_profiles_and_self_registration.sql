-- Gedu self-registration + verification.
--
-- Gedus move from admin-invited (generateLink → setup-account) to public
-- self-registration (a /register-gedu page, like parents). A self-registered
-- gedu is unverified until an admin approves them; verification is a trust
-- signal that gates group assignment in the UI, not platform access.
--
-- This migration adds:
--   1. gedu_profiles  — the 1:1 extension table gedus previously lacked, now
--      holding verification state (and a home for future gedu-only fields).
--   2. register_gedu  — a SECURITY DEFINER RPC that atomically promotes a
--      freshly-created customer profile into a fully-populated gedu, replacing
--      the multi-step admin-client sequence the old invite route ran.
--   3. set_gedu_verified — admin-only RPC to verify / un-verify a gedu, stamping
--      verified_at + verified_by server-side so they can't be spoofed by the
--      client.
--   4. a backfill marking every existing gedu as already verified.

-- =============================================================================
-- gedu_profiles (1:1 extension for gedus)
-- =============================================================================

CREATE TABLE public.gedu_profiles (
  user_id     uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  verified    boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  -- The admin who verified. SET NULL (not CASCADE) so deleting that admin
  -- keeps the gedu verified — losing who-verified is acceptable, silently
  -- un-verifying a working gedu is not.
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.gedu_profiles ENABLE ROW LEVEL SECURITY;

-- Admin reads all gedu verification state (the assignment picker + admin user
-- pages). FOR ALL pairs with the SELECT-only grant below: admins can read every
-- row, but writes go exclusively through set_gedu_verified (which stamps the
-- audit columns), never a direct table UPDATE.
CREATE POLICY "admin_full_access_gedu_profiles"
  ON public.gedu_profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "gedus_read_own_gedu_profile"
  ON public.gedu_profiles FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Mirror the customer_profiles / gamer_profiles grant shape. authenticated gets
-- SELECT only (no table-level write — see set_gedu_verified for the write path).
REVOKE ALL ON public.gedu_profiles FROM authenticated;
GRANT SELECT ON public.gedu_profiles TO anon;
GRANT SELECT ON public.gedu_profiles TO authenticated;
GRANT ALL ON public.gedu_profiles TO service_role;

-- =============================================================================
-- register_gedu — atomic self-registration promotion
-- =============================================================================

-- Runs the all-or-nothing promotion the admin invite route used to do as four
-- separate admin-client calls. The auth user is created first (gotrue is HTTP,
-- not SQL); this RPC then promotes that customer-seeded profile into a gedu in a
-- single transaction. Any failure (bad spoken language, duplicate Minecraft
-- UUID, invalid coverage location) rolls the whole thing back, and the calling
-- route deletes the orphaned auth user — no half-promoted debris.
--
-- service_role only: it grants the gedu role, so it must never be reachable by
-- authenticated/anon callers. The public /api/gedu/register route is the only
-- caller, via the admin client.
CREATE OR REPLACE FUNCTION public.register_gedu(
  p_user_id            uuid,
  p_first_name         text,
  p_last_name          text,
  p_locale             text,
  p_phone              text,
  p_spoken_languages   text[],
  p_location_ids       uuid[],
  p_minecraft_username text,
  p_minecraft_uuid     text
)
RETURNS void AS $$
BEGIN
  -- Only operate on a freshly-created customer profile (the role the new-user
  -- trigger seeds). Refusing anything else stops this from being used to mutate
  -- an established account of any role.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'register_gedu: % is not a newly-created customer profile', p_user_id;
  END IF;

  -- Callers pass '' for absent optional text (the generated RPC arg types are
  -- non-null `string`); NULLIF turns those back into SQL NULL so e.g. an empty
  -- phone stays NULL rather than tripping the profiles.phone format CHECK.
  UPDATE public.profiles
  SET role             = 'gedu',
      first_name       = p_first_name,
      last_name        = p_last_name,
      locale           = NULLIF(p_locale, ''),
      phone            = NULLIF(p_phone, ''),
      spoken_languages = COALESCE(p_spoken_languages, '{}')
  WHERE id = p_user_id;

  -- Swap the trigger-created customer extension row for a gedu one.
  DELETE FROM public.customer_profiles WHERE user_id = p_user_id;
  INSERT INTO public.gedu_profiles (user_id) VALUES (p_user_id);

  -- Coverage areas (empty = remote-only, which is valid).
  IF p_location_ids IS NOT NULL AND array_length(p_location_ids, 1) IS NOT NULL THEN
    INSERT INTO public.gedu_locations (gedu_id, location_id)
    SELECT p_user_id, unnest(p_location_ids);
  END IF;

  -- Optional Minecraft account. The UNIQUE constraint on minecraft_uuid raises
  -- here on a duplicate, aborting the transaction (the route pre-checks too, but
  -- this closes the race).
  IF p_minecraft_username IS NOT NULL AND p_minecraft_username <> '' THEN
    INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
    VALUES (p_user_id, p_minecraft_username, NULLIF(p_minecraft_uuid, ''));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.register_gedu(uuid, text, text, text, text, text[], uuid[], text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_gedu(uuid, text, text, text, text, text[], uuid[], text, text)
  TO service_role;

-- =============================================================================
-- set_gedu_verified — admin verify / un-verify
-- =============================================================================

-- Admin-only. Stamps verified_at / verified_by server-side from now() and
-- auth.uid() so the audit trail can't be forged by the client. Called from the
-- admin user-detail page via the admin's own authenticated session.
CREATE OR REPLACE FUNCTION public.set_gedu_verified(
  p_gedu_id  uuid,
  p_verified boolean
)
RETURNS void AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'set_gedu_verified: only admins may verify gedus';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_verified: % is not a gedu', p_gedu_id;
  END IF;

  UPDATE public.gedu_profiles
  SET verified    = p_verified,
      verified_at = CASE WHEN p_verified THEN now() ELSE NULL END,
      verified_by = CASE WHEN p_verified THEN (select auth.uid()) ELSE NULL END
  WHERE user_id = p_gedu_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.set_gedu_verified(uuid, boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_gedu_verified(uuid, boolean) TO authenticated;

-- =============================================================================
-- Backfill: existing gedus are already trusted
-- =============================================================================

-- Every gedu that exists today was admin-invited, so treat them as verified.
-- verified_by is left NULL (no specific admin / pre-dates the feature).
INSERT INTO public.gedu_profiles (user_id, verified, verified_at)
SELECT id, true, now()
FROM public.profiles
WHERE role = 'gedu'
ON CONFLICT (user_id) DO NOTHING;
