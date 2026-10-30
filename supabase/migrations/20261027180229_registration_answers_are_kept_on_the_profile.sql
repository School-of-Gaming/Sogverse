-- What a parent answered at registration is kept on their profile, and
-- Sogverse stops writing School of Gaming's own mailing-list consent.
--
-- WHAT THIS CHANGES
--
-- 1. `profiles.registration_marketing_consent`: the answer the parent gave to
--    the sign-up form's School of Gaming mailing-list question, written once by
--    the registration routes. NULL means the account was never asked — a gamer,
--    a gedu, or a parent whose registration recorded no answer.
-- 2. `profiles.signup_intent_kind` / `signup_intent_id`: which of our pages the
--    parent was trying to reach when they registered (a product, a
--    municipality club, a landing page), as its meaning — the kind and the
--    row's id, never the URL. Written once, like the five utm_* columns: by
--    handle_new_user from the signup metadata, or by the registration-
--    completion route for an account Google created.
-- 3. Each parent's registration answer is copied out of the consent history
--    into the new column.
-- 4. Our own list's consent now lives in Klaviyo, which the parent sync feeds,
--    so nothing in Sogverse writes a `school_of_gaming` consent any more:
--    `record_registration_marketing_consent` is dropped, and
--    `set_marketing_consent` and `admin_set_product_marketing_consents` refuse
--    it. The rows already written stay, unread and unchanged, with the enum
--    value and the `registration` source; a later change removes them.

-- ---------------------------------------------------------------------------
-- 1. The registration answers on the profile
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN registration_marketing_consent boolean,
  ADD COLUMN signup_intent_kind text,
  ADD COLUMN signup_intent_id uuid,
  ADD CONSTRAINT profiles_signup_intent_kind_known CHECK (
    signup_intent_kind IS NULL
    OR signup_intent_kind = ANY (ARRAY['product', 'municipality_club', 'landing_page'])
  ),
  ADD CONSTRAINT profiles_signup_intent_whole CHECK (
    (signup_intent_kind IS NULL) = (signup_intent_id IS NULL)
  );

COMMENT ON COLUMN public.profiles.registration_marketing_consent IS 'The answer this parent gave at registration to "may School of Gaming send me news and offers by email": true, false, or NULL when they were never asked — every gamer and gedu row, and a parent whose registration recorded no answer. A record of what the form was told, not the current permission: the current answer to our own mailing list lives in Klaviyo, which the parent sync sends this to. Written once, by the registration routes through the service role; there is deliberately no UPDATE grant at any level for authenticated or anon.';
COMMENT ON COLUMN public.profiles.signup_intent_kind IS 'What this parent was trying to reach when they registered, by its meaning: `product` (a shop product page), `municipality_club` (a municipality club page) or `landing_page` (a live landing page). NULL when the registration started from none of them. Set together with signup_intent_id or not at all. Decided by the row existing and being public when the account was made, never by the URL alone, and the URL is never stored. Written once and never updatable, as the utm_* columns are: by handle_new_user() from the signup metadata, or by the registration-completion route for an account created by an identity provider (Google). No UPDATE grant for any role but service_role; gamer and gedu rows hold NULL. Not gated on the marketing cookie: it is first-party — which of our own pages the parent was trying to reach.';
COMMENT ON COLUMN public.profiles.signup_intent_id IS 'The id of the row signup_intent_kind names: a products id for `product` and `municipality_club`, a landing_pages id for `landing_page`. No foreign key on purpose: the row may be deleted later and the fact of where the parent set out from stays true. Same write rules as signup_intent_kind.';

-- The admin user list carries every profiles column, so it carries these too.
CREATE OR REPLACE VIEW public.user_list_entries WITH (security_invoker='true') AS
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
    utm_term,
    registration_marketing_consent,
    signup_intent_kind,
    signup_intent_id
   FROM public.profiles p
  WHERE ((role <> 'gamer'::public.user_role) OR (NOT (EXISTS ( SELECT 1
           FROM public.parent_gamer pg
          WHERE (pg.gamer_id = p.id)))));

-- ---------------------------------------------------------------------------
-- 2. handle_new_user reads the signup intent
-- ---------------------------------------------------------------------------

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
  intent_kind_raw      TEXT;
  intent_id_raw        TEXT;
  intent_kind_value    TEXT;
  intent_id_value      UUID;
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

  INSERT INTO public.profiles (
    id, email, role, first_name, last_name,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    signup_intent_kind, signup_intent_id,
    registration_completed_at
  )
  VALUES (
    NEW.id, NEW.email, 'customer', profile_first_name, profile_last_name,
    utm_source_value, utm_medium_value, utm_campaign_value,
    utm_content_value, utm_term_value,
    intent_kind_value, intent_id_value,
    registration_value
  );

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. The registration answers are copied onto the profile
-- ---------------------------------------------------------------------------

