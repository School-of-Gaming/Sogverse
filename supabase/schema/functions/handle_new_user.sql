--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
  -- Both names trimmed of whitespace of every kind first, because the
  -- profiles CHECKs refuse it at either edge. A first name of nothing but
  -- whitespace is then '' and takes the stand-in like an absent one.
  profile_first_name := COALESCE(
    NULLIF(regexp_replace(NEW.raw_user_meta_data->>'first_name', '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'), ''),
    'New User'
  );

  profile_last_name := COALESCE(
    regexp_replace(NEW.raw_user_meta_data->>'last_name', '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'),
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
$_$;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


