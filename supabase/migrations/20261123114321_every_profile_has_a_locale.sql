-- Every profile has a locale.
--
-- `profiles.locale` was nullable, NULL meaning "detect it from the request",
-- so every reader carried a branch for a profile with no language. It is now
-- set when the account is created and never empty again.
--
-- 1. The backfill. A value off the code's shape is normalised first (trimmed,
--    lowercased, `_` read as `-`), or emptied when even that does not give a
--    code, so it is filled by the next two steps. A gamer with no locale then
--    takes a linked parent's — the parent set the account up, as
--    create_gamer() already assumes — and every profile still empty takes
--    'en'. Every registered parent, gedu and admin already has one; what is
--    left is the gamers and the customers who signed in with Google and never
--    finished registering.
-- 2. `profiles_locale_format`: the code's shape, the same CHECK every
--    translation table carries. Which codes are supported stays the app's to
--    say: a CHECK naming them would need a migration for every language added.
-- 3. `profiles.locale` NOT NULL.
-- 4. handle_new_user() sets it. A password account's comes from its user
--    metadata, and an account created without a well-formed one is refused,
--    so a route or script that forgets it fails at once instead of storing a
--    guess. An identity provider's (Google) arrives with no locale of ours and
--    takes 'en', which the completion routes write over.
-- 5. register_gedu() stores the locale it is handed as it is. It used to turn
--    '' into NULL, the treatment it gives its optional text arguments; the
--    locale is not optional any more.

-- 1. The backfill.

DO $$
DECLARE
  normalised integer;
  emptied    integer;
BEGIN
  UPDATE public.profiles
     SET locale = lower(replace(btrim(locale), '_', '-'))
   WHERE locale !~ '^[a-z]{2,3}(-[a-z]{2})?$'
     AND lower(replace(btrim(locale), '_', '-')) ~ '^[a-z]{2,3}(-[a-z]{2})?$';
  GET DIAGNOSTICS normalised = ROW_COUNT;

  UPDATE public.profiles
     SET locale = NULL
   WHERE locale !~ '^[a-z]{2,3}(-[a-z]{2})?$';
  GET DIAGNOSTICS emptied = ROW_COUNT;

  RAISE NOTICE 'profiles.locale: % normalised to the code''s shape, % emptied for the backfill', normalised, emptied;
END;
$$;

-- Several parents: the earliest link whose parent has a locale, then the
-- parent's id, so the pick is the same on every run.
UPDATE public.profiles gamer
   SET locale = COALESCE(
         (SELECT parent.locale
            FROM public.parent_gamer link
            JOIN public.profiles parent ON parent.id = link.parent_id
           WHERE link.gamer_id = gamer.id
             AND parent.locale IS NOT NULL
           ORDER BY link.created_at NULLS LAST, link.parent_id
           LIMIT 1),
         'en')
 WHERE gamer.role = 'gamer'
   AND gamer.locale IS NULL;

UPDATE public.profiles
   SET locale = 'en'
 WHERE locale IS NULL;

-- 2. and 3.

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_locale_format CHECK (locale ~ '^[a-z]{2,3}(-[a-z]{2})?$'),
  ALTER COLUMN locale SET NOT NULL;

COMMENT ON CONSTRAINT profiles_locale_format ON public.profiles IS 'A locale is a language code of two or three lowercase letters, optionally followed by a hyphen and a two-letter lowercase region — the shape every translation table''s locale CHECK holds. Whether the code is one the site is translated into is the app''s to enforce, not this constraint''s.';

COMMENT ON COLUMN public.profiles.locale IS 'The UI locale the account reads the site in (en, fi, sv, ...). Never null. Set when the account is created, by handle_new_user(): a password account''s comes from its user metadata, and the account is refused without a well-formed one; an identity provider''s (Google) is the placeholder ''en'', which the registration-completion routes write over. profiles_locale_format holds it to the code''s shape; which codes are supported is enforced by the app. Distinct from spoken_languages, which is the user''s human-language fluency.';

-- 4. handle_new_user() sets the locale. Nothing else in the function changes.
-- CREATE OR REPLACE keeps its grants.

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  profile_first_name   TEXT;
  profile_last_name    TEXT;
  provider_full_name   TEXT;
  provider_name_parts  TEXT[];
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
  intent_kind_raw      TEXT;
  intent_id_raw        TEXT;
  intent_kind_value    TEXT;
  intent_id_value      UUID;
  registration_value   TIMESTAMPTZ;
  locale_value         TEXT;