-- The first registration-sourced answer is what the sign-up form was told; a
-- parent's later toggling in settings is not part of it.
UPDATE public.profiles p
   SET registration_marketing_consent = first_answer.granted
  FROM (
    SELECT DISTINCT ON (e.customer_id) e.customer_id, e.granted
      FROM public.marketing_consent_events e
     WHERE e.consent_type = 'school_of_gaming'
       AND e.source = 'registration'
     ORDER BY e.customer_id, e.created_at, e.id
  ) AS first_answer
 WHERE p.id = first_answer.customer_id;

-- ---------------------------------------------------------------------------
-- 4. Nothing writes a school_of_gaming consent any more
-- ---------------------------------------------------------------------------

-- The registration routes write the profile column instead.
DROP FUNCTION public.record_registration_marketing_consent(uuid, boolean);

COMMENT ON TYPE public.marketing_consent_type IS 'The marketing permissions a parent can hold in Sogverse. lynx_educate is our partner''s list, asked for only on products an admin has attached it to — see product_marketing_consents. school_of_gaming is our own mailing list, which is now answered in Klaviyo: nothing writes it, and the rows written before it moved are kept unread until a later change removes them. Sogverse keeps only what the parent answered at registration (profiles.registration_marketing_consent). An enum rather than a whitelist table because a marketing consent, unlike a consent DOCUMENT, has no text to version and no republication for a stored row to outlive: it is a standing permission to mail, and the party it names is the whole of it.';

COMMENT ON TABLE public.marketing_consents IS 'The CURRENT answer to "may we mail this parent about this thing" — one row per (customer, consent type), and the row every send reads. Deliberately not derived from marketing_consent_events: a send must not fold a history to learn whether it may run, and the present tense must not depend on a log a retention policy could one day trim. An ABSENT row means never asked or never answered, which is not the same as `granted = false` (a parent who said no) — both are "do not mail", and only one of them is a decision the parent made. Account-level on purpose: the subject of a marketing consent is a mailbox, and a mailbox belongs to one adult rather than to one seat, which is the exact inverse of consent_acceptances and its per-enrolment key. REVOCABLE by construction — that is what makes this a separate system from the non-revocable enrolment conditions, which mandate the split. Written by set_marketing_consent, for lynx_educate alone, and by nothing else: no Data API role holds a write grant. Its school_of_gaming rows predate the move of that list to Klaviyo and are kept unread.';

COMMENT ON TABLE public.marketing_consent_events IS 'APPEND-ONLY history: one row per CHANGE to a marketing consent, and the evidence behind whatever marketing_consents currently says. Nothing updates or deletes a row here — no Data API role holds any write grant at all, and the only writer is set_marketing_consent — because an event is a statement that something happened at an instant, and editing one would destroy the only thing the table is for. A repeat submission that changes nothing appends nothing: a log of "changes" that recorded non-changes would answer "how often did this parent change their mind" with a number made of page loads. Rows carry NO unique constraint — granting, revoking and granting again is the ordinary life of a revocable consent, and those three rows are history rather than duplicates. Its school_of_gaming rows, the registration-sourced ones among them, predate the move of that list to Klaviyo and are kept unread.';

COMMENT ON COLUMN public.marketing_consent_events.source IS 'Which surface the answer came from: `settings` (the toggle on their own account page) or `enrolment` (the ask inside a product signup panel), the two set_marketing_consent accepts. `registration` (the checkbox on the parent sign-up form) is kept for the school_of_gaming rows written before that list moved to Klaviyo; nothing writes it now. This is the one field on an event that no other field can corroborate. A CHECK rather than an enum because the set is a list of our own surfaces, which move with the product rather than with the data model.';

CREATE OR REPLACE FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_customer_id uuid;
  v_current     boolean;
