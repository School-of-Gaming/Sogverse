-- A Google account finishes its registration.
--
-- WHAT THIS CHANGES
--
-- Parents and gedus may sign in with Google. An account created that way has
-- no name, no terms acceptance and no consents yet, so it is not registered
-- until it has been through the finish page. This records the difference.
--
-- 1. `profiles.registration_completed_at`, nullable. NULL means the account
--    still owes its registration; the proxy sends such a parent to the finish
--    page from every protected page.
-- 2. handle_new_user sets it to now() when the new auth user's provider is
--    `email` — every password account, whatever its role, since each is created
--    through the Admin API by a route that supplies everything in one request —
--    and leaves it NULL for any other provider.
-- 3. Every existing profile is registered as of its own created_at. The
--    updated_at trigger is held off for the backfill, so every profile's
--    updated_at keeps meaning a change somebody made.
-- 4. user_list_entries carries the new column, because it carries every
--    profiles column. CREATE OR REPLACE can only add a view column at the end,
--    so it sits after family_search_blob rather than beside the other profile
--    columns; the view's security_invoker flag is restated, because a replace
--    sets the view's options to exactly what it names.
-- 5. The comments on profiles.email_verified_at and profiles.utm_source name
--    the registration-completion routes as the second service-role writer
--    each column now has. utm_medium and utm_campaign defer to utm_source's
--    rules, so theirs stand.
--
-- WHAT DID NOT CHANGE
--
-- handle_new_user's sanitising, its role assignment and its customer_profiles
-- row are as they were; CREATE OR REPLACE keeps its grants, and the view's
-- grants and comments. SELECT on profiles
-- is granted at table level, so authenticated reads the new column through the
-- same policies it reads role through, and the column-scoped UPDATE list for
-- authenticated does not gain it: after creation only service_role writes it.

ALTER TABLE public.profiles
  ADD COLUMN registration_completed_at timestamp with time zone;

COMMENT ON COLUMN public.profiles.registration_completed_at IS 'When this account finished registering — gave its name, accepted the terms and answered the consents — or NULL while it still owes that. handle_new_user() sets it at creation for a password account, whose registration route supplies everything in the same request, and leaves it NULL for any other provider (Google), which arrives with none of it. After creation it is written only by service_role (the routes that complete a registration); there is deliberately no UPDATE grant at any level for authenticated or anon, because a parent able to set it could skip the terms. The proxy sends a customer whose value is NULL to the finish page from every protected page.';

ALTER TABLE public.profiles DISABLE TRIGGER profiles_updated_at;

UPDATE public.profiles
   SET registration_completed_at = created_at
 WHERE registration_completed_at IS NULL;

ALTER TABLE public.profiles ENABLE TRIGGER profiles_updated_at;

CREATE OR REPLACE VIEW public.user_list_entries WITH (security_invoker = true) AS
 SELECT id,
    email,
    email_verified_at,
    first_name,
    last_name,
    role,
    phone,
    currency,
    home_location_id,
    utm_source,
    utm_medium,
    utm_campaign,
    locale,
    spoken_languages,
    created_at,
    updated_at,
    COALESCE(( SELECT gd.certified
           FROM public.gedu_profiles gd
          WHERE (gd.user_id = p.id)), false) AS certified,
    COALESCE(( SELECT gd.criminal_record_check_passed
           FROM public.gedu_profiles gd
          WHERE (gd.user_id = p.id)), false) AS criminal_record_check_passed,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', g.id, 'first_name', g.first_name, 'last_name', g.last_name, 'email', g.email, 'email_verified_at', g.email_verified_at, 'role', g.role, 'created_at', g.created_at, 'sign_in', gpr.sign_in) ORDER BY g.created_at, g.id) AS jsonb_agg
           FROM ((public.parent_gamer pg
             JOIN public.profiles g ON ((g.id = pg.gamer_id)))
             LEFT JOIN public.gamer_profiles gpr ON ((gpr.user_id = g.id)))
          WHERE (pg.parent_id = p.id)), '[]'::jsonb) AS linked_gamers,
    concat_ws(' '::text, first_name, last_name, email, phone, ( SELECT mc.minecraft_username
           FROM public.minecraft_accounts mc
          WHERE (mc.user_id = p.id)), ( SELECT rb.roblox_username
           FROM public.roblox_accounts rb
          WHERE (rb.user_id = p.id)), ( SELECT string_agg(concat_ws(' '::text, g.first_name, g.last_name, g.email, g.phone, gmc.minecraft_username, grb.roblox_username), ' '::text) AS string_agg
           FROM (((public.parent_gamer pg
             JOIN public.profiles g ON ((g.id = pg.gamer_id)))
             LEFT JOIN public.minecraft_accounts gmc ON ((gmc.user_id = g.id)))
             LEFT JOIN public.roblox_accounts grb ON ((grb.user_id = g.id)))
          WHERE (pg.parent_id = p.id))) AS family_search_blob,
    registration_completed_at
   FROM public.profiles p
  WHERE ((role <> 'gamer'::public.user_role) OR (NOT (EXISTS ( SELECT 1
           FROM public.parent_gamer pg
          WHERE (pg.gamer_id = p.id)))));

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  profile_first_name   TEXT;
  profile_last_name    TEXT;
  utm_source_raw       TEXT;
  utm_medium_raw       TEXT;
  utm_campaign_raw     TEXT;
  utm_source_value     TEXT;
  utm_medium_value     TEXT;
  utm_campaign_value   TEXT;
  registration_value   TIMESTAMPTZ;