BEGIN
  -- Every name is trimmed of whitespace of every kind first, because the
  -- profiles CHECKs refuse it at either edge. A first name of nothing but
  -- whitespace is then '' and counts as absent.
  profile_first_name := NULLIF(regexp_replace(NEW.raw_user_meta_data->>'first_name', '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'), '');

  IF profile_first_name IS NOT NULL THEN
    -- The sign-up sent its own name, so the last name is the one it sent too.
    profile_last_name := COALESCE(
      regexp_replace(NEW.raw_user_meta_data->>'last_name', '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'),
      ''
    );
  ELSE
    -- An identity provider (Google) sends one whole name instead, as
    -- `full_name` and `name`. It is split at the last whitespace, everything
    -- before it the first name and the last word the last name. A single word
    -- is a first name alone.
    provider_full_name := COALESCE(
      NULLIF(regexp_replace(NEW.raw_user_meta_data->>'full_name', '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'), ''),
      NULLIF(regexp_replace(NEW.raw_user_meta_data->>'name', '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'), '')
    );

    provider_name_parts := regexp_match(provider_full_name, '^(.*)[[:space:]\u00A0\u200B\uFEFF](.*)$');

    IF provider_name_parts IS NULL THEN
      profile_first_name := provider_full_name;
      profile_last_name  := '';
    ELSE
      profile_first_name := regexp_replace(provider_name_parts[1], '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g');
      profile_last_name  := provider_name_parts[2];
    END IF;

    -- A provider's name is not ours to shape, and a CHECK refusing it would
    -- fail the person's sign-in. No name, or one the profiles CHECKs would
    -- refuse, gives the stand-in whole, never half of each. A part is never
    -- empty, because the whole name was trimmed before the split, so length
    -- is the only rule a part can break.
    IF profile_first_name IS NULL
       OR char_length(profile_first_name) > 32
       OR char_length(profile_last_name) > 32 THEN
      profile_first_name := 'New User';
      profile_last_name  := '';
    END IF;
  END IF;

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

  -- The signup intent, the same way: a kind we do not know, or an id that is
  -- not a uuid, degrades the pair to NULL rather than failing the signup, and
  -- the pair is kept whole or not at all. Only the shape is checked here — the
  -- register route decided the meaning from the row before it sent it.
  intent_kind_raw := NEW.raw_user_meta_data->>'signup_intent_kind';
  intent_id_raw   := NEW.raw_user_meta_data->>'signup_intent_id';

  IF intent_kind_raw IN ('product', 'municipality_club', 'landing_page')
     AND intent_id_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    intent_kind_value := intent_kind_raw;
    intent_id_value   := intent_id_raw::uuid;
  END IF;

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

  -- The locale, split on the same test. Every route and script that creates a
  -- password account knows the language it is creating it in, so one that
  -- arrives without a well-formed locale is a caller's bug: the account is
  -- refused, unlike a malformed utm value above, because a guess stored here
  -- would be the language the person is then mailed and shown the site in.
  -- The value is checked exactly as sent, untrimmed: every caller sends an
  -- exact code, so padding is as much a caller's bug as any other shape.
  -- An identity provider (Google) carries no locale of ours, so the account
  -- takes 'en' as a placeholder while it is unregistered; the completion
  -- route writes the reader's locale over it.
  IF NEW.raw_app_meta_data->>'provider' = 'email' THEN
    locale_value := NEW.raw_user_meta_data->>'locale';

    IF locale_value IS NULL OR locale_value !~ '^[a-z]{2,3}(-[a-z]{2})?$' THEN
      RAISE EXCEPTION 'handle_new_user: a password account needs its UI locale, got %; pass locale in user_metadata',
        COALESCE(quote_literal(NEW.raw_user_meta_data->>'locale'), 'none')
        USING ERRCODE = '22023';
    END IF;
  ELSE
    locale_value := 'en';
  END IF;

  INSERT INTO public.profiles (
    id, email, role, first_name, last_name,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    signup_intent_kind, signup_intent_id,
    registration_completed_at, locale
  )
  VALUES (
    NEW.id, NEW.email, 'customer', profile_first_name, profile_last_name,
    utm_source_value, utm_medium_value, utm_campaign_value,
    utm_content_value, utm_term_value,
    intent_kind_value, intent_id_value,
    registration_value, locale_value
  );

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$_$;

-- 5. register_gedu() stores the locale as it is handed. Nothing else in the
-- function changes. CREATE OR REPLACE keeps its grants.

CREATE OR REPLACE FUNCTION public.register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages public.spoken_language[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
  -- The locale is not optional, so it is stored as it is.
  -- The names are trimmed of whitespace of every kind, which the profiles
  -- CHECKs refuse at either edge.
  UPDATE public.profiles
  SET role             = 'gedu',
      first_name       = regexp_replace(p_first_name, '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'),
      last_name        = regexp_replace(p_last_name, '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'),
      locale           = p_locale,
      phone            = NULLIF(p_phone, ''),
      spoken_languages = COALESCE(p_spoken_languages, '{}'),
      -- A password account arrives stamped by handle_new_user; a Google one
      -- arrives owing, and is registered the moment this promotion commits.
      -- COALESCE keeps an existing stamp's original moment.
      registration_completed_at = COALESCE(registration_completed_at, now())
  WHERE id = p_user_id;

  -- Swap the trigger-created customer extension row for a gedu one.
  DELETE FROM public.customer_profiles WHERE user_id = p_user_id;
  INSERT INTO public.gedu_profiles (user_id) VALUES (p_user_id);

  -- Coverage areas (empty = remote-only, which is valid).
  IF p_location_ids IS NOT NULL AND array_length(p_location_ids, 1) IS NOT NULL THEN
    INSERT INTO public.gedu_locations (gedu_id, location_id)
    SELECT p_user_id, unnest(p_location_ids);
  END IF;

  -- Optional Minecraft account. A duplicate uuid is allowed (an educator may
  -- share an account with someone else on the platform), so this insert has no
  -- rejection path of its own.
  IF p_minecraft_username IS NOT NULL AND p_minecraft_username <> '' THEN
    INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
    VALUES (p_user_id, p_minecraft_username, NULLIF(p_minecraft_uuid, ''));
  END IF;

  -- Optional Roblox account, on the same terms. The account id arrives as text
  -- carrying the same '' sentinel and is cast once here; a non-numeric value
  -- would raise, which is correct — the only caller resolves it from Roblox's
  -- own answer, so anything else is a bug rather than a user's typo.
  IF p_roblox_username IS NOT NULL AND p_roblox_username <> '' THEN
    INSERT INTO public.roblox_accounts (user_id, roblox_username, roblox_user_id)
    VALUES (p_user_id, p_roblox_username, NULLIF(p_roblox_user_id, '')::bigint);
  END IF;
END;
$_$;
