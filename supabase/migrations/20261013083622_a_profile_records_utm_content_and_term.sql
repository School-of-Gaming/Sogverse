-- A profile records utm_content and utm_term.
--
-- WHAT THIS CHANGES
--
-- 1. `profiles.utm_content` and `profiles.utm_term`, nullable text, on exactly
--    the terms of utm_source, utm_medium and utm_campaign: the same format
--    CHECK (trimmed non-empty, at most 200 characters, no control character,
--    no spreadsheet-formula lead), written once, NULL on every gamer row.
-- 2. handle_new_user reads the `utm_content` and `utm_term` signup metadata
--    keys and sanitises them with the same predicate as the other three, so
--    a malformed value degrades to NULL rather than failing the signup.
-- 3. user_list_entries carries both, because it carries every profiles
--    column. CREATE OR REPLACE can only add a view column at the end, so they
--    sit after qualifications rather than beside the other utm columns; the
--    view's security_invoker flag is restated, because a replace sets the
--    view's options to exactly what it names.
--
-- WHAT DID NOT CHANGE
--
-- SELECT on profiles is granted at table level, so authenticated reads the new
-- columns through the same policies it reads the other utm columns through,
-- and the column-scoped UPDATE list for authenticated does not gain them: after
-- creation only service_role writes them. CREATE OR REPLACE keeps
-- handle_new_user's grants and the view's grants and comments. The trigger's
-- role assignment, registration stamp and customer_profiles row are as they
-- were.

ALTER TABLE public.profiles
  ADD COLUMN utm_content text,
  ADD COLUMN utm_term text,
  ADD CONSTRAINT profiles_utm_content_format CHECK (
    utm_content IS NULL OR (
      btrim(utm_content) <> ''
      AND char_length(btrim(utm_content)) <= 200
      AND utm_content !~ '[[:cntrl:]]'
      AND left(btrim(utm_content), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
    )
  ),
  ADD CONSTRAINT profiles_utm_term_format CHECK (
    utm_term IS NULL OR (
      btrim(utm_term) <> ''
      AND char_length(btrim(utm_term)) <= 200
      AND utm_term !~ '[[:cntrl:]]'
      AND left(btrim(utm_term), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
    )
  );

COMMENT ON COLUMN public.profiles.utm_content IS 'Optional marketing provenance: the utm_content from the link this account arrived through, or NULL. Same rules as utm_source — write-once, no UPDATE grant, case preserved, NULL on every gamer row.';

COMMENT ON COLUMN public.profiles.utm_term IS 'Optional marketing provenance: the utm_term from the link this account arrived through, or NULL. Same rules as utm_source — write-once, no UPDATE grant, case preserved, NULL on every gamer row.';

-- handle_new_user: two more keys, sanitised like the other three.

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
  utm_content_raw      TEXT;
  utm_term_raw         TEXT;
  utm_source_value     TEXT;
  utm_medium_value     TEXT;
  utm_campaign_value   TEXT;
  utm_content_value    TEXT;
  utm_term_value       TEXT;
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
  utm_content_raw  := NEW.raw_user_meta_data->>'utm_content';
  utm_term_raw     := NEW.raw_user_meta_data->>'utm_term';

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

  utm_content_value := CASE
    WHEN btrim(utm_content_raw) <> ''
     AND char_length(btrim(utm_content_raw)) <= 200
     AND utm_content_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_content_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_content_raw)
    ELSE NULL
  END;

  utm_term_value := CASE
    WHEN btrim(utm_term_raw) <> ''
     AND char_length(btrim(utm_term_raw)) <= 200
     AND utm_term_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_term_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_term_raw)
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
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    registration_completed_at
  )
  VALUES (
    NEW.id, NEW.email, 'customer', profile_first_name, profile_last_name,
    utm_source_value, utm_medium_value, utm_campaign_value,
    utm_content_value, utm_term_value,
    registration_value
  );

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;

-- The people list carries both. Restated whole because CREATE OR REPLACE VIEW
-- can only append a column; the new ones go last and every other line is
-- unchanged.

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
    registration_completed_at,
    ARRAY( SELECT gq.qualification
           FROM public.gedu_qualifications gq
          WHERE (gq.gedu_id = p.id)
          ORDER BY gq.qualification) AS qualifications,
    utm_content,
    utm_term
   FROM public.profiles p
  WHERE ((role <> 'gamer'::public.user_role) OR (NOT (EXISTS ( SELECT 1
           FROM public.parent_gamer pg
          WHERE (pg.gamer_id = p.id)))));