BEGIN
  profile_first_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    'New User'
  );

  profile_last_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    ''
  );

  -- Sanitise here, in the body, rather than letting the CHECKs decide: a
  -- malformed value must cost this family nothing at all, so it degrades to
  -- NULL and the signup succeeds. Trim first, then test the trimmed value —
  -- and store the trimmed value, so what the CHECK sees is what was tested.
  -- An absent key arrives NULL, `btrim(NULL)` is NULL, and every comparison
  -- below is then NULL, so the CASE falls through to ELSE without a special
  -- case for it.
  utm_source_raw   := NEW.raw_user_meta_data->>'utm_source';
  utm_medium_raw   := NEW.raw_user_meta_data->>'utm_medium';
  utm_campaign_raw := NEW.raw_user_meta_data->>'utm_campaign';

  utm_source_value := CASE
    WHEN btrim(utm_source_raw) <> ''
     AND char_length(btrim(utm_source_raw)) <= 200
     AND utm_source_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_source_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_source_raw)
    ELSE NULL
  END;

  utm_medium_value := CASE
    WHEN btrim(utm_medium_raw) <> ''
     AND char_length(btrim(utm_medium_raw)) <= 200
     AND utm_medium_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_medium_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_medium_raw)
    ELSE NULL
  END;

  utm_campaign_value := CASE
    WHEN btrim(utm_campaign_raw) <> ''
     AND char_length(btrim(utm_campaign_raw)) <= 200
     AND utm_campaign_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_campaign_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_campaign_raw)
    ELSE NULL
  END;

  -- A password account arrives whole: every route that creates one supplies
  -- the name, the terms acceptance and the consents in the same request, so it
  -- is registered the moment it exists. Any other provider (Google) arrives
  -- with none of that, and stays unregistered until a completion route has it.
  -- The provider is read from app metadata, which only the auth server writes;
  -- user metadata is the caller's and could claim anything.
  registration_value := CASE
    WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN now()
    ELSE NULL
  END;

  INSERT INTO public.profiles (
    id, email, role, first_name, last_name,
    utm_source, utm_medium, utm_campaign,
    registration_completed_at
  )
  VALUES (
    NEW.id, NEW.email, 'customer', profile_first_name, profile_last_name,
    utm_source_value, utm_medium_value, utm_campaign_value,
    registration_value
  );

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;

-- Two columns gain a second service-role writer: the routes that complete a
-- registration begun with Google. Their comments say so.

COMMENT ON COLUMN public.profiles.email_verified_at IS 'When the address in profiles.email was last proven to reach this account''s owner, or NULL for "not verified" — the resting state for gamer rows, whose synthetic <token>@gamer.sogverse.internal address no inbox answers. Written only by service_role: the route that validates a signed verification link, and the registration-completion routes when the identity provider that created the account reports the same address verified. There is deliberately no UPDATE grant at any level for authenticated or anon, because a marker its own subject can set proves nothing. Reset to NULL by trg_reset_email_verification whenever profiles.email changes — the value is a claim about one address, not about the account.';

COMMENT ON COLUMN public.profiles.utm_source IS 'Optional marketing provenance: the utm_source from the link this account arrived through, or NULL (the large majority). Written once and never updatable — there is deliberately no UPDATE grant, at any level, for any role but service_role. The one write is handle_new_user() from the signup metadata, except for an account created by an identity provider (Google), whose round trip carries no signup metadata: there it is the registration-completion route that makes it. Case is preserved, because Vercel reports UTM values case-sensitively. Labels only: it grants nothing, is never used for profiling or to decide what anyone is shown or charged, and gamer rows always hold NULL.';