BEGIN
  PERFORM public.assert_role('customer');

  IF p_consent_type IS NULL OR p_granted IS NULL THEN
    RAISE EXCEPTION 'a marketing consent needs both a type and an answer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- School of Gaming's own list is answered in Klaviyo; the rows written here
  -- before it moved stay, and nothing adds to them.
  IF p_consent_type <> 'lynx_educate'::public.marketing_consent_type THEN
    RAISE EXCEPTION 'marketing consent % is answered in Klaviyo, not here', p_consent_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- The source is the one field on an event that nothing else can corroborate,
  -- so only the two surfaces that call this may be named. NULL is refused by
  -- the same statement rather than by a NOT NULL further down, so the message
  -- names the real problem.
  IF p_source IS NULL OR p_source NOT IN ('settings', 'enrolment') THEN
    RAISE EXCEPTION
      'marketing consent source must be settings or enrolment (got %)',
      COALESCE(p_source, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  v_customer_id := (SELECT auth.uid());

  -- FOR UPDATE so two submissions racing on the same toggle serialize rather
  -- than both concluding they are the change. A row that does not exist locks
  -- nothing, which is the harmless half: the ON CONFLICT below is what settles
  -- a first-answer race, and the losing side writes an event for a state it
  -- genuinely did set.
  SELECT mc.granted
    INTO v_current
    FROM public.marketing_consents mc
   WHERE mc.customer_id = v_customer_id
     AND mc.consent_type = p_consent_type
   FOR UPDATE;

  -- IS NOT DISTINCT FROM, not `=`: no row at all yields NULL here, and NULL is
  -- distinct from both true and false — which is the intended reading. "Never
  -- answered" is not the same state as "answered no", so a parent explicitly
  -- declining for the first time is a CHANGE and gets its event, while a
  -- re-submission of an answer already on file is not and does not.
  IF v_current IS NOT DISTINCT FROM p_granted THEN
    RETURN;
  END IF;

  INSERT INTO public.marketing_consents (
    customer_id, consent_type, granted, updated_at
  )
  VALUES (v_customer_id, p_consent_type, p_granted, now())
  ON CONFLICT (customer_id, consent_type) DO UPDATE
    SET granted    = EXCLUDED.granted,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.marketing_consent_events (
    customer_id, consent_type, granted, source
  )
  VALUES (v_customer_id, p_consent_type, p_granted, p_source);
END;
$$;

COMMENT ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) IS 'The one writer of a marketing consent: the settings toggle and the product signup panel both call it, so the two paths cannot drift. Guard-first on assert_role(''customer'') — gamers and gedus hold no marketing consents, and an admin toggles their own on their own parent account rather than through here, because the answer belongs to whoever owns the mailbox. The customer is auth.uid() and is never a parameter, so there is nothing for a caller to aim at another family. p_source must be `settings` or `enrolment`, the two surfaces that call it. Only lynx_educate is accepted: School of Gaming''s own list is answered in Klaviyo, and the school_of_gaming rows written before it moved are kept unread. IDEMPOTENT AND HONEST ABOUT IT — submitting the state already on file succeeds and appends NO event, because a change log that recorded non-changes would answer "how often did this parent change their mind" with a number made of page loads. A first explicit "no" IS a change: an absent row means never answered, which is not the same state as a recorded refusal.';

REVOKE ALL ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- A NULL element is refused BEFORE the replacing DELETE, the rule every
  -- array-replacing writer in this schema follows: `NOT (col = ANY (array))`
  -- is three-valued, so an array holding a NULL makes the predicate match
  -- nothing and quietly degrades a wipe-and-replace into a merge.
  -- `unnest(NULL::…[])` yields no rows, so an omitted array — the ordinary
  -- "asks nothing" shape — passes straight through here.
  IF EXISTS (
    SELECT 1 FROM unnest(p_consent_types) AS c WHERE c IS NULL
  ) THEN
    RAISE EXCEPTION
      'the marketing-consent list contains a NULL entry, which is not a consent'
      USING ERRCODE = 'check_violation';
  END IF;

  -- School of Gaming's own list is answered in Klaviyo, never asked for here.
  IF EXISTS (
    SELECT 1
      FROM unnest(p_consent_types) AS c
     WHERE c <> 'lynx_educate'::public.marketing_consent_type
  ) THEN
    RAISE EXCEPTION
      'a product signup panel asks only for lynx_educate; our own list is answered in Klaviyo'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The product must exist. Unlike the required-consents writer, whose foreign
  -- key into the document whitelist does its validating for it, this one's only
  -- FK is the product itself — and on a call that clears the set there is no
  -- INSERT for that FK to fire on, so a typo'd id would silently delete nothing
  -- and report success.
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.product_marketing_consents
   WHERE product_id = p_product_id
     AND NOT (consent_type = ANY (
       COALESCE(p_consent_types, ARRAY[]::public.marketing_consent_type[])
     ));

  -- ON CONFLICT DO NOTHING rather than a blind insert after a blind delete: the
  -- pair is a SET replacement, and leaving an unchanged row in place keeps the
  -- delete from churning rows an admin did not touch.
  IF p_consent_types IS NOT NULL
     AND array_length(p_consent_types, 1) > 0 THEN
    INSERT INTO public.product_marketing_consents (product_id, consent_type)
    SELECT p_product_id, c
      FROM unnest(p_consent_types) AS c
    ON CONFLICT (product_id, consent_type) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) IS 'Replace the set of marketing consents a product''s signup panel asks about, admin-only and guard-first on assert_admin. The only writer of product_marketing_consents: that table carries no write grant for any Data API role, and an inline INSERT from the admin product form would need one, because the form reaches this as the admin''s own session role. NULL and an empty array both mean "asks nothing", which is how a set is cleared. A NULL ELEMENT is refused before the replacing DELETE runs, for the reason one system over refuses one: `NOT (col = ANY (array))` is three-valued, so a NULL inside the array would match nothing and turn the wipe-and-replace into a merge. Only lynx_educate may be asked for: School of Gaming''s own list is answered in Klaviyo. An unknown product is refused explicitly rather than by a foreign key, because a call that CLEARS the set performs no insert for an FK to fire on and would otherwise report success for a product that does not exist.';

REVOKE ALL ON FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) TO service_role;
