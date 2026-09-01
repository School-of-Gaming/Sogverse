--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: billing_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_mode AS ENUM (
    'paid',
    'free',
    'external_contract'
);


--
-- Name: effective_product_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.effective_product_status AS ENUM (
    'pending',
    'running',
    'completed',
    'cancelled',
    'expired'
);


--
-- Name: TYPE effective_product_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.effective_product_status IS 'The lifecycle as a reader sees it: product_status plus ''expired'', the derived state of a pending product whose end date passed without its start conditions ever being met. Computed at read time, never stored.';


--
-- Name: gender_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender_type AS ENUM (
    'boy',
    'girl',
    'non_binary'
);


--
-- Name: location_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.location_type AS ENUM (
    'country',
    'region',
    'municipality',
    'district',
    'site'
);


--
-- Name: marketing_consent_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.marketing_consent_type AS ENUM (
    'school_of_gaming',
    'lynx_educate'
);


--
-- Name: TYPE marketing_consent_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.marketing_consent_type IS 'The marketing permissions a parent can hold. school_of_gaming is our own mailing list, asked for at parent registration. lynx_educate is our partner''s, asked for only on products an admin has attached it to — see product_marketing_consents. An enum rather than a whitelist table because a marketing consent, unlike a consent DOCUMENT (00210), has no text to version and no republication for a stored row to outlive: it is a standing permission to mail, and the party it names is the whole of it.';


--
-- Name: participation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.participation_status AS ENUM (
    'reserving',
    'active',
    'waitlisted',
    'completed'
);


--
-- Name: TYPE participation_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.participation_status IS 'Participation lifecycle. ''reserving'' is RETIRED (2026-08, migration 00139): paid participations are created at payment confirmation, so nothing writes it. PostgreSQL cannot drop an enum value, hence it remains listed.';


--
-- Name: payment_purpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_purpose AS ENUM (
    'bundle',
    'subscription_invoice',
    'single_payment',
    'reservation_duplicate'
);


--
-- Name: product_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_status AS ENUM (
    'pending',
    'running',
    'completed',
    'cancelled'
);


--
-- Name: TYPE product_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.product_status IS 'The admin-stored lifecycle of a product: pending → running → completed, with cancelled as the admin kill. ''draft'' was removed in 00169 — nothing ever wrote it and the save-incomplete flow it was reserved for was never built. Visibility is a separate axis and means listing, not access.';


--
-- Name: product_tag; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_tag AS ENUM (
    'neuroinclusive',
    'beginner',
    'advanced'
);


--
-- Name: TYPE product_tag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.product_tag IS 'Who a product was DESIGNED for, as opposed to who may hold a seat on it (that is the audience — for_gamers/for_parents). Exactly one per product or none at all. The label copy lives in messages/, not here: this enum stores the value and nothing else, the same arrangement product_topic has. ''neuroinclusive'' is deliberately not ''neurodivergent-friendly'' — the -friendly suffix implies every unlabelled club is unfriendly, where this states a design property without ranking the rest of the catalogue.';


--
-- Name: product_topic; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_topic AS ENUM (
    'minecraft_java',
    'minecraft_education',
    'minecraft_bedrock',
    'fortnite',
    'roblox_studio',
    'pokemon_go',
    'rocket_league',
    'creator_studio',
    'programming',
    'ai',
    'esports',
    'game_studio'
);


--
-- Name: product_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_type AS ENUM (
    'consumer_club',
    'municipality_club',
    'camp',
    'event'
);


--
-- Name: spoken_language; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.spoken_language AS ENUM (
    'fi',
    'sv',
    'en',
    'fr'
);


--
-- Name: TYPE spoken_language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.spoken_language IS 'A human language a club is delivered in, or that a person speaks. Distinct from profiles.locale, which is which translation of the app someone sees: a Finnish-speaking parent may read the app in Finnish and want their child in an English club. Display names are never stored — the UI asks Intl.DisplayNames for the name in the reader''s own locale — so this type carries codes and nothing else. Adding a value is a code change as well as a migration: the flag map in src/components/ui/language-flag.tsx is keyed by this enum and will not compile without an entry. The vocabulary only grows: a language is added with ALTER TYPE ... ADD VALUE, but PostgreSQL cannot drop an enum value, so one we stop delivering in is retired by no longer offering it and remains listed here.';


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'customer',
    'gamer',
    'gedu'
);


--
-- Name: _list_column_grants(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_column_grants(p_grantee text) RETURNS TABLE(table_name text, column_name text, privilege_type text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT c.table_name::text, c.column_name::text, c.privilege_type::text
  FROM information_schema.column_privileges c
  WHERE c.grantee = p_grantee
    AND c.table_schema = 'public'
  ORDER BY 1, 2, 3;
$$;


--
-- Name: _list_cron_jobs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_cron_jobs() RETURNS TABLE(jobname text, schedule text, command text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT j.jobname::text, j.schedule::text, j.command::text
  FROM cron.job j;
$$;


--
-- Name: _list_function_authorization_surface(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_function_authorization_surface() RETURNS TABLE(function_name text, function_language text, is_security_definer boolean, is_strict boolean, authenticated_access boolean, anon_access boolean, argument_names text[], body text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    p.proname::text,
    l.lanname::text,
    p.prosecdef,
    p.proisstrict,
    pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
    -- proargnames carries OUT/TABLE column names after the input args, so slice
    -- to pronargs. NULL when the function takes no arguments at all.
    COALESCE(p.proargnames[1:p.pronargs], '{}'::text[]),
    p.prosrc::text
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language  l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    -- Trigger functions are not a callable surface: PostgREST cannot invoke them
    -- and PostgreSQL only runs them from a trigger context. Same exclusion the
    -- RPC-access view this replaces used.
    AND p.prorettype <> 'pg_catalog.trigger'::pg_catalog.regtype;
$$;


--
-- Name: _list_security_definer_without_search_path(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_security_definer_without_search_path() RETURNS TABLE(function_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.proname::text AS function_name
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS c
      WHERE c LIKE 'search_path=%'
    );
$$;


--
-- Name: _list_table_grants(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_table_grants(p_grantee text) RETURNS TABLE(table_name text, privilege_type text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT table_name::text, privilege_type::text
  FROM information_schema.table_privileges
  WHERE grantee = p_grantee
    AND table_schema = 'public'
  ORDER BY table_name, privilege_type;
$$;


--
-- Name: _list_tables_without_rls(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_tables_without_rls() RETURNS TABLE(table_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT tablename::text AS table_name
  FROM pg_catalog.pg_tables
  WHERE schemaname = 'public'
    AND NOT rowsecurity;
$$;


--
-- Name: _list_views(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_views() RETURNS TABLE(view_name text, kind text, security_invoker boolean, authenticated_select boolean, anon_select boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    c.relname::text,
    CASE c.relkind
      WHEN 'v' THEN 'view'
      WHEN 'm' THEN 'materialized view'
    END,
    COALESCE(c.reloptions @> ARRAY['security_invoker=true'], false),
    EXISTS (
      SELECT 1
        FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = c.oid
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND pg_catalog.has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')
    ),
    EXISTS (
      SELECT 1
        FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = c.oid
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND pg_catalog.has_column_privilege('anon', c.oid, a.attnum, 'SELECT')
    )
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('v', 'm')
  ORDER BY 1;
$$;


--
-- Name: FUNCTION _list_views(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public._list_views() IS 'Every view-shaped relation in the public schema — plain and materialized — with the three things that decide whether it is safe: which class it is, whether it runs as its caller (security_invoker), and which of the two Data API roles can read any part of it. Exposure is measured per column, so a relation reachable only through a column-level GRANT still reports as exposed. Materialized views are reported so the tests can ban them: one can take neither security_invoker nor RLS, and its rows were computed under a BYPASSRLS role. Read only by the DB test suite — the sweep in access-control.test.ts and the completeness checks in authorization-spine.test.ts — which is why it is service_role only.';


--
-- Name: accept_gedu_contract(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_gedu_contract(p_version text) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid         uuid := (SELECT auth.uid());
  v_accepted_at timestamptz;
  v_signed_name text;
BEGIN
  -- Guard-first, in the one shape the authorization spine reads. A gedu is the
  -- only role with a contract to accept; everyone else is refused with 42501 on
  -- the first statement. The FK to gedu_profiles stands behind this as the
  -- schema's own claim — a profile that says 'gedu' with no gedu_profiles row is
  -- a data error, and the insert below fails loudly rather than writing an
  -- acceptance for an educator record that does not exist.
  PERFORM public.assert_role('gedu');

  -- Pre-empt the foreign key so the refusal names the real cause: a version the
  -- platform has never heard of, which is what a stale client sends after a new
  -- version ships. A NULL p_version lands here too — nothing matches it — which
  -- is the right answer to "accept nothing".
  IF NOT EXISTS (
    SELECT 1 FROM public.gedu_contract_versions v WHERE v.version = p_version
  ) THEN
    RAISE EXCEPTION 'accept_gedu_contract: % is not a contract version this platform knows', p_version
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Idempotent by design: accepting the same version twice is the same fact, so
  -- the first acceptance stands and its stamp is the answer. Re-stamping would
  -- quietly rewrite the legal record every time somebody reloaded the page.
  SELECT ca.accepted_at
    INTO v_accepted_at
    FROM public.gedu_contract_acceptances ca
   WHERE ca.gedu_id = v_uid
     AND ca.contract_version = p_version;

  IF FOUND THEN
    RETURN v_accepted_at;
  END IF;

  -- The identity snapshot. Both columns are NOT NULL on profiles (last_name
  -- defaults to the empty string), so the concatenation cannot be NULL and the
  -- btrim is what keeps a gedu with no surname from signing as "Aino ".
  SELECT btrim(pr.first_name || ' ' || pr.last_name)
    INTO v_signed_name
    FROM public.profiles pr
   WHERE pr.id = v_uid;

  INSERT INTO public.gedu_contract_acceptances (
    gedu_id, contract_version, accepted_at, signed_name
  )
  VALUES (v_uid, p_version, now(), v_signed_name)
  ON CONFLICT (gedu_id, contract_version) DO NOTHING
  RETURNING accepted_at INTO v_accepted_at;

  -- DO NOTHING fired, which means a concurrent call — the same gedu's second
  -- click — committed the row between the read above and this insert. The row
  -- that landed IS the acceptance, so read its stamp rather than raising: the
  -- caller asked for a fact to be true and it is.
  IF v_accepted_at IS NULL THEN
    SELECT ca.accepted_at
      INTO v_accepted_at
      FROM public.gedu_contract_acceptances ca
     WHERE ca.gedu_id = v_uid
       AND ca.contract_version = p_version;
  END IF;

  RETURN v_accepted_at;
END;
$$;


--
-- Name: FUNCTION accept_gedu_contract(p_version text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.accept_gedu_contract(p_version text) IS 'Record that the CALLER accepted one version of the gedu contract, and return the acceptance timestamp. Gedu-only, guard-first on assert_role. There is no target parameter: the row is keyed to auth.uid(), so a caller cannot accept on anyone else''s behalf, and accepted_at and signed_name are both stamped server-side — the name as a snapshot taken from profiles at this moment, because a profile name is editable and the legal record must not drift. p_version is the full encoded version string — <base>/<language>, e.g. 2026-2027/fi — naming which of the equally binding texts was read, and it is checked against gedu_contract_versions and refused with foreign_key_violation if unknown. Idempotent per encoded version: accepting the same string twice returns the first acceptance''s stamp and writes nothing, including when the duplicate arrives concurrently. Signing the other language of the same version writes a second row, which is a second signature on one agreement and not a re-acceptance. Accepting gates nothing — admin certification remains the only blocking lever over an educator.';


--
-- Name: add_group_session_image(uuid, date, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
  v_count      integer;
  v_image_id   uuid;
BEGIN
  -- An admin, or a gedu. Written as one guard call rather than a branch around
  -- one so the authorization spine can read it, exactly as every other session
  -- writer is.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The assignment half of the gate, which is what an admin is exempt from.
  -- Any gedu assigned to the group may attach and remove photos, matching how
  -- the report itself is edited: there is no per-photo ownership.
  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The HARD sanity ceiling on a cap the caller supplies. The product cap lives
  -- in one constant in the contracts module and is passed in from there; this is
  -- only here so a buggy caller cannot ask for something absurd.
  IF p_max_images IS NULL OR p_max_images < 1 OR p_max_images > 24 THEN
    RAISE EXCEPTION
      'A photo cap of % is outside the 1..24 a caller may ask for',
      COALESCE(p_max_images::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  -- One refusal for every implausible dimension, rather than a 23514 from the
  -- CHECK for an out-of-range value and a 23502 from the NOT NULL for a missing
  -- one. The table's constraints still stand behind this and are what make the
  -- bound a guarantee rather than a convention.
  IF p_width IS NULL OR p_height IS NULL
     OR p_width  <= 0 OR p_width  > 4096
     OR p_height <= 0 OR p_height > 4096 THEN
    RAISE EXCEPTION
      'Image dimensions % x % are not a plausible session photo',
      COALESCE(p_width::text, 'NULL'), COALESCE(p_height::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_session_id := public.ensure_group_session(p_group_id, p_session_date);

  -- Take the session row's lock BEFORE counting, so two tabs uploading at once
  -- serialize here and the second one sees the first one's row. Without it both
  -- would count four and both would insert a fifth.
  PERFORM 1 FROM public.group_sessions WHERE id = v_session_id FOR UPDATE;

  SELECT count(*) INTO v_count
    FROM public.group_session_images
   WHERE session_id = v_session_id;

  IF v_count >= p_max_images THEN
    RAISE EXCEPTION
      'This session already holds % photos, which is the cap', v_count
      USING ERRCODE = 'P0023';
  END IF;

  INSERT INTO public.group_session_images (
    session_id, width, height, created_by
  )
  VALUES (v_session_id, p_width, p_height, v_uid)
  RETURNING id INTO v_image_id;

  RETURN v_image_id;
END;
$$;


--
-- Name: FUNCTION add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) IS 'Attach one photo to a session''s report, materializing the session row if needed, and hand back the id the object will be named by. Open to an ADMIN or to the gedu assigned to the group, guard-first on assert_role with the assignment question as a second 42501 — the same shape set_group_session_notes carries, and the same half an admin is exempt from. Addressed by (group, session date) like every other session write. Takes the CAP as a parameter, because the product cap lives in one constant in the contracts module and raising it must not need a migration; SQL holds only a hard sanity ceiling of 24 so a buggy caller cannot pass something absurd. Counts and inserts while holding the session row''s lock, so concurrent tabs cannot overshoot the cap, and refuses with SQLSTATE P0023 when it is already met — a code of its own because the UI answers it differently from every other refusal ("remove one first", not "that did not work"). Implausible dimensions are refused with check_violation as one class, the table''s own CHECKs standing behind that. Called on the UPLOADER''S OWN client: the guard is the authorization, and the route uploads the object with the admin client afterwards — deleting this row again if that upload fails, because an object-less row is a broken image in the feed and in every mail sent later.';


--
-- Name: admin_enroll_participant(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type     public.product_type;
  v_billing_mode     public.billing_mode;
  v_for_gamers       boolean;
  v_for_parents      boolean;
  v_participant_role public.user_role;
  v_customer_id      uuid;
  v_participation_id uuid;
  v_auto_group_id    uuid;
  v_required_slugs   text[];
BEGIN
  PERFORM public.assert_admin();

  -- FOR UPDATE since 00206: the automatic placement below counts this product's
  -- groups, and the lock is what stops that count from being taken against a
  -- group list another admin is in the middle of changing. Same lock, same
  -- order (product, then participations) as every other participation writer.
  SELECT product_type, billing_mode, for_gamers, for_parents
    INTO v_product_type, v_billing_mode, v_for_gamers, v_for_parents
    FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The one shape whose seat cannot exist without a Stripe subscription, which
  -- comp-enrollment has no way to create. Every other combination — free clubs
  -- included, since 00166 — is the free camp and free event this function has
  -- always written.
  IF v_product_type = 'consumer_club' AND v_billing_mode = 'paid' THEN
    RAISE EXCEPTION 'admin enrollment is not supported for subscription-billed consumer clubs'
      USING ERRCODE = 'check_violation';
  END IF;

  -- This function derives the customer rather than being told one, so "is this
  -- a self seat" is decided from the participant's ROLE. A `customer` profile
  -- is an adult taking a seat on their own account; every other role (and a
  -- participant who does not exist at all, whose role reads NULL and so fails
  -- this comparison) goes down the child path and is resolved through the
  -- parent link exactly as before — including the error it has always raised.
  SELECT role INTO v_participant_role
    FROM public.profiles WHERE id = p_participant_id;

  IF v_participant_role = 'customer' THEN
    IF NOT v_for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- An adult pays for their own seat: they are the customer AND the
    -- participant. This is the row shape the dropped no-self-signup CHECK used
    -- to forbid.
    v_customer_id := p_participant_id;
  ELSE
    -- One parent per gamer is the current model; where a gamer somehow has
    -- several links, the oldest wins so the choice is deterministic rather than
    -- whatever the planner returned. Multi-parent reckoning is future work.
    SELECT parent_id INTO v_customer_id
      FROM public.parent_gamer
      WHERE gamer_id = p_participant_id
      ORDER BY created_at ASC
      LIMIT 1;
    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'gamer % has no linked parent', p_participant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_for_gamers THEN
      RAISE EXCEPTION 'product % is not open to gamers', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- AUTOMATIC PLACEMENT (00206). A no-charge product with exactly one group has
  -- no placement decision left in it. A paid camp or event still lands in the
  -- unassigned inbox — money on the seat is what separates the two, and this
  -- function serves both.
  IF public.is_no_charge(v_billing_mode) THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
      INTO v_auto_group_id
      FROM (
        SELECT id FROM public.product_groups
         WHERE product_id = p_product_id
         LIMIT 2
      ) g;
  END IF;

  -- The partial unique index on (product_id, participant_id) for non-reserving
  -- statuses is the source of truth for "already enrolled"; it raises 23505 and
  -- the route maps that to 409. Re-checking it here would be a race, not a
  -- safeguard.
  --
  -- group_joined_at is absent on purpose: the BEFORE INSERT trigger stamps it
  -- from group_id, and the table comment forbids writing it by hand.
  INSERT INTO public.participations (product_id, participant_id, customer_id, status, group_id)
  VALUES (p_product_id, p_participant_id, v_customer_id, 'active', v_auto_group_id)
  RETURNING id INTO v_participation_id;

  -- THE ENROLMENT CONDITIONS (00212). The seat exists, so the product's
  -- required consents bind to it exactly as they would on a family signup —
  -- but the admin is not prompted and is never refused. Every required slug is
  -- supplied automatically from the product's own requirement set, so the gate
  -- passes by construction and its job here is the WRITE rather than the check;
  -- the family stays the customer, and the acting admin is stamped as the one
  -- who performed the act. A product requiring nothing leaves v_required_slugs
  -- NULL and the call is a no-op, which is every product but one.
  SELECT array_agg(prc.document_slug ORDER BY prc.document_slug)
    INTO v_required_slugs
    FROM public.product_required_consents prc
   WHERE prc.product_id = p_product_id;

  PERFORM public.record_required_consents(
    p_product_id, v_customer_id, p_participant_id, (SELECT auth.uid()),
    v_required_slugs
  );

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'customer_id', v_customer_id
  );
END;
$$;


--
-- Name: FUNCTION admin_enroll_participant(p_product_id uuid, p_participant_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) IS 'Admin-gated comp-enrollment: drops a participant onto a product with status=active, bypassing payment, seat caps and registration windows by design. Refuses only a paid consumer club — the one shape whose seat requires a Stripe subscription this function cannot create; free clubs enroll like any free camp or event. Since 00173 it also enforces the audience: a customer profile takes a seat as their own customer and needs for_parents, anyone else is resolved through the parent link and needs for_gamers. Renamed from admin_enroll_gamer in 00175 — it has not only enrolled gamers since 00173. Since 00206 it places the seat automatically when the product charges nothing (billing_mode free or external_contract) AND has exactly one group, matching the family self-enrollment path; a PAID camp or event still lands in the unassigned inbox, as does any product with zero or several groups, and whether the single group has a gedu assigned is not consulted. That placement is why the product read now takes FOR UPDATE — the group count has to be taken under the same lock the group editor holds. group_joined_at is never written here; a trigger stamps it from group_id. Since 00212 it is the THIRD door into record_required_consents, and the only one that neither prompts nor refuses: admins are trusted, a comp-enrollment is arranged with the family off-platform, so every slug in the product''s requirement set is supplied automatically and the acceptance rows are written on the family''s behalf — customer_id the family''s, accepted_by the acting admin''s auth.uid(). It runs AFTER the INSERT because the partial unique index is the already-enrolled gate on this path, so an acceptance exists only where a seat does. There is no consent argument on this function or on the route above it, and no UI change: nothing about the Add button''s behaviour differs on a consent-requiring product.';


--
-- Name: admin_remove_participation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row_product_id uuid;
  v_live_sub       text;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id INTO v_row_product_id
    FROM public.participations WHERE id = p_participation_id;
  IF NOT FOUND OR v_row_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'participation % is not on product %',
      p_participation_id, p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A LIVE subscription, not merely a row — see demote_to_waitlist above for
  -- the whole reasoning; the two refusals are deliberately one predicate. The
  -- stakes here are the sharper of the two: removal is the ONLY exit a
  -- participation has once its subscription is dead (there is nothing left for
  -- the family to cancel), so counting a `cancelled` row as live left the seat
  -- permanently occupied with no instruction that could ever free it.
  --
  -- Still refused for anything that can bill: cancelling the participation
  -- CASCADEs family_subscriptions, and a live subscription would carry on
  -- charging a family the database no longer knows about.
  SELECT stripe_subscription_id INTO v_live_sub
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id
      AND status <> 'cancelled';
  IF v_live_sub IS NOT NULL THEN
    RAISE EXCEPTION
      'participation % still has live Stripe subscription %',
      p_participation_id, v_live_sub
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN public.cancel_participation(p_participation_id, 'admin_cancelled');
END;
$$;


--
-- Name: FUNCTION admin_remove_participation(p_product_id uuid, p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) IS 'Admin-gated un-enrollment. Refuses a participation that is not on the named product, or one with a LIVE Stripe subscription — a family_subscriptions row whose status is anything but ''cancelled'' — which must be cancelled through Stripe first, or the cancel would orphan it; otherwise delegates to cancel_participation. A dunning-dead subscription is stored as ''cancelled'' and does NOT refuse: admin removal is the only exit such a seat has, so counting it would strand the seat forever. Product type is not consulted — a free club has no parent-facing cancel, so this is its only exit.';


--
-- Name: admin_set_product_marketing_consents(uuid, public.marketing_consent_type[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- A NULL element is refused BEFORE the replacing DELETE, which is 00211's
  -- lesson carried over verbatim: `NOT (col = ANY (array))` is three-valued, so
  -- an array holding a NULL makes the predicate match nothing and quietly
  -- degrades a wipe-and-replace into a merge. `unnest(NULL::…[])` yields no
  -- rows, so an omitted array — the ordinary "asks nothing" shape — passes
  -- straight through here.
  IF EXISTS (
    SELECT 1 FROM unnest(p_consent_types) AS c WHERE c IS NULL
  ) THEN
    RAISE EXCEPTION
      'the marketing-consent list contains a NULL entry, which is not a consent'
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


--
-- Name: FUNCTION admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) IS 'Replace the set of marketing consents a product''s signup panel asks about, admin-only and guard-first on assert_admin. The only writer of product_marketing_consents: that table carries no write grant for any Data API role, and an inline INSERT from the admin product form would need one, because the form reaches this as the admin''s own session role. NULL and an empty array both mean "asks nothing", which is how a set is cleared. A NULL ELEMENT is refused before the replacing DELETE runs — 00211''s lesson, one system over: `NOT (col = ANY (array))` is three-valued, so a NULL inside the array would match nothing and turn the wipe-and-replace into a merge. An unknown product is refused explicitly rather than by a foreign key, because a call that CLEARS the set performs no insert for an FK to fire on and would otherwise report success for a product that does not exist.';


--
-- Name: apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb DEFAULT '[]'::jsonb, p_renamed_groups jsonb DEFAULT '[]'::jsonb, p_deleted_group_ids uuid[] DEFAULT '{}'::uuid[], p_gedu_assignments_added jsonb DEFAULT '[]'::jsonb, p_gedu_assignments_removed jsonb DEFAULT '[]'::jsonb, p_participation_moves jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_group           JSONB;
  v_assignment      JSONB;
  v_move            JSONB;
  v_new_id          UUID;
  v_real_to_id      UUID;
  v_resolved_group  UUID;
  v_gedu_id         UUID;
  v_gedu_id_text    TEXT;
  v_temp_map        JSONB := '{}'::jsonb;
BEGIN
  PERFORM public.assert_admin();

  PERFORM 1 FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- Removes first so an admin can move a Gedu from group A to B in one batch.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_removed) LOOP
    DELETE FROM gedu_group_assignments
     WHERE group_id = (v_assignment->>'groupId')::UUID
       AND gedu_id  = (v_assignment->>'geduId')::UUID;
  END LOOP;

  IF array_length(p_deleted_group_ids, 1) > 0 THEN
    DELETE FROM product_groups
     WHERE id = ANY(p_deleted_group_ids)
       AND product_id = p_product_id;
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_renamed_groups) LOOP
    UPDATE product_groups
       SET name = v_group->>'name'
     WHERE id = (v_group->>'groupId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups (product_id, name)
    VALUES (p_product_id, v_group->>'name')
    RETURNING id INTO v_new_id;

    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);

    IF jsonb_typeof(v_group->'geduIds') = 'array' THEN
      FOR v_gedu_id_text IN SELECT jsonb_array_elements_text(v_group->'geduIds') LOOP
        INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id)
        VALUES (v_new_id, v_gedu_id_text::UUID, p_product_id);
      END LOOP;
    END IF;
  END LOOP;

  -- Explicit conflict target so the (gedu_id, product_id) UNIQUE violation
  -- propagates as an error (an admin trying to assign the same Gedu to two
  -- groups in one product should fail). Only the (group_id, gedu_id)
  -- primary-key conflict — the caller redundantly listing a pair already
  -- covered by the inline gedus above — is silenced.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_added) LOOP
    IF v_temp_map ? (v_assignment->>'groupId') THEN
      v_resolved_group := (v_temp_map->>(v_assignment->>'groupId'))::UUID;
    ELSE
      v_resolved_group := (v_assignment->>'groupId')::UUID;
    END IF;

    v_gedu_id := (v_assignment->>'geduId')::UUID;

    INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id)
    VALUES (v_resolved_group, v_gedu_id, p_product_id)
    ON CONFLICT (group_id, gedu_id) DO NOTHING;
  END LOOP;

  FOR v_move IN SELECT * FROM jsonb_array_elements(p_participation_moves) LOOP
    IF (v_move->'toGroupId') IS NULL OR jsonb_typeof(v_move->'toGroupId') = 'null' THEN
      v_real_to_id := NULL;
    ELSIF v_temp_map ? (v_move->>'toGroupId') THEN
      v_real_to_id := (v_temp_map->>(v_move->>'toGroupId'))::UUID;
    ELSE
      v_real_to_id := (v_move->>'toGroupId')::UUID;
    END IF;

    UPDATE participations
       SET group_id = v_real_to_id
     WHERE id = (v_move->>'participationId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  RETURN jsonb_build_object('tempMap', v_temp_map);
END;
$$;


--
-- Name: apply_product_image_path(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_product_image_path() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_path text;
BEGIN
  IF NEW.image_id IS NOT NULL THEN
    SELECT path INTO v_path
      FROM public.product_images
     WHERE id = NEW.image_id;

    -- This runs BEFORE the FK — which is an AFTER-row constraint trigger fired
    -- at statement end — so it pre-empts the FK's own check rather than relying
    -- on it. The reachable cause of an empty lookup is that the row is gone
    -- (another admin removed the entry between this admin loading the form and
    -- saving it); RLS hiding it is the other half of the message and the half
    -- 00196's header argues cannot happen. Blanking the picture silently would
    -- be the worst possible answer to either; raise instead, with the SQLSTATE
    -- the FK itself would have used, because it is the same claim made earlier.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'product_images row % does not exist or is not visible to this writer', NEW.image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.image_path := v_path;
  ELSE
    -- No entry, no picture — on UPDATE and INSERT alike, and whatever the
    -- statement said about image_path. 00196 preserved an app-supplied path
    -- here so that the ~110 products carrying a pre-catalogue path survived a
    -- migration released ahead of the code that linked them. That fold-in is
    -- done (00198), so the branch now has only one honest meaning: a product
    -- with no entry has no picture. With no column list on the trigger, this
    -- function is the only writer of image_path — which is why no foreign key
    -- on that column is needed, and why one must not be added (see the header).
    NEW.image_path := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION apply_product_image_path(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_product_image_path() IS 'BEFORE INSERT OR UPDATE on products: image_path is derived from the linked product_images entry, and is NULL whenever image_id is. Since 00198 there is no branch that preserves an app-supplied path, so this function is the column''s ONLY writer — which is what carries the invariant that a served path is a catalogue path, and why there is deliberately no foreign key on image_path (a second relationship between products and product_images makes every PostgREST embed ambiguous; see 00198''s header). Carries no column list on the trigger deliberately, so no statement can name image_path and win.';


--
-- Name: assert_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_admin() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('admin');
END;
$$;


--
-- Name: assert_can_delete_session_image(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_can_delete_session_image(p_image_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_group_id uuid;
BEGIN
  -- An admin, or a gedu. Guard-first on the first statement, in the shape the
  -- authorization spine reads and every other session RPC carries.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  SELECT s.group_id
    INTO v_group_id
    FROM public.group_session_images i
    JOIN public.group_sessions s ON s.id = i.session_id
   WHERE i.id = p_image_id;

  -- No row and somebody else's row answer the same way, exactly as they do in
  -- delete_group_session_image. The caller has no right to learn which it was.
  IF v_group_id IS NULL
     OR (NOT public.is_admin() AND NOT public.gedu_teaches_group(v_group_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The id it validated, so a caller has a positive answer rather than the
  -- absence of an error. Returning it discloses nothing: it is the id the caller
  -- just sent, and it comes back only on the path where they were allowed.
  RETURN p_image_id;
END;
$$;


--
-- Name: FUNCTION assert_can_delete_session_image(p_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) IS 'May this caller remove this photo? A CHECK-ONLY function: it mutates nothing, and it exists because the route deletes the storage object BEFORE the row, on the service-role client, and an admin client must never act for a caller whose authorization has not been proved. Object-first is what makes a failed removal visible and retryable — the row is what every surface reads, so deleting it first would take the tile away and leave the object standing in a public bucket with nothing left to retry against. The gate is byte for byte delete_group_session_image''s: guard-first on assert_role for an ADMIN or a gedu, then the group resolved from the image''s own session row, with a photo id belonging to another group and one belonging to nothing refused IDENTICALLY with 42501 — never distinguish them, or this becomes an oracle for real photo ids, which name objects whose unguessable names are the access control. Returns the id it validated. It does not replace the delete RPC''s own guard, which still runs on the actual delete afterwards; the window between the two is cosmetic, because nothing inside it can widen what a caller may do.';


--
-- Name: assert_role(public.user_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_role(p_role public.user_role) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- A NULL p_role is a caller bug — no role name was asked for, so nothing can
  -- satisfy the assertion. Refuse before the comparison can swallow it.
  IF p_role IS NULL THEN
    RAISE EXCEPTION 'assert_role requires a role' USING ERRCODE = '42501';
  END IF;

  -- IS DISTINCT FROM, not `<>`: a caller with no profiles row has a NULL role,
  -- and `NULL <> 'admin'` is NULL, which an IF treats as false — that let a
  -- roleless caller straight through. NULL is distinct from every role, so this
  -- form refuses them.
  IF (SELECT public.get_user_role()) IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: assert_self(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_self(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF p_user_id IS NULL OR (SELECT auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: can_read_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_product(p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    -- admin sees everything (mirrors admin_full_access_* FOR ALL)
    (SELECT public.get_user_role()) = 'admin'::public.user_role
    -- public: published. `is_visible` is NOT tested here, and its absence is
    -- the point: that column governs LISTING only — the browse queries filter
    -- on it — while a direct link to an unlisted product is meant to lead to a
    -- page a parent can read and buy from. The consequence is that an unlisted
    -- product is readable, and therefore enumerable, through the Data API:
    -- obscurity rather than secrecy, accepted by owner decision (Aug 2026).
    -- What keeps a product unbuyable is its status, its seat cap and its
    -- registration window — never its visibility.
    OR EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = p_product_id
        AND pr.status IN ('pending'::public.product_status, 'running'::public.product_status)
    )
    -- enrolled gamer (child's own login) OR purchaser (parent), active/waitlisted
    OR EXISTS (
      SELECT 1 FROM public.participations p
      WHERE p.product_id = p_product_id
        AND (p.participant_id = (SELECT auth.uid()) OR p.customer_id = (SELECT auth.uid()))
        AND p.status IN ('active'::public.participation_status, 'waitlisted'::public.participation_status)
    )
    -- assigned gedu
    OR EXISTS (
      SELECT 1 FROM public.gedu_group_assignments a
      WHERE a.product_id = p_product_id
        AND a.gedu_id = (SELECT auth.uid())
    ),
    false
  );
$$;


--
-- Name: FUNCTION can_read_product(p_product_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.can_read_product(p_product_id uuid) IS 'Read predicate behind the products SELECT policy and the four satellite tables that follow it (translations, prices, schedule slots, holiday calendar links). True for: an admin; anyone at all on a product whose status is pending or running; a parent or gamer party to an active or waitlisted participation on it; an assigned gedu. It does NOT test is_visible — since 00168 that column means "not publicly listed" and is applied by the browse queries, so an unlisted product stays readable (and enumerable) by direct link. Wrapped in COALESCE so it answers a total boolean rather than NULL for a caller with no profiles row.';


--
-- Name: cancel_participation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id              UUID;
  v_status                  public.participation_status;
  v_stripe_subscription_id  TEXT;
BEGIN
  SELECT product_id, status
    INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Read the linked Stripe sub id before the delete (CASCADE removes the row).
  SELECT stripe_subscription_id
    INTO v_stripe_subscription_id
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id
    LIMIT 1;

  DELETE FROM public.participations WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'cancelled',
    'product_id', v_product_id,
    'previous_status', v_status::text,
    'stripe_subscription_id', v_stripe_subscription_id,
    'reason', p_reason
  );
END;
$$;


--
-- Name: claim_expired_seat_offer_notifications(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_expired_seat_offer_notifications(p_participation_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_claimed jsonb;
BEGIN
  -- One statement, and that is the design. The UPDATE both selects the rows to
  -- notify about and marks them notified, so the set it returns is the set this
  -- caller owns: a concurrent sweep re-evaluates
  -- `seat_offer_expiry_notified_at IS NULL` after this one commits and finds
  -- nothing. Exactly-once by construction, with no advisory lock and nothing
  -- held across the Brevo call.
  --
  -- There is no cron job. Expiry is observed rather than scheduled — an admin
  -- opening the dashboard or the groups panel runs this, and so does a family
  -- clicking a link that has already run out, which is itself an observation.
  -- The cost of that is latency (staff hear about a silent family the next time
  -- somebody looks) and the benefit is that nothing has to be provisioned,
  -- monitored or reasoned about at 3am.
  --
  -- THE SCOPE ARGUMENT, AND WHY IT IS NOT DECORATION
  --
  -- NULL is the platform-wide sweep, and it is what the ADMIN surfaces pass:
  -- an admin opening the dashboard or a groups panel is entitled to observe
  -- every lapsed offer, and a global claim is the whole point of a sweep on
  -- mount. A non-NULL id claims THAT ROW AND NOTHING ELSE, and it is what every
  -- family-triggered observation passes.
  --
  -- The split is a security boundary rather than an optimisation. The emailed
  -- link is a signed token that names exactly one participation and never
  -- expires as a signature — the five-day window is checked against the row,
  -- not against the token's age — so an old leaked link is a credential that
  -- goes on working as a trigger forever. Unscoped, that made it a permanent,
  -- unthrottled trigger for a platform-wide write and a fan-out of staff mail
  -- about families the clicker has nothing to do with. Scoped, the worst a
  -- leaked link can do is claim the notification for the one row it already
  -- names. The in-app answer passes its own id for the same reason: a
  -- credential that names one row may only claim that row, whatever kind of
  -- credential it is.
  --
  -- SILENCE COSTS THE PLACE IN LINE, AND IT IS SPENT HERE
  --
  -- The claim is also where the family goes to the back of the queue. An offer
  -- that ran out unanswered is a turn that came up and was not taken, and
  -- holding the position through it would mean the same family is asked first
  -- again next time while everybody behind them waits a second round for an
  -- answer that never comes.
  --
  -- `clock_timestamp()`, NOT `now()`, and that is the 00117 rule rather than a
  -- preference: `waitlisted_at` is the key that ORDERS ROWS AGAINST EACH OTHER,
  -- and `now()` is frozen at transaction start — so a platform-wide sweep
  -- claiming three lapsed offers in one statement would stamp all three
  -- identically and leave their new order to the `id` tiebreaker rather than to
  -- anything meaningful. `seat_offer_expiry_notified_at` beside it keeps
  -- `now()` for the opposite reason: it is a deadline-shaped record of when we
  -- told staff, compared against nothing but itself.
  --
  -- The two offer stamps are deliberately LEFT ALONE. `seat_offer_sent_at`
  -- surviving is what the emailed token's compare-and-swap still matches
  -- against — a late decline has to keep working, and the landing page tells an
  -- expired link apart from a used one by exactly that value — and the notified
  -- stamp is what makes this claim exactly-once. A re-offer replaces both, so
  -- the row is still re-offerable and a second silence notifies again.
  WITH claimed AS (
    UPDATE public.participations p
       SET seat_offer_expiry_notified_at = now(),
           waitlisted_at                 = clock_timestamp()
     WHERE p.status = 'waitlisted'::public.participation_status
       AND p.seat_offer_sent_at IS NOT NULL
       AND p.seat_offer_sent_at + interval '5 days' <= now()
       AND p.seat_offer_expiry_notified_at IS NULL
       AND (p_participation_id IS NULL OR p.id = p_participation_id)
    RETURNING p.id, p.product_id, p.customer_id, p.participant_id, p.seat_offer_sent_at
  )
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'participation_id', c.id,
               'product_id',       c.product_id,
               'customer_id',      c.customer_id,
               'participant_id',   c.participant_id,
               'sent_at',          c.seat_offer_sent_at
             )
             ORDER BY c.seat_offer_sent_at, c.id
           ),
           '[]'::jsonb
         )
    INTO v_claimed
    FROM claimed c;

  RETURN v_claimed;
END;
$$;


--
-- Name: FUNCTION claim_expired_seat_offer_notifications(p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_expired_seat_offer_notifications(p_participation_id uuid) IS 'Claim seat offers that have run out unanswered and have not been reported to staff, and return what the mails need. One data-modifying CTE does both halves, which is what makes the notification exactly-once under concurrency: a second sweep re-evaluates seat_offer_expiry_notified_at IS NULL after the first commits and claims nothing, with no advisory lock and nothing held across the send. TWO MODES, and the argument is a security boundary rather than an optimisation. p_participation_id NULL sweeps the whole platform and is what the ADMIN surfaces pass — an admin opening the dashboard or a groups panel is entitled to observe every lapsed offer. A non-NULL id claims that row and nothing else, and is what every FAMILY-triggered observation passes: the emailed link is a signed token naming exactly one participation whose signature never expires, so unscoped it was a permanent unthrottled trigger for a platform-wide write; scoped, the worst a leaked link can do is claim the notification for the row it already names. The in-app answer passes its own id on the same rule — a credential that names one row may only claim that row. There is deliberately no cron job — expiry is OBSERVED rather than scheduled. SILENCE COSTS THE PLACE IN LINE: the same statement re-stamps waitlisted_at with clock_timestamp(), moving each claimed family to the back of the queue, because a turn that came up and was not taken must not be offered first again while everybody behind waits another round. clock_timestamp() rather than now() on the 00117 rule — waitlisted_at orders rows against each other, and a sweep claiming several rows in one frozen transaction time would stamp them all identically. The two offer stamps are left alone: seat_offer_sent_at is what the emailed token still compares against (a late decline keeps working, and the landing page tells an expired link from a used one by that value) and the notified stamp is what makes this claim exactly-once. The claimed rows stay waitlisted, so the offer is still re-offerable and a second silence notifies again. Service-role only; the route establishes who is calling.';


--
-- Name: claim_group_session_report_email(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.group_sessions;
BEGIN
  -- The same two-part gate every write on this surface opens with: the role
  -- first, then the assignment. Guard-first is what the authorization spine
  -- reads, and the assignment half is what makes a NULL group a refusal rather
  -- than a lookup — for a gedu. An admin passes the second half by role.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE is the whole of the concurrency argument. Two writers (or one
  -- writer with two tabs) serialize here; the second reads the marker the first
  -- committed and is refused below rather than claiming a second time.
  SELECT * INTO v_row
    FROM public.group_sessions s
   WHERE s.group_id     = p_group_id
     AND s.session_date = p_session_date
     FOR UPDATE;

  -- A session row is lazily materialized, so "no row" and "a row with a blank
  -- report" are the same answer to the only question that matters: there is
  -- nothing here to send. The character list matches the summaries SQL exactly
  -- — bare btrim() strips spaces only, and a report of one newline is not a
  -- report.
  IF NOT FOUND
     OR btrim(COALESCE(v_row.report, ''), E' \t\r\n\v\f') = '' THEN
    RAISE EXCEPTION 'No report to email for group % on %', p_group_id, p_session_date
      USING ERRCODE = 'P0021';
  END IF;

  IF v_row.report_emailed_at IS NOT NULL THEN
    RAISE EXCEPTION 'The report for group % on % was already emailed at %',
                    p_group_id, p_session_date, v_row.report_emailed_at
      USING ERRCODE = 'P0022';
  END IF;

  -- `updated_by` is deliberately NOT stamped: claiming the send is not an edit
  -- of the write-up, and moving the author chip onto whoever pressed the button
  -- would misattribute somebody else's report. The updated_at trigger still
  -- fires, which is the honest record that the row changed.
  UPDATE public.group_sessions
     SET report_emailed_at = now(),
         report_emailed_by = (SELECT auth.uid())
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  -- The report travels back so the route composes the mail from what the claim
  -- committed, not from what the client believed was saved.
  RETURN jsonb_build_object(
    'id',                v_row.id,
    'group_id',          v_row.group_id,
    'session_date',      v_row.session_date,
    'starts_at',         v_row.starts_at,
    'ends_at',           v_row.ends_at,
    'report',            v_row.report,
    'report_emailed_at', v_row.report_emailed_at
  );
END;
$$;


--
-- Name: FUNCTION claim_group_session_report_email(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) IS 'Claim the one send of a session report to the group''s families, and hand back the row it claimed. Open to an ADMIN or to the gedu assigned to the group (00200), exactly as the session-notes writer is. Takes the row''s lock, then refuses with SQLSTATE P0021 when there is no report to send (no row, or a report that is empty after the same whitespace trim the summaries SQL applies) and with P0022 when report_emailed_at is already set — both bind an admin identically; otherwise stamps report_emailed_at = now() and report_emailed_by = auth.uid(). The claim is the FIRST write of the send and is also its authorization: succeeding proves the caller may send for this group, which is what lets the route resolve recipients with the service role afterwards. Releasing a claim is the route''s job and happens only when every single mail failed.';


--
-- Name: confirm_paid_participation(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_conflict_id      UUID;
  v_conflict_session TEXT;
  v_conflict_status  public.participation_status;
  v_participation_id UUID;
BEGIN
  PERFORM 1 FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Pre-check the partial UNIQUE on (product_id, participant_id): under the gate lock
  -- this decides the outcome, and the index itself is left as the backstop.
  SELECT id, status, stripe_checkout_session_id
    INTO v_conflict_id, v_conflict_status, v_conflict_session
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status    IN ('active', 'waitlisted', 'completed')
    LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    IF v_conflict_session IS NOT NULL
       AND v_conflict_session = p_checkout_session_id THEN
      RETURN jsonb_build_object(
        'kind', 'confirmed',
        'participation_id', v_conflict_id,
        'idempotent', TRUE
      );
    END IF;

    RETURN jsonb_build_object(
      'kind', 'duplicate_payment',
      'existing_participation_id', v_conflict_id,
      'existing_status', v_conflict_status::text
    );
  END IF;

  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, stripe_checkout_session_id
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'active', p_checkout_session_id
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'kind', 'confirmed',
    'participation_id', v_participation_id,
    'idempotent', FALSE
  );
END;
$$;


--
-- Name: FUNCTION confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text) IS 'Creates the active participation for a paid signup once Stripe confirms payment. service_role only — the arguments come from Checkout Session metadata we wrote. Deliberately audience-ungated: validation happened before the money, and this after-money recorder refusing would strand a charge with no seat. Returns kind=confirmed with participation_id (idempotent=true when this same session already bought the seat), or kind=duplicate_payment with existing_participation_id when a different payment already put this participant on this product.';


--
-- Name: count_active_seats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_active_seats(p_product_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COUNT(*)::INTEGER
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'active';
$$;


--
-- Name: create_gamer(uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type DEFAULT NULL::public.gender_type, p_minecraft_username text DEFAULT NULL::text, p_minecraft_uuid text DEFAULT NULL::text, p_roblox_username text DEFAULT NULL::text, p_roblox_user_id bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  -- Promote the trigger-seeded customer profile to a gamer. Gate on role =
  -- 'customer' so this can't corrupt an already-promoted gamer or an admin/gedu,
  -- and so a double-call fails on the second pass. Keep the synthetic email
  -- handle_new_user() copied from auth.users — gamers are email-first.
  update public.profiles
  set role = 'gamer',
      first_name = p_first_name,
      last_name = p_last_name
  where id = p_gamer_id
    and role = 'customer';

  if not found then
    raise exception 'No promotable customer profile % found for gamer creation', p_gamer_id;
  end if;

  -- Swap extension tables: drop the customer row handle_new_user() created,
  -- add the gamer row.
  delete from public.customer_profiles where user_id = p_gamer_id;

  insert into public.gamer_profiles (user_id, date_of_birth, gender)
  values (p_gamer_id, p_date_of_birth, p_gender);

  -- Optional Minecraft link. Nothing here can reject a username: the account may
  -- be shared with another Sogverse user, and an unresolvable one simply lands
  -- with a null uuid. The insert is inside this transaction so a failure from any
  -- other cause still aborts the whole creation rather than leaving a half-built
  -- gamer.
  if p_minecraft_username is not null then
    insert into public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
    values (p_gamer_id, p_minecraft_username, p_minecraft_uuid);
  end if;

  -- Optional Roblox link, on exactly the same terms: a shared account is fine,
  -- a handle Roblox could not resolve lands with a null account id, and the two
  -- platforms are independent — a child may have given one, both, or neither.
  if p_roblox_username is not null then
    insert into public.roblox_accounts (user_id, roblox_username, roblox_user_id)
    values (p_gamer_id, p_roblox_username, p_roblox_user_id);
  end if;

  -- Link to the parent. The validate_parent_gamer_on_insert trigger re-checks
  -- both roles, so this must run after the promote above.
  insert into public.parent_gamer (parent_id, gamer_id)
  values (p_parent_id, p_gamer_id);
end;
$$;


--
-- Name: create_participation(uuid, uuid, uuid, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product               public.products;
  v_eff_status            public.effective_product_status;
  v_seats_taken           INTEGER;
  v_existing_id           UUID;
  v_existing_status       public.participation_status;
  v_participation_id      UUID;
  v_is_parent             BOOLEAN;
  v_auto_group_id         UUID;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- WHO IS IN THE SEAT, and whether this product admits them.
  --
  -- Plain `=`, deliberately not `IS NOT DISTINCT FROM`: two NULL ids are not a
  -- self seat, they are a caller with nothing to say, and the NULL comparison
  -- drops them into the ELSE branch where the parent-link check refuses them.
  -- Fail-closed falls out of the operator rather than out of a guard somewhere
  -- above.
  IF p_participant_id = p_customer_id THEN
    -- The adult's own seat. This function has no auth.uid() (service_role
    -- only), so "self" can only mean participant = the customer the route
    -- pinned to the session user — which is the same footing the parent-link
    -- check has always stood on.
    IF NOT v_product.for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- Somebody else's seat. The parent-link requirement is unchanged and is
    -- what keeps "a parent can never enroll another adult" true: an unlinked
    -- adult fails here exactly as an unlinked child does.
    SELECT EXISTS (
      SELECT 1 FROM public.parent_gamer
      WHERE parent_id = p_customer_id AND gamer_id = p_participant_id
    ) INTO v_is_parent;
    IF NOT v_is_parent THEN
      RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_participant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_product.for_gamers THEN
      RAISE EXCEPTION 'product % is not open to gamers', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_eff_status := public.effective_status(p_product_id);
  IF v_eff_status NOT IN ('pending', 'running') THEN
    RAISE EXCEPTION 'product is not accepting signups (effective status: %)', v_eff_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_product.registration_opens_at IS NOT NULL
     AND v_product.registration_opens_at > NOW() THEN
    RAISE EXCEPTION 'registration has not yet opened'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_currency NOT IN ('eur', 'gbp', 'usd') THEN
    RAISE EXCEPTION 'unsupported currency: %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_purchase_shape NOT IN (
    'subscription_monthly', 'single_payment', 'free', 'external'
  ) THEN
    RAISE EXCEPTION 'unsupported purchase shape: %', p_purchase_shape
      USING ERRCODE = 'check_violation';
  END IF;

  -- The already-enrolled gate. Its status list has to match the one
  -- `confirm_paid_participation` conflicts on, or a signup can pass here, take
  -- the parent's money, and then be refused at confirmation with nothing to
  -- show for it. 'completed' is the member that was missing: nothing writes
  -- that status today, so the gap was unreachable rather than harmless.
  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status IN ('active', 'waitlisted', 'completed')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a participation on this product (status: %)', p_participant_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Seat-count gate. Sits above the free / external branches so an explicit cap
  -- on a no-charge product (the schema permits it, incl. municipality clubs) is
  -- honored — earlier versions only checked the cap on paid signups, so a free
  -- product with seat_count=20 silently accepted the 21st signup. A parent's
  -- own seat counts here like anybody else's: the cap is on seats, not on
  -- children.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_active_seats(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  -- THE ENROLMENT CONDITIONS (00210). Every gate above has passed and a seat is
  -- available, so this signup is one the platform will accept — which is
  -- precisely when the product's required consents bind. Raises check_violation
  -- naming any document the caller did not agree to; otherwise writes one
  -- acceptance row per required document at that document's current version.
  -- Runs for EVERY purchase shape, the paid ones included: they write no
  -- participation row here, but the parent agreed here, so the record belongs
  -- here. A no-op for the overwhelming majority of products, which require
  -- nothing.
  --
  -- The customer is BOTH the agreeing party and the actor on this path (00212):
  -- a parent enrolling their own child ticked the boxes themselves, which is
  -- exactly what distinguishes these rows from the ones an admin writes through
  -- admin_enroll_participant.
  PERFORM public.record_required_consents(
    p_product_id, p_customer_id, p_participant_id, p_customer_id,
    p_consented_documents
  );

  -- AUTOMATIC PLACEMENT (00206), for the two branches below that seat somebody
  -- on the spot. A no-charge product with exactly one group has no placement
  -- decision left in it, so the seat goes straight into that group instead of
  -- into the unassigned inbox; zero groups has nowhere to put anyone, and two
  -- or more is a real decision that stays a human's. NULL out of this read is
  -- the unassigned inbox, which is what every enrollment did before.
  --
  -- Safe against a concurrent group edit because the product row is held FOR
  -- UPDATE above — the same lock the group editor takes. LIMIT 2 because the
  -- question is "exactly one?", not "how many?".
  IF public.is_no_charge(v_product.billing_mode) THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
      INTO v_auto_group_id
      FROM (
        SELECT id FROM public.product_groups
         WHERE product_id = p_product_id
         LIMIT 2
      ) g;
  END IF;

  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    -- group_joined_at is absent on purpose: the BEFORE INSERT trigger stamps it
    -- from group_id, and the table comment forbids writing it by hand.
    INSERT INTO public.participations (
      product_id, participant_id, customer_id, status, group_id
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active', v_auto_group_id
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'free_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Municipality clubs are invoiced off-platform: no Stripe, nothing to
  -- confirm later. Mirrors the free branch (instant active), gated on
  -- billing_mode so a paid product can never be registered without payment.
  IF p_purchase_shape = 'external' THEN
    IF v_product.billing_mode <> 'external_contract' THEN
      RAISE EXCEPTION 'product is not externally contracted'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations (
      product_id, participant_id, customer_id, status, group_id
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active', v_auto_group_id
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'external_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Paid shapes (subscription_monthly, single_payment). Everything above has
  -- passed, so this signup is one the platform would accept — but no row is
  -- written until the money arrives. The caller creates the Stripe Checkout
  -- Session next; if the parent abandons it, nothing was left behind to clean
  -- up. `confirm_paid_participation` writes the row from the webhook.
  RETURN jsonb_build_object('kind', 'validated');
END;
$$;


--
-- Name: FUNCTION create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]) IS 'The family self-enrollment gate: validates one signup against the product (audience, effective status, registration window, currency, purchase shape, duplicate seat, seat cap) and then either writes the seat or reports that the caller may go and take the money. The two no-charge shapes — free and external (municipality, invoiced off-platform) — insert an active row here and now; the paid shapes return kind=''validated'' and nothing is written until confirm_paid_participation runs from the Stripe webhook, so an abandoned Checkout leaves nothing behind. Holds the product row FOR UPDATE from its first statement, which is what makes the seat-cap count and the group read below race-free against a concurrent signup or group edit. Since 00206 the two instant-active branches place the seat automatically when the product charges nothing AND has exactly one group: that combination has no placement decision left in it, so the row lands in that group rather than in the unassigned inbox. Zero groups, two or more groups, or any paid product still land group_id NULL — the inbox — and whether the single group has a gedu assigned is not consulted. group_joined_at is never written here; a trigger stamps it from group_id. Since 00210 it takes p_consented_documents and, just after the seat-cap gate, calls record_required_consents: an enrolment onto a product with required consent documents is refused with check_violation unless the array covers all of them, and otherwise records one acceptance row per required document at that document''s current version. That runs for EVERY purchase shape — the paid ones write no participation row here, but the parent agreed here, so the record is made here, and an acceptance behind an abandoned Checkout is a harmless true statement. A full product returns kind=''full'' before any of it, because nobody enrolled. Since 00212 it names p_customer_id as the acceptance''s accepted_by as well as its customer: on this path the parent ticked the boxes themselves, which is what tells these rows apart from the ones admin_enroll_participant writes. service_role only: this function has no auth.uid() and trusts the calling route to have pinned p_customer_id to the session user.';


--
-- Name: create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_status public.product_status DEFAULT 'pending'::public.product_status, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[]) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id    UUID;
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_material_url  TEXT := NULLIF(btrim(COALESCE(p_material_url, '')), '');
BEGIN
  PERFORM public.assert_admin();

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- image_path is absent from this INSERT on purpose (00198): a product's
  -- picture is the catalogue entry it points at, the route writes image_id in
  -- its own statement after this one, and the trigger on products derives the
  -- served path from it.
  INSERT INTO public.products (
    product_type, billing_mode, topic,
    min_age, max_age, spoken_language_code,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents,
    for_gamers, for_parents, tag, region_lock_country
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents,
    p_for_gamers, p_for_parents, p_tag, p_region_lock_country
  )
  RETURNING id INTO v_product_id;

  -- Staff-only, so it lands in its own table. No row when there is no link.
  IF v_material_url IS NOT NULL THEN
    INSERT INTO public.product_staff_details (product_id, material_url)
    VALUES (v_product_id, v_material_url);
  END IF;

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      v_product_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      v_translation->>'long_description'
    );
  END LOOP;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        v_product_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_cents
      )
      VALUES (
        v_product_id,
        v_price->>'currency',
        (v_price->>'price_cents')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT v_product_id, unnest(p_holiday_calendar_ids);
  END IF;

  -- The enrolment conditions (00210). Delegated rather than written inline
  -- because this function is SECURITY INVOKER and product_required_consents
  -- carries no write grant for `authenticated` — the guarded DEFINER writer is
  -- what makes that possible. Unconditional: NULL means "requires nothing",
  -- which on a create is the same as doing nothing, and calling it anyway keeps
  -- this function and update_product reading identically.
  PERFORM public.set_product_required_consents(v_product_id, p_required_consent_slugs);

  RETURN v_product_id;
END;
$$;


--
-- Name: FUNCTION create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, holiday calendars, the staff-only material link and, since 00210, the consent documents enrolling on it requires. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag (00178) IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country (00193) is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. p_required_consent_slugs (00210) is defaulted on the same argument and is NOT written inline: this function is SECURITY INVOKER and product_required_consents carries no write grant, so the row goes through set_product_required_consents, the join table''s single guarded writer. This function does NOT take a picture: 00198 dropped p_image_path, because a product''s picture is the product_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone.';


--
-- Name: delete_group_session_image(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_group_session_image(p_image_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_group_id uuid;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  SELECT s.group_id
    INTO v_group_id
    FROM public.group_session_images i
    JOIN public.group_sessions s ON s.id = i.session_id
   WHERE i.id = p_image_id;

  -- No row and somebody else's row answer the same way. Deliberate: the caller
  -- has no right to learn which of the two it was.
  IF v_group_id IS NULL
     OR (NOT public.is_admin() AND NOT public.gedu_teaches_group(v_group_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.group_session_images WHERE id = p_image_id;
END;
$$;


--
-- Name: FUNCTION delete_group_session_image(p_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.delete_group_session_image(p_image_id uuid) IS 'Remove one photo''s ROW from a session''s report. Open to an ADMIN or to ANY gedu assigned to the group — there is no per-photo ownership, matching how the report itself is edited under the last-editor model. Guard-first on assert_role; the group is then resolved from the image''s own session row, and that resolution is the second half of the gate. A photo id that belongs to another group and one that belongs to nothing are refused identically with 42501, so this cannot be used as an oracle for real photo ids. The route calls this LAST: since 00224 it authorizes with assert_can_delete_session_image, removes the OBJECT through the Storage API (never with SQL against storage.objects, which orphans the backing file), and only then deletes the row here — so that a removal which failed to remove the picture leaves the photo on the card, visible and retryable, instead of taking the tile away while the object stands in a public bucket. This function''s own guard is not replaced by that check; it runs again on the actual delete. A row that survives a failed delete after its object is gone renders as a broken thumbnail, and the ordinary remove control is its repair: the storage API answers a delete of an absent object as success, so the retry reaches here and clears the row.';


--
-- Name: demote_to_waitlist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demote_to_waitlist(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id UUID;
  v_status     public.participation_status;
  v_live_sub   TEXT;
  v_now        TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- The product gate lock, as before. The product's TYPE is not read: nothing
  -- in this function branches on it.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- A LIVE subscription, not merely a row. participation_id is UNIQUE here and
  -- stripe_subscription_id is NOT NULL, so at most one row can match — but the
  -- webhook updates status in place instead of deleting, and a subscription
  -- Stripe gave up dunning (`unpaid`, stored as `cancelled`) never fires
  -- subscription.deleted. Treating that dead row as live made this refusal
  -- permanent: the seat could never be waitlisted, and the family had nothing
  -- left to cancel. `cancelled` is the only terminal value; past_due,
  -- incomplete and canceling can all still bill and still refuse.
  --
  -- What is being protected is unchanged: demoting a genuinely subscribed
  -- family puts a live subscription on a waitlisted row, which the parent's own
  -- leave affordance can delete — CASCADEing family_subscriptions away while
  -- Stripe keeps billing.
  --
  -- Refused for the operation, not for the row's current state — so this
  -- precedes the idempotent noop below.
  SELECT stripe_subscription_id INTO v_live_sub
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id
      AND status <> 'cancelled';
  IF v_live_sub IS NOT NULL THEN
    RAISE EXCEPTION
      'participation % still has live Stripe subscription %',
      p_participation_id, v_live_sub
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Idempotent: already on the waitlist.
  IF v_status = 'waitlisted' THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'only an active participation can be moved to the waitlist (status: %)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Back of the line: clock_timestamp() under the gate lock is monotonic with
  -- real ordering (00117 rule). Clear group_id — waitlisted gamers aren't grouped.
  v_now := clock_timestamp();
  UPDATE public.participations
     SET status = 'waitlisted',
         waitlisted_at = v_now,
         group_id = NULL
   WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'demoted',
    'participation_id', p_participation_id,
    'product_id', v_product_id
  );
END;
$$;


--
-- Name: FUNCTION demote_to_waitlist(p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) IS 'Admin-gated demotion of an active participation to the back of the product waitlist, under the product gate lock. Refuses any participation carrying a LIVE Stripe subscription — a family_subscriptions row whose status is anything but ''cancelled'' — on any product type: a waitlisted row can be deleted by the parent via leave_my_waitlist_spot, which cascades family_subscriptions and orphans a subscription that keeps billing. A ''cancelled'' row is explicitly not live: dunning-exhausted subscriptions are stored that way and never fire subscription.deleted, so counting them would hold the seat hostage forever. Raised with the same errcode admin_remove_participation uses for the same condition.';


--
-- Name: derive_group_session_window(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) RETURNS tstzrange
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_timezone text;
  v_start    time;
  v_duration integer;
  v_starts   timestamptz;
BEGIN
  IF p_group_id IS NULL OR p_session_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.timezone
    INTO v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  IF v_timezone IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.start_time, s.duration_minutes
    INTO v_start, v_duration
    FROM public.product_groups g
    JOIN public.schedule_slots s ON s.product_id = g.product_id
   WHERE g.id = p_group_id
     -- schedule_slots.weekday is 0 = Monday; ISODOW is 1 = Monday.
     AND s.weekday = (EXTRACT(ISODOW FROM p_session_date)::integer - 1)
   ORDER BY s.start_time
   LIMIT 1;

  IF v_start IS NULL THEN
    RETURN NULL;
  END IF;

  -- `timestamp AT TIME ZONE zone` resolves a wall-clock time in that zone to
  -- the correct instant, so this is DST-correct without any arithmetic of our
  -- own. Adding the duration to the INSTANT (not to the wall clock) keeps a
  -- session that straddles a transition the right length.
  v_starts := (p_session_date + v_start) AT TIME ZONE v_timezone;

  RETURN tstzrange(
    v_starts,
    v_starts + make_interval(mins => v_duration),
    '[)'
  );
END;
$$;


--
-- Name: FUNCTION derive_group_session_window(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) IS 'Server-side derivation of a session''s scheduled instants from the CURRENT schedule. Holiday-blind on purpose. NULL when the date matches no slot weekday.';


--
-- Name: effective_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.effective_status(p_product_id uuid) RETURNS public.effective_product_status
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_status            public.product_status;
  v_start_date        DATE;
  v_end_date          DATE;
  v_signup_threshold  INTEGER;
  v_timezone          TEXT;
  v_active_count      INTEGER;
  v_now_local         DATE;
  v_end_passed        BOOLEAN;
  v_has_date          BOOLEAN;
  v_has_threshold     BOOLEAN;
  v_start_reached     BOOLEAN;
  v_threshold_met     BOOLEAN;
  v_would_run         BOOLEAN;
BEGIN
  SELECT status, start_date, end_date, signup_threshold, timezone
    INTO v_status, v_start_date, v_end_date, v_signup_threshold, v_timezone
    FROM public.products
    WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status = 'cancelled' THEN RETURN 'cancelled'; END IF;
  IF v_status = 'completed' THEN RETURN 'completed'; END IF;

  v_now_local := (NOW() AT TIME ZONE v_timezone)::DATE;
  v_end_passed := v_end_date IS NOT NULL AND v_end_date < v_now_local;

  IF v_status = 'running' THEN
    RETURN CASE WHEN v_end_passed THEN 'completed' ELSE 'running' END;
  END IF;

  -- v_status = 'pending'
  v_has_date := v_start_date IS NOT NULL;
  v_has_threshold := v_signup_threshold IS NOT NULL;
  v_start_reached := NOT v_has_date OR v_start_date <= v_now_local;

  IF v_has_threshold THEN
    SELECT COUNT(*) INTO v_active_count
      FROM public.participations
      WHERE product_id = p_product_id AND status = 'active';
    v_threshold_met := v_active_count >= v_signup_threshold;
  ELSE
    v_threshold_met := TRUE;
  END IF;

  v_would_run := (v_has_date OR v_has_threshold) AND v_start_reached AND v_threshold_met;

  IF v_would_run THEN
    RETURN CASE WHEN v_end_passed THEN 'completed' ELSE 'running' END;
  END IF;

  RETURN CASE WHEN v_end_passed THEN 'expired' ELSE 'pending' END;
END;
$$;


--
-- Name: ensure_group_session(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_group_session(p_group_id uuid, p_session_date date) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_window     tstzrange;
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
BEGIN
  SELECT id INTO v_session_id
    FROM public.group_sessions
   WHERE group_id = p_group_id AND session_date = p_session_date;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  v_window := public.derive_group_session_window(p_group_id, p_session_date);
  IF v_window IS NULL THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.group_sessions (
    group_id, session_date, starts_at, ends_at, created_by, updated_by
  )
  VALUES (
    p_group_id, p_session_date, lower(v_window), upper(v_window), v_uid, v_uid
  )
  ON CONFLICT (group_id, session_date) DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    -- A concurrent writer materialized it between the SELECT and the INSERT.
    -- Theirs is the snapshot; take it rather than overwriting.
    SELECT id INTO v_session_id
      FROM public.group_sessions
     WHERE group_id = p_group_id AND session_date = p_session_date;
  END IF;

  RETURN v_session_id;
END;
$$;


--
-- Name: FUNCTION ensure_group_session(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ensure_group_session(p_group_id uuid, p_session_date date) IS 'Find-or-create the session row for a (group, date), snapshotting the schedule instants at first write and never re-deriving them afterwards.';


--
-- Name: ensure_product_keeps_at_least_one_translation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_product_keeps_at_least_one_translation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- Allowed if at least one OTHER row will remain after this delete.
  IF EXISTS (
    SELECT 1 FROM public.product_translations
    WHERE product_id = OLD.product_id
      AND locale <> OLD.locale
  ) THEN
    RETURN OLD;
  END IF;

  -- The product itself is being deleted — CASCADE delete is fine.
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = OLD.product_id
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Each product must keep at least one translation'
    USING ERRCODE = 'check_violation';
END;
$$;


--
-- Name: gedu_teaches_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_teaches_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
     WHERE ga.group_id = p_group_id
       AND ga.gedu_id  = (SELECT auth.uid())
  );
$$;


--
-- Name: FUNCTION gedu_teaches_group(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_teaches_group(p_group_id uuid) IS 'Internal predicate: is the caller assigned to this group? Not exposed to authenticated — it is called from inside the SECURITY DEFINER gedu RPCs.';


--
-- Name: gedu_teaches_group_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_teaches_group_product(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- One join, because gedu_group_assignments carries product_id alongside
  -- group_id: "any group of this group's product" is a single-table EXISTS
  -- rather than a walk back through products.
  SELECT EXISTS (
    SELECT 1
      FROM public.product_groups g
      JOIN public.gedu_group_assignments a ON a.product_id = g.product_id
     WHERE g.id = p_group_id
       AND a.gedu_id = (SELECT auth.uid())
  );
$$;


--
-- Name: FUNCTION gedu_teaches_group_product(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_teaches_group_product(p_group_id uuid) IS 'Internal predicate: is the caller a gedu assigned to ANY group of this group''s product? The same question gedu_teaches_group asks, widened from one group to the whole product — which is the cross-group mobility the member-flair RPCs need, because a substitute standing in for another group is exactly the person who needs the note. Gedu-only and composed with is_admin() at each call site, the dominant pattern in this schema. NOT exposed to authenticated: it is called from inside SECURITY DEFINER RPCs and from nowhere else — in particular from no RLS policy, which is what lets it stay private, since a policy predicate is evaluated as the querying role and would have forced a grant. is_voice_group_moderator computes the same thing with is_admin() folded in; it is deliberately left alone rather than reused or renamed, because the voice_zones and voice_private_zone_occupants policies reference it and its name would make a note read look like a voice concern.';


--
-- Name: get_admin_dashboard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_users     jsonb;
  v_queue     jsonb;
  v_attention jsonb;
  v_schedule  jsonb;
BEGIN
  PERFORM public.assert_admin();

  -- ---------------------------------------------------------------------------
  -- 1. The users strip: one tile per role, always all of them.
  --
  -- Driven by `enum_range` rather than by what `profiles` happens to contain, so
  -- a role with no accounts renders a zero tile instead of vanishing — and a
  -- role added to the enum later arrives here without an edit.
  --
  -- Two stats are NULL rather than 0, and the difference is the point. A gamer's
  -- address is a synthetic @gamer.sogverse.internal handle nobody will ever click
  -- a link in, so "0 verified" would report a problem that does not exist; NULL
  -- means the stat has no meaning for that role. `certified` is the same shape
  -- for the same reason — only an educator can be certified.
  -- ---------------------------------------------------------------------------
  SELECT jsonb_agg(
           jsonb_build_object(
             'role',      r.role_name,
             'total',     COALESCE(c.total, 0),
             'verified',  CASE WHEN r.role_name = 'gamer' THEN NULL
                               ELSE COALESCE(c.verified, 0) END,
             'certified', CASE WHEN r.role_name = 'gedu' THEN COALESCE(c.certified, 0)
                               ELSE NULL END
           )
           ORDER BY r.ord
         )
    INTO v_users
    FROM unnest(enum_range(NULL::public.user_role))
           WITH ORDINALITY AS r(role_name, ord)
    LEFT JOIN (
      SELECT pr.role,
             count(*)                                                 AS total,
             count(*) FILTER (WHERE pr.email_verified_at IS NOT NULL)  AS verified,
             count(*) FILTER (WHERE gp.certified)                      AS certified
        FROM public.profiles pr
        LEFT JOIN public.gedu_profiles gp ON gp.user_id = pr.id
       GROUP BY pr.role
    ) c ON c.role = r.role_name;

  -- ---------------------------------------------------------------------------
  -- 2. The certification queue: educators waiting on an admin's decision.
  --
  -- An INNER JOIN, deliberately. A gedu with no `gedu_profiles` row is a data
  -- error, and a LEFT JOIN would read that missing row as `certified = false` —
  -- putting a broken account in a queue whose only action (certify) writes to the
  -- row that is not there. Missing means excluded; the queue is for accounts that
  -- exist and are waiting.
  --
  -- `contract_accepted_at` (00201) is the candidate's standing against the
  -- CURRENT contract version, or NULL. It informs the certification decision and
  -- does not gate it — an unsigned candidate is still certifiable, and the admin
  -- is the one who decides what to make of the gap.
  --
  -- Standing is judged on the BASE version (00202): a version string is
  -- `<base>/<language>` and the languages of one version are the same agreement,
  -- so signing either makes a candidate current. min() because a candidate may
  -- hold both languages' rows — the first signature is the moment they agreed,
  -- and a scalar subquery would error rather than answer.
  --
  -- `criminal_record_check_at` (00213) is when an admin recorded seeing this
  -- candidate's criminal record extract, or NULL if none has been recorded. The
  -- flag beside it is deliberately not shipped: the stamp is non-NULL exactly
  -- when the flag is true, so a second field could only ever contradict the
  -- first. It informs the decision on the same terms as the contract stamp and
  -- gates nothing either.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         pr.id,
               'first_name', pr.first_name,
               'last_name',  pr.last_name,
               'created_at', pr.created_at,
               'contract_accepted_at', (
                 SELECT min(ca.accepted_at)
                   FROM public.gedu_contract_acceptances ca
                  WHERE ca.gedu_id = pr.id
                    AND split_part(ca.contract_version, '/', 1) = (
                          SELECT split_part(v.version, '/', 1)
                            FROM public.gedu_contract_versions v
                           ORDER BY v.created_at DESC, v.version DESC
                           LIMIT 1
                        )
               ),
               'criminal_record_check_at', gp.criminal_record_check_at
             )
             ORDER BY pr.created_at, pr.id
           ),
           '[]'::jsonb
         )
    INTO v_queue
    FROM public.profiles pr
    JOIN public.gedu_profiles gp ON gp.user_id = pr.id
   WHERE pr.role = 'gedu'
     AND gp.certified = false;

  -- ---------------------------------------------------------------------------
  -- 3. The attention queue: live products with at least one thing wrong.
  --
  -- Five kinds of wrong, and each is stated as the fact rather than as a sentence
  -- — the page words them, because the wording is translated copy.
  --
  --   * `unassigned_count`  — active seats sitting in no group. A child enrolled
  --                           and nobody looking after them is the worst of these.
  --   * `groups_without_gedu` — a group with members and no educator assigned. An
  --                           EMPTY group is not flagged: an admin building the
  --                           term's groups ahead of time has not made a mistake.
  --   * `waitlist`          — people queueing while seats stand open AND those
  --                           seats have not all been offered to somebody. Only
  --                           meaningful on a capped product with the queue
  --                           switched on. NULL when there is nothing to say.
  --   * `missing_gedu_fee`  — NULL, not zero. Zero is a volunteer session, which
  --                           is a decision somebody made; NULL is a blank field.
  --                           The assistant fee is never flagged — NULL there
  --                           means "no assistant", which is the ordinary case.
  --   * `missing_municipality_fee` — municipality clubs only; the CHECK already
  --                           forbids the column elsewhere.
  --
  -- A product with none of them is not in the list at all.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(a.doc ORDER BY a.product_id), '[]'::jsonb)
    INTO v_attention
    FROM (
      WITH candidate AS (
        SELECT p.*
          FROM public.products p
         WHERE p.status <> 'cancelled'
           AND public.effective_status(p.id) IN ('pending', 'running')
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',                  c.id,
               'product_type',        c.product_type,
               'translations',        tr.items,
               'unassigned_count',    ua.n,
               'groups_without_gedu', gw.items,
               'waitlist',
                 CASE WHEN wl.open_seats IS NOT NULL
                      THEN jsonb_build_object(
                             'waitlist_count',   wl.waitlist_count,
                             'open_seats',       wl.open_seats,
                             -- How many of those open seats already have a
                             -- family thinking about them (00207). Emitted so
                             -- the page can say why the number of open seats
                             -- and the size of the queue do not by themselves
                             -- explain the flag.
                             'live_offer_count', wl.live_offer_count
                           )
                 END,
               'missing_gedu_fee', (c.primary_gedu_fee_cents IS NULL),
               'missing_municipality_fee',
                 (c.product_type = 'municipality_club'
                  AND c.municipality_fee_cents IS NULL)
             ) AS doc
        FROM candidate c
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT count(*) AS n
            FROM public.participations pa
           WHERE pa.product_id = c.id
             AND pa.status = 'active'
             AND pa.group_id IS NULL
        ) ua
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                          )
                 ), '[]'::jsonb) AS items
        ) gw
        -- The waitlist flag asks "is there something for an admin to do here",
        -- not "is this product in an interesting state" (00207). An open seat
        -- that has already been offered to a family is being dealt with, so it
        -- is subtracted before the comparison; a product whose every open seat
        -- carries a live offer drops out of the queue entirely. When that family
        -- declines, or the five days run out, the live count falls and the flag
        -- comes back on its own — which is exactly why the count is derived
        -- from the stamp rather than stored anywhere.
        LEFT JOIN LATERAL (
          SELECT psc.waitlist_count,
                 c.seat_count - psc.active_count AS open_seats,
                 lo.n                            AS live_offer_count
            FROM public.product_seat_counts psc
            CROSS JOIN LATERAL (
              SELECT count(*)::integer AS n
                FROM public.participations po
               WHERE po.product_id = c.id
                 AND po.status = 'waitlisted'
                 AND po.seat_offer_sent_at IS NOT NULL
                 AND po.seat_offer_sent_at + interval '5 days' > now()
            ) lo
           WHERE psc.product_id = c.id
             AND c.waitlist_enabled
             AND psc.waitlist_count > 0
             AND c.seat_count IS NOT NULL
             AND psc.active_count < c.seat_count
             AND (c.seat_count - psc.active_count) > lo.n
        ) wl ON true
       WHERE ua.n > 0
          OR jsonb_array_length(gw.items) > 0
          OR wl.open_seats IS NOT NULL
          OR c.primary_gedu_fee_cents IS NULL
          OR (c.product_type = 'municipality_club'
              AND c.municipality_fee_cents IS NULL)
    ) a;

  -- ---------------------------------------------------------------------------
  -- 4. The schedule set: the calendar facts the page resolves weeks from.
  --
  -- Slots carry the weekday exactly as the column stores it (0 = Monday) and the
  -- start time as a bare HH:MM wall clock in the product's own zone — the admin
  -- schedule is deliberately read in the zone it was authored in.
  --
  -- Holidays are bounded to the same window as the products themselves: a
  -- calendar can hold years of dates and only the ones a visible week could land
  -- on mean anything here.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(s.doc ORDER BY s.product_id), '[]'::jsonb)
    INTO v_schedule
    FROM (
      WITH candidate AS (
        SELECT p.*, w.window_start, w.window_end
          FROM public.products p
          CROSS JOIN LATERAL (
            SELECT (now() AT TIME ZONE p.timezone)::date - 30 AS window_start,
                   ((now() AT TIME ZONE p.timezone)::date
                     + INTERVAL '4 months')::date             AS window_end
          ) w
         WHERE p.status NOT IN ('cancelled', 'completed')
           AND (
                 public.effective_status(p.id) IN ('pending', 'running')
              OR (p.end_date IS NOT NULL
                  AND p.end_date >= w.window_start
                  AND p.end_date <  w.window_end)
               )
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',             c.id,
               'product_type',   c.product_type,
               'translations',   tr.items,
               'timezone',       c.timezone,
               'start_date',     c.start_date,
               'end_date',       c.end_date,
               'seat_count',     c.seat_count,
               'active_count',   COALESCE(psc.active_count, 0),
               'waitlist_count', COALESCE(psc.waitlist_count, 0),
               'schedule_slots', sl.items,
               'holidays',       hol.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.product_seat_counts psc ON psc.product_id = c.id
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'weekday',          ss.weekday,
                              'start_time',       to_char(ss.start_time, 'HH24:MI'),
                              'duration_minutes', ss.duration_minutes
                            )
                            ORDER BY ss.weekday, ss.start_time
                          )
                     FROM public.schedule_slots ss
                    WHERE ss.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) sl
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(DISTINCT ch.date ORDER BY ch.date)
                     FROM public.product_holiday_calendars phc
                     JOIN public.calendar_holidays ch
                       ON ch.calendar_id = phc.calendar_id
                    WHERE phc.product_id = c.id
                      AND ch.date >= c.window_start
                      AND ch.date <  c.window_end
                 ), '[]'::jsonb) AS items
        ) hol
    ) s;

  RETURN jsonb_build_object(
    'users',              v_users,
    'certification_queue', v_queue,
    'attention_products', v_attention,
    'schedule_products',  v_schedule
  );
END;
$$;


--
-- Name: FUNCTION get_admin_dashboard(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_dashboard() IS 'The whole admin dashboard in one document: per-role user counts (email-verified and, for gedus, certified — both NULL where the stat has no meaning for the role), the uncertified-gedu queue, live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Since 00201 each queue candidate also carries contract_accepted_at — when they accepted the current gedu contract, or NULL — which informs the certification decision without gating it; since 00202 that standing is judged on the version''s BASE, so either equally binding language of the current version counts, and a candidate holding both carries the earlier of the two signatures. Since 00213 each candidate additionally carries criminal_record_check_at — when an admin recorded seeing their criminal record extract, or NULL — which informs the same decision on the same terms and gates nothing either; the flag beside it is not shipped because the stamp is non-NULL exactly when the flag is true. Since 00207 the waitlist attention item asks whether there is something for an admin to DO rather than what state the product is in: an open seat that already carries a live seat offer is subtracted, so a product whose every open seat has been offered drops out of the queue, and a decline or an expiry raises it again on its own. The count rides in the emitted object as live_offer_count so the page can explain the absence. Both product sections ask effective_status() rather than products.status, and every date window is computed in the product''s own timezone. Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';


--
-- Name: get_admin_product_sessions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_product_sessions(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product jsonb;
  v_site    jsonb;
  v_groups  jsonb;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- The schedule parameters and nothing else. The page already holds the
  -- product row from the admin product read; what it cannot get from there is
  -- the slot list in the shape the client's calendar walk takes, which is why
  -- these four fields travel and the rest do not.
  SELECT jsonb_build_object(
    'id',         p.id,
    'timezone',   p.timezone,
    'start_date', p.start_date,
    'end_date',   p.end_date,
    'is_remote',  p.is_remote,
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id;

  -- The venue, on in-person products only — the same test
  -- `get_gedu_group_feed` makes, and for the same reason: a remote municipality
  -- club carries a location_id (a municipality, by CHECK), so "has a location"
  -- would put a door code and a caretaker's name on a club with no building.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes,
    'gedu_note',   ssd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd        ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = p_product_id
    AND p.is_remote = false;

  -- Ordered by (created_at, id), which is the order the groups panel on the
  -- same page lists them in. The group selector sits directly above that panel;
  -- two orders on one page would be a bug the reader has to notice.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'created_at', entry->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',          g.id,
        'name',        g.name,
        'created_at',  g.created_at,
        'public_note', g.public_note,
        'gedu_note',   g.gedu_note,

        -- Register-shaped and nothing more: who may be marked, and what to call
        -- them. See 00200's header for why it is not the group feed's roster.
        'roster', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'participant_id', part.participant_id,
                   'first_name',     gmp.first_name
                 ) ORDER BY gmp.first_name)
            FROM public.participations part
            JOIN public.profiles gmp ON gmp.id = part.participant_id
           WHERE part.group_id = g.id
             AND part.status   = 'active'::public.participation_status
        ), '[]'::jsonb),

        -- Every stored row for the group, in the SAME shape
        -- `get_gedu_group_feed` emits — the two are read by one card component
        -- and must not disagree about what a session is. An orphan the schedule
        -- no longer projects is history and travels too.
        'sessions', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',                s.id,
                   'session_date',      s.session_date,
                   'starts_at',         s.starts_at,
                   'ends_at',           s.ends_at,
                   'report',            s.report,
                   'gedu_note',         s.gedu_note,
                   'created_at',        s.created_at,
                   'updated_at',        s.updated_at,
                   'created_by',        s.created_by,
                   'updated_by',        s.updated_by,
                   -- When the report was mailed to the families, NULL until it
                   -- was. Its audit partner `report_emailed_by` stays off the
                   -- wire here exactly as it does on the gedu feed.
                   'report_emailed_at', s.report_emailed_at,
                   -- The session's LAST EDITOR, not the report's author. An
                   -- admin who corrects one tick is named here, which is what
                   -- the chip on the card claims and is true.
                   'updated_by_first_name', (
                     SELECT pr.first_name
                       FROM public.profiles pr
                      WHERE pr.id = s.updated_by
                   ),
                   -- The session's photos (00222, reaching this document in
                   -- 00223). Byte-for-byte the gedu feed's aggregate, because
                   -- one card component renders both: {id, width, height} per
                   -- photo, ordered by (created_at, id) — the stamp is
                   -- clock_timestamp() taken under the session row's lock and
                   -- the id breaks a sub-tick tie, so every surface draws the
                   -- same order — and an empty array rather than a null when
                   -- there are none. `created_by` is deliberately off the wire,
                   -- for the same reason `report_emailed_by` above is: it is
                   -- safeguarding audit, it gates nothing and nothing renders
                   -- it. The URL is derived from the id by one helper rather
                   -- than stored.
                   'images', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                              'id',     img.id,
                              'width',  img.width,
                              'height', img.height
                            ) ORDER BY img.created_at, img.id)
                       FROM public.group_session_images img
                      WHERE img.session_id = s.id
                   ), '[]'::jsonb),
                   -- Sparse map keyed by participant id. A roster member absent
                   -- from it is UNMARKED, which is not 'absent'.
                   'attendance', COALESCE((
                     SELECT jsonb_object_agg(a.participant_id, a.status)
                       FROM public.session_attendance a
                      WHERE a.session_id = s.id
                   ), '{}'::jsonb)
                 ) ORDER BY s.session_date DESC)
            FROM public.group_sessions s
           WHERE s.group_id = g.id
        ), '[]'::jsonb)
      ) AS entry
        FROM public.product_groups g
       WHERE g.product_id = p_product_id
    ) AS group_rows;

  RETURN jsonb_build_object(
    'product', v_product,
    'site',    v_site,
    'groups',  v_groups
  );
END;
$$;


--
-- Name: FUNCTION get_admin_product_sessions(p_product_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) IS 'One round trip behind the admin product page''s Sessions panel: the product''s schedule parameters, its venue and site notes on an in-person product, and every group on it with its standing notes, its register roster and every stored session row with a sparse attendance map and, since 00223, its photos. Admin-only, guard-first on assert_admin. Product-keyed rather than group-keyed because the page shows one product and puts a group selector in front of the feed; asking per group would send the product shell and the site over the wire once per group. Contains no schedule expansion — the client owns the calendar math, exactly as it does for the gedu feed. The SESSION shape is get_gedu_group_feed''s verbatim, because one card component renders both and the two must not disagree about what a session is — which is why `images` ({id, width, height} per photo, ordered by (created_at, id), never the uploader) arrives here in the same shape and needs no versioned name: this document''s reader shares the gedu session''s tolerant schema, and only the strict family one needed get_my_family_product_feed_v2. The ROSTER deliberately is not the gedu feed''s — it carries participant_id and first_name alone, since the only thing this surface does with it is take the register, and the groups panel on the same page already answers who these people are.';


--
-- Name: get_gedu_assigned_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gedu_assigned_product(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id   UUID := (SELECT auth.uid());
  v_my_group_id UUID;
  v_product     JSONB;
  v_groups      JSONB;
BEGIN
  PERFORM public.assert_role('gedu');

  SELECT group_id
    INTO v_my_group_id
    FROM gedu_group_assignments
   WHERE product_id = p_product_id
     AND gedu_id    = v_caller_id
   LIMIT 1;

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    -- Which game identity this product's surfaces are about, if any. The enum
    -- travels as its text value; the mapping from a topic to a platform is a
    -- client-side decision (minecraft_java -> Minecraft, roblox_studio ->
    -- Roblox, everything else -> no game identity), deliberately not encoded
    -- here: a topic gaining or losing a platform is a product decision, not a
    -- schema change.
    'topic',        p.topic,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM products p
  WHERE p.id = p_product_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'is_my_group',   (pg.id = v_my_group_id),
        -- Every active seat on the group, whoever holds it. Spelled for a gamer
        -- until 00175, at which point counting an adult parent under that name
        -- became a lie the badge repeated on screen.
        'participant_count',   (
          SELECT COUNT(*)::INTEGER
            FROM participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'
        ),
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name
                   )
                   ORDER BY gp.first_name
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster',
          CASE WHEN pg.id = v_my_group_id THEN
            COALESCE((
              SELECT jsonb_agg(
                       jsonb_build_object(
                         'participant_id',     part.participant_id,
                         'first_name',         gmp.first_name,
                         'date_of_birth',      gprof.date_of_birth,
                         'gender',             gprof.gender,
                         'minecraft_username', mca.minecraft_username,
                         'minecraft_uuid',     mca.minecraft_uuid,
                         'roblox_username',    rba.roblox_username,
                         'roblox_user_id',     rba.roblox_user_id,
                         'parent_email',       (
                           SELECT pp.email
                             FROM parent_gamer pgm
                             JOIN profiles pp ON pp.id = pgm.parent_id
                            WHERE pgm.gamer_id = part.participant_id
                            ORDER BY pgm.created_at ASC NULLS LAST,
                                     pgm.id           ASC
                            LIMIT 1
                         ),
                         -- Shape parity with get_gedu_group_feed, which is the
                         -- copy every rendered roster actually comes from. Kept
                         -- deliberately rather than left out: one roster shape
                         -- with two definitions is how the two drift, and the
                         -- next reader would delete the wrong one. Do not
                         -- remove this as unused. The role check (00177) keeps
                         -- it in step with the feed: an id transposition yields
                         -- NULL rather than a gamer's synthetic handle.
                         'participant_email',
                           CASE WHEN part.participant_id = part.customer_id
                                 AND gmp.role = 'customer'
                                THEN gmp.email END,
                         -- The staff-only flair (00203). Emitted for every
                         -- roster row, note or no note, stamp or no stamp. The
                         -- join stamp is a FACT and the clubs-only newcomer
                         -- rule is a PRESENTATION rule applied client-side, so
                         -- nothing here is nulled out by product type.
                         'group_joined_at',            part.group_joined_at,
                         'note',                       gn.note,
                         'note_updated_by_first_name', ned.first_name
                       )
                       ORDER BY gmp.first_name
                     )
                FROM participations part
                JOIN profiles gmp              ON gmp.id        = part.participant_id
                LEFT JOIN gamer_profiles gprof  ON gprof.user_id = part.participant_id
                LEFT JOIN minecraft_accounts mca ON mca.user_id  = part.participant_id
                LEFT JOIN roblox_accounts rba    ON rba.user_id   = part.participant_id
                -- Keyed on exactly (group_id, participant_id), so this cannot
                -- fan the row out; profiles.id behind it is a primary key.
                LEFT JOIN public.gamer_group_notes gn
                       ON gn.group_id       = part.group_id
                      AND gn.participant_id = part.participant_id
                LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
               WHERE part.group_id = pg.id
                 AND part.status   = 'active'
            ), '[]'::jsonb)
          ELSE NULL
          END
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups
  );
END;
$$;


--
-- Name: FUNCTION get_gedu_assigned_product(p_product_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) IS 'One round trip for a gedu opening a product they are assigned to: the product shell, which group is theirs, and every group on the product with its participant_count and gedus. The roster rides only on the caller''s own group and is keyed by participant_id (00175) — the same shape get_gedu_group_feed serves, kept in parity on purpose even though the rendered roster always comes from the feed''s fresher copy. Since 00195 the shell carries the product''s topic (which decides whether a game identity is shown at all, and which one) and each roster entry carries roblox_username/roblox_user_id beside the Minecraft pair. Since 00203 each roster entry also carries the staff-only flair — group_joined_at, note and note_updated_by_first_name — emitted unconditionally, because the join stamp is a fact and the clubs-only newcomer rule is applied by the client.';


--
-- Name: get_gedu_group_feed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gedu_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
  v_product    jsonb;
  v_group      jsonb;
  v_site       jsonb;
  v_roster     jsonb;
  v_sessions   jsonb;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright — the admin group details
  -- page renders this same document for any group of any product, which is what
  -- makes it the same surface as the gedu workspace rather than a second one.
  --
  -- For a GEDU this is unchanged: v1 shows them only their OWN group's feed.
  -- Peer-group feeds are not a schema restriction — relaxing this to "any group
  -- on a product the caller is assigned to" is a change to this predicate alone,
  -- and nothing downstream assumes the caller teaches the group they are
  -- reading, which is exactly what the admin path above now relies on.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id INTO v_product_id
    FROM public.product_groups g WHERE g.id = p_group_id;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- Gedu-only, and stored somewhere only this function and an admin can
    -- reach. This document is never served to a parent or a gamer.
    'material_url', psd.material_url,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  LEFT JOIN public.product_staff_details psd ON psd.product_id = p.id
  WHERE p.id = v_product_id;

  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note,
    'gedu_note',   g.gedu_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue, on in-person products only. A remote municipality club carries a
  -- location_id too (a municipality, by CHECK), so "has a location" is the
  -- wrong test and would put a site-notes panel on a club that has no building.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes,
    'gedu_note',   ssd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd       ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- The current roster. There is deliberately no joined-by-date machinery and
  -- no enrollment-at-the-time derivation: "who was enrolled then" is knowledge
  -- we do not have and choose not to fake. `signed_up_at` travels with each row
  -- so the client can tell someone who joined last week from one who has been
  -- here all term.
  --
  -- The identity key is `participant_id` as of 00175. Every row on this roster
  -- is whoever holds the seat, and since 00173 that can be an adult — the
  -- date_of_birth / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel (00195), and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
  --
  -- `signed_up_at` and `group_joined_at` answer two different questions and
  -- both travel (00203): the first is when this seat was taken on the PRODUCT,
  -- the second when it entered THIS GROUP, and a member moved between two
  -- groups of one product has a fresh second and an unchanged first.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so on a CHILD row this is non-null in practice and the wire
        -- contract said so until 00173. An ADULT row has no parent link at all,
        -- so it is NULL there and the contract now allows it — the address for
        -- that row is the one below.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.participant_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        ),
        -- The adult's own address, and NULL on every child row. Deliberately
        -- not "the participant's email whoever they are": a gamer's profile
        -- email is the synthetic @gamer.sogverse.internal handle, which is not
        -- a mailbox and must never reach a copy-email affordance. The role
        -- check (00177) is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END,
        -- The staff-only flair (00203), in parity with
        -- get_gedu_assigned_product's roster — the two shapes are kept
        -- identical on purpose, and this is the copy the page renders.
        'group_joined_at',            part.group_joined_at,
        'note',                       gn.note,
        'note_updated_by_first_name', ned.first_name
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
        -- Keyed on exactly (group_id, participant_id), so this cannot fan the
        -- row out; profiles.id behind it is a primary key.
        LEFT JOIN public.gamer_group_notes gn
               ON gn.group_id       = part.group_id
              AND gn.participant_id = part.participant_id
        LEFT JOIN public.profiles ned           ON ned.id        = gn.updated_by
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',               s.id,
        'session_date',     s.session_date,
        'starts_at',        s.starts_at,
        'ends_at',          s.ends_at,
        'report',           s.report,
        'gedu_note',        s.gedu_note,
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- When this session's report was mailed to the group's families, and
        -- NULL until it has been (00197). The card renders the sent line from
        -- it and decides whether to offer the button, so it has to travel with
        -- the session rather than be read separately.
        --
        -- Its partner column `report_emailed_by` deliberately stays OFF the
        -- wire: it is an audit trail for staff, nothing renders it, and the
        -- card's author chip is `updated_by_first_name` above.
        'report_emailed_at', s.report_emailed_at,
        -- The last editor's first name, for the author chip on the card.
        --
        -- LEFT-JOIN-shaped on purpose: NULL when nothing has stamped the row
        -- yet, and NULL again if the profile has gone. The FK is ON DELETE SET
        -- NULL, so the second case cannot arise from a deleted profile — it is
        -- written this way so the shape survives any future relaxation rather
        -- than because it is reachable today.
        --
        -- This is the LAST TOUCHER of the whole session, not the report's
        -- author: an attendance correction or a staff-note edit moves it.
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        -- The session's photos (00222). `created_by` is deliberately NOT on the
        -- wire — it is safeguarding audit, it gates nothing and nothing renders
        -- it, exactly like report_emailed_by above. Ordered by (created_at, id):
        -- the stamp is clock_timestamp() taken under the session row's lock and
        -- the id breaks a sub-tick tie, so every surface draws the same order.
        -- The URL is derived from the id by one helper rather than stored.
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
        -- Sparse map keyed by participant id. A roster member absent from this
        -- object is UNMARKED, which is a different claim from 'absent'.
        'attendance', COALESCE((
          SELECT jsonb_object_agg(a.participant_id, a.status)
            FROM public.session_attendance a
           WHERE a.session_id = s.id
        ), '{}'::jsonb)
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
    ) AS session_rows;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions
  );
END;
$$;


--
-- Name: FUNCTION get_gedu_group_feed(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS 'One round trip for a group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map and, since 00222, its photos. Contains no schedule expansion — the client owns the calendar math. Open since 00204 to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s page body unchanged: one body fed by one document is what keeps the two surfaces one surface, where a second admin-shaped RPC would have started drifting field by field. An admin passes the ownership half outright; a gedu is still shown only their OWN group''s feed, and a customer or a gamer is still refused on the first statement, which is what keeps the material link and the three staff notes off every family surface. Each roster row is keyed by participant_id (00175 — whoever holds the seat, child or adult), carries both game identities since 00195 (minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, independent of each other and drawn according to the product''s topic, which this document does not carry), and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox). Since 00203 each roster row also carries the staff-only flair — group_joined_at (when the seat entered THIS group, as against signed_up_at, which is when it was taken on the product), note and note_updated_by_first_name — in deliberate parity with get_gedu_assigned_product''s roster, which is the parity the page depends on because it renders this copy. Each session row carries report_emailed_at since 00197 — when its report was mailed to the families, NULL until it was — and never report_emailed_by, which is audit and renders nowhere. Since 00222 each session row also carries `images`: {id, width, height} per photo, ordered by (created_at, id), with the uploader deliberately off the wire for the same reason the sender is. Widened IN PLACE rather than under a versioned name because the gedu contracts schema is tolerant of unknown keys — the family feed, whose schema is strict, got get_my_family_product_feed_v2 instead.';


--
-- Name: get_group_staff_overlay(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_group_staff_overlay(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type public.product_type;
  v_members      jsonb;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright; a gedu has to teach some
  -- group of this group's product.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The product type travels because the voice room has NO other route to it:
  -- /voice/group/[id] is passed a group id and a back link, VoiceRoomContext
  -- carries groupId and isModerator, and the token deliberately puts nothing
  -- staff-shaped on itself. The newcomer badge is a clubs-only PRESENTATION
  -- rule and the join stamp is a FACT, so the fact is emitted unconditionally
  -- and the client applies the rule — one shared helper instead of the same
  -- decision baked into four RPCs.
  SELECT p.product_type INTO v_product_type
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- One entry per ACTIVE participation of the group, note or no note, stamp or
  -- no stamp — the same map shape get_gedu_group_feed already uses for
  -- attendance. So the map's own keys name exactly the people a note may be
  -- written about, which is the seat-holder set the room needs; a separate ids
  -- array would be a second list of the same people to keep true. A participant
  -- id absent from the map — a visiting admin, the gedu themselves, a stale
  -- peer — simply gets no flair.
  --
  -- Neither join can fan a row out: gamer_group_notes is keyed on exactly
  -- (group_id, participant_id) and profiles.id is a primary key.
  SELECT COALESCE(jsonb_object_agg(part.participant_id, jsonb_build_object(
           'group_joined_at',            part.group_joined_at,
           'note',                       n.note,
           'note_updated_by_first_name', ed.first_name
         )), '{}'::jsonb)
    INTO v_members
    FROM public.participations part
    LEFT JOIN public.gamer_group_notes n
           ON n.group_id       = part.group_id
          AND n.participant_id = part.participant_id
    LEFT JOIN public.profiles ed ON ed.id = n.updated_by
   WHERE part.group_id = p_group_id
     AND part.status   = 'active'::public.participation_status;

  RETURN jsonb_build_object(
    'product_type', v_product_type,
    'members',      v_members
  );
END;
$$;


--
-- Name: FUNCTION get_group_staff_overlay(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_group_staff_overlay(p_group_id uuid) IS 'The staff-only marks for one group''s active roster, in one document: product_type, and a map keyed by participant id whose entries carry group_joined_at, note and note_updated_by_first_name. Open to an ADMIN or to any gedu assigned to any group of the group''s product, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. Built for the voice room, which has no other route to either mark: staff-only data must never ride the Daily token or user_name, because that channel is broadcast to every peer including children. A refused caller means the flair is gated by data access rather than by a viewer prop. product_type is on the document because the room knows only a group id, and the clubs-only newcomer rule is applied client-side from it. Every active member appears whether or not they have a note, so the map''s keys are the seat-holder set. An unknown group id returns a null-shaped document to an admin rather than raising.';


--
-- Name: get_my_assigned_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(product_id uuid, group_id uuid, timezone text, start_date date, end_date date, is_remote boolean, product_type public.product_type, product_translations jsonb, schedule_slots jsonb, group_count integer, participant_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_gedu_id UUID := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN QUERY
  SELECT
    p.id            AS product_id,
    a.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS participant_count
  FROM gedu_group_assignments a
  JOIN products p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id;
END;
$$;


--
-- Name: FUNCTION get_my_assigned_products(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_assigned_products() IS 'Every product the calling gedu is assigned to, one row per assignment, with the product shell, its schedule slots, how many groups it has and how many active seats (participant_count — renamed from gamer_count in 00175, because a seat may be held by an adult since 00173). Gedu-gated on its first statement.';


--
-- Name: get_my_family_product_feed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_family_product_feed(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid            uuid := (SELECT auth.uid());
  v_participant_id uuid;
  v_group_id       uuid;
  v_product_id     uuid;
  v_participant    jsonb;
  v_product        jsonb;
  v_group          jsonb;
  v_site           jsonb;
  v_gedus          jsonb;
  v_sessions       jsonb;
BEGIN
  -- No caller, no answer. This function is scoped entirely to auth.uid(); with
  -- no uid there is nobody for it to be scoped TO, so there is no correct
  -- document to return and the only safe reply is a refusal. Checked FIRST and
  -- on its own, rather than folded into the predicate below, because the whole
  -- failure 00152 exists to fix was a NULL uid disappearing into a larger
  -- boolean expression.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT part.participant_id, part.group_id, part.product_id
    INTO v_participant_id, v_group_id, v_product_id
    FROM public.participations part
   WHERE part.id = p_participation_id;

  -- A participation that does not exist and one belonging to another family
  -- answer IDENTICALLY, on purpose. Distinguishing them would turn this
  -- function into an oracle for "is this a real enrollment id", which is a
  -- question no caller has a right to ask about a row that is not theirs.
  --
  -- The first arm is also what admits a PARENT'S OWN SEAT with no change: the
  -- participant is the caller, so it matches directly and the parent-link
  -- fallback is never reached.
  --
  -- `IS NOT DISTINCT FROM`, not `=`: the equality form is only safe here
  -- because of the guard above, and a predicate whose correctness depends on a
  -- check twenty lines away is one edit away from being wrong again. This form
  -- is false — never NULL — for every input, so the IF cannot be skipped.
  IF v_participant_id IS NULL
     OR NOT (v_participant_id IS NOT DISTINCT FROM v_uid
             OR public.is_parent_of(v_participant_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- An unplaced enrollment (purchased, awaiting a group) has no feed and no
  -- page: the sessions, the gedus and the group note all hang off the group.
  -- A DIFFERENT error from the refusal above, and deliberately so — the caller
  -- owns this row, so there is nothing to conceal from them, and the client
  -- renders both as not-found anyway. `no_data_found` is P0002, which PostgREST
  -- maps to a 404; the refusals above are 42501, which it maps to a 403.
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Participation % is not placed in a group', p_participation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Whoever holds the seat. The page is participant-scoped and reachable by
  -- URL, so it cannot get the name from a dashboard card it was not opened
  -- from. This is the caller's own child, or the caller themselves — the
  -- ownership check above is what makes that true.
  SELECT jsonb_build_object(
    'id',         pr.id,
    'first_name', pr.first_name
  )
  INTO v_participant
  FROM public.profiles pr WHERE pr.id = v_participant_id;

  -- The product shell. Names live in product_translations, not on `products`,
  -- so the translations array IS the name. `material_url` lives on
  -- product_staff_details and this query does not join it.
  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  WHERE p.id = v_product_id;

  -- The group's family-facing half. `gedu_note` is not selected, and its
  -- absence here is the enforcement — not a filter somewhere downstream. The id
  -- travels because the voice-room href and the feed's entry keys are built
  -- from it.
  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = v_group_id;

  -- The venue, in-person products only — same test as the gedu feed, and for
  -- the same reason: a remote municipality club carries a location_id (a
  -- municipality, by CHECK), so "has a location" would put an address on a club
  -- with no building. site_staff_details is not joined at all.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd ON sd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- Who teaches this group, by first name. Nothing else about them: not the
  -- surname, not the email, not the verification state. A family is being told
  -- who they are with, which is a first name's worth of information.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = v_group_id
    ) AS gedu_rows;

  -- The group's whole stored history, newest first — including sessions that
  -- predate this participant's enrolment, and including rows the schedule no
  -- longer projects. See 00151's header for why there is no window here.
  --
  -- `report` and nothing else of the two note fields. `attendance` is ONE
  -- answer — this participant's — rather than the gedu feed's map over the
  -- roster, which is what makes another child's mark structurally unreachable
  -- rather than merely unrendered. NULL means unmarked, which is a third state
  -- and not the same claim as 'absent'.
  --
  -- The two `updated_by*` keys are 00194's widening, and the name travels per
  -- session rather than being resolved against `gedus` above because the sets
  -- genuinely differ: the gedu who wrote up September may not teach the group in
  -- November, and resolving against the current list would leave the oldest
  -- reports unsigned. It is the last editor of the SESSION, not the report's
  -- author — an attendance mark moves it — which is a limitation this document
  -- states rather than hides.
  --
  -- `images` is 00222's, arriving here in place as of this migration. Same shape
  -- as the gedu and admin documents' — {id, width, height}, ordered by
  -- (created_at, id) — because one shared gallery component renders them all.
  -- The uploader does not travel: it is safeguarding audit, and a family surface
  -- is the last place for it.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',           s.id,
        'session_date', s.session_date,
        'starts_at',    s.starts_at,
        'ends_at',      s.ends_at,
        'report',       s.report,
        'updated_by',   s.updated_by,
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
        'attendance', (
          SELECT a.status
            FROM public.session_attendance a
           WHERE a.session_id = s.id
             AND a.participant_id   = v_participant_id
        )
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = v_group_id
    ) AS session_rows;

  RETURN jsonb_build_object(
    'participant', v_participant,
    'product',     v_product,
    'group',       v_group,
    'site',        v_site,
    'gedus',       v_gedus,
    'sessions',    v_sessions
  );
END;
$$;


--
-- Name: FUNCTION get_my_family_product_feed(p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) IS 'One round trip for a family club/camp/event page, scoped to ONE participation: the product shell, the group name and its family-facing note, the venue on in-person products, the teaching gedus'' first names, the group''s full stored session history with reports and PHOTOS, and the named participant''s own attendance marks. Each session carries updated_by and the last editor''s first name (00194) — last editor of the SESSION, not author of the report: an attendance mark or a staff-note edit moves it. The name travels per session because a past session''s editor may no longer teach the group. Since this migration each session also carries `images`: {id, width, height} per photo, ordered by (created_at, id), the same shape the gedu and admin documents carry because one shared gallery renders all three, and never the uploader, which is safeguarding audit. That key was added by 00222 under a versioned twin, get_my_family_product_feed_v2, on the reading that a `.strict()` response schema in the still-deployed app failing to parse a widened document was breakage the release window could not absorb. The severity paragraph in docs/plans/CLAUDE.md''s "Landing in stages" section now settles that the other way: transient READ-SIDE breakage that heals itself the moment the deploy completes is inside the accepted window, and the compatibility step is reserved for permanent or write-side breakage and for payments and auth. So the widening landed here in place and the twin was dropped. Self-scoping — the caller must be the participation''s participant (a child, or a parent holding a seat of their own) or a parent linked to them; an unplaced participation has no page and answers P0002; a row that does not exist and a row belonging to another family are refused identically, so it cannot be used as an oracle for enrollment ids. Carries no gedu note of any scope, no roster, no other participant''s marks, no parent email, no material link and no owed/completeness state.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    currency text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    spoken_languages public.spoken_language[] DEFAULT '{}'::public.spoken_language[] NOT NULL,
    locale text,
    first_name text NOT NULL,
    last_name text DEFAULT ''::text NOT NULL,
    home_location_id uuid,
    referral_code text,
    email_verified_at timestamp with time zone,
    CONSTRAINT profiles_first_name_len CHECK (((char_length(first_name) >= 2) AND (char_length(first_name) <= 32))),
    CONSTRAINT profiles_last_name_len CHECK ((char_length(last_name) <= 32)),
    CONSTRAINT profiles_phone_e164 CHECK ((phone ~ '^\d{7,15}$'::text)),
    CONSTRAINT profiles_referral_code_format CHECK (((referral_code IS NULL) OR (referral_code ~ '^[a-z0-9_-]{1,64}$'::text)))
);


--
-- Name: COLUMN profiles.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.email IS 'Email address (NOT NULL for every role). Gamer accounts carry a generated synthetic <token>@gamer.sogverse.internal address until/unless replaced by a real one.';


--
-- Name: COLUMN profiles.spoken_languages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.spoken_languages IS 'Human languages the user speaks, as public.spoken_language values. Used for matching gamers/gedus to clubs. Distinct from locale, which controls UI translation. The enum guarantees every entry is a language we offer; the BEFORE trigger on this column is what guarantees no entry appears twice.';


--
-- Name: COLUMN profiles.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.locale IS 'BCP-47-style UI locale code (en, fi, sv, ...). Null = auto-detect from cookie/Accept-Language. Distinct from spoken_languages, which is the user''s human-language fluency.';


--
-- Name: COLUMN profiles.home_location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.home_location_id IS 'Optional municipality-level locations row: where this parent''s family lives. ON DELETE SET NULL by choice — a merged or retired reference row empties this reference rather than blocking its removal, at the cost of silently clearing the parent''s pick. Acceptable only because the field is optional and carries no entitlement.';


--
-- Name: COLUMN profiles.referral_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.referral_code IS 'Optional marketing provenance: the short code from the ?ref= param on the link this account arrived through, or NULL (the large majority). Written once by handle_new_user() from the signup metadata and never updatable — there is deliberately no UPDATE grant, at any level, for any role but service_role. Labels only: it grants nothing, is never used for profiling or to decide what anyone is shown or charged, and gamer rows always hold NULL.';


--
-- Name: COLUMN profiles.email_verified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.email_verified_at IS 'When the address in profiles.email was last proven to reach this account''s owner, or NULL for "not verified" — the resting state for gamer rows, whose synthetic <token>@gamer.sogverse.internal address no inbox answers. Written only by service_role (the route that validates a signed verification link); there is deliberately no UPDATE grant at any level for authenticated or anon, because a marker its own subject can set proves nothing. Reset to NULL by trg_reset_email_verification whenever profiles.email changes — the value is a claim about one address, not about the account.';


--
-- Name: get_my_gamers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_gamers() RETURNS SETOF public.profiles
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM profiles p
  INNER JOIN parent_gamer pg ON p.id = pg.gamer_id
  WHERE pg.parent_id = auth.uid();
END;
$$;


--
-- Name: get_my_gedu_assignment_summaries(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'product_id',              a.product_id,
               'group_id',                a.group_id,
               'group_name',              g.name,
               -- Renamed from group_gamer_count in 00175: the count is every
               -- active seat on the group, and since 00173 one of those can be
               -- an adult.
               'group_participant_count', roster.roster_size,
               'site_name',               site.name,
               'attention_count',         COALESCE(owed.owed_count, 0)
             )
             ORDER BY g.name
           )
      FROM public.gedu_group_assignments a
      JOIN public.product_groups g ON g.id = a.group_id
      JOIN public.products p       ON p.id = a.product_id

      -- The venue, in-person products only (see get_gedu_group_feed).
      LEFT JOIN LATERAL (
        SELECT l.name
          FROM public.locations l
         WHERE l.id = p.location_id AND p.is_remote = false
      ) AS site ON true

      CROSS JOIN LATERAL (
        SELECT COUNT(*)::integer AS roster_size
          FROM public.participations part
         WHERE part.group_id = g.id
           AND part.status   = 'active'::public.participation_status
      ) AS roster

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS owed_count
          FROM (
            -- Occurrences the schedule projects, floored at max(product start,
            -- epoch) and bounded above by "has actually finished".
            --
            -- The epoch floors THIS COUNT and nothing else. A pre-epoch session
            -- is fully recordable — a gedu may take its attendance and write it
            -- up — it simply never becomes work the platform asks for. That is
            -- why the write validator has no epoch floor of its own.
            SELECT d::date AS session_date
              FROM generate_series(
                     GREATEST(
                       COALESCE(p.start_date, (now() AT TIME ZONE p.timezone)::date - 365),
                       COALESCE(p_epoch_date, DATE '0001-01-01')
                     )::timestamp,
                     (now() AT TIME ZONE p.timezone)::date::timestamp,
                     interval '1 day'
                   ) AS d
             WHERE (p.end_date IS NULL OR d::date <= p.end_date)
               AND EXISTS (
                 SELECT 1
                   FROM public.schedule_slots s
                  WHERE s.product_id = p.id
                    AND s.weekday = (EXTRACT(ISODOW FROM d)::integer - 1)
                    AND ((d::date + s.start_time) AT TIME ZONE p.timezone)
                        + make_interval(mins => s.duration_minutes) <= now()
               )
            UNION
            -- Rows the schedule no longer projects still count: a session
            -- orphaned by a weekday move is history, and history that is
            -- missing marks is still owed.
            SELECT gs.session_date
              FROM public.group_sessions gs
             WHERE gs.group_id = g.id
               AND gs.ends_at <= now()
               AND gs.session_date >= COALESCE(p_epoch_date, DATE '0001-01-01')
               AND (p.start_date IS NULL OR gs.session_date >= p.start_date)
          ) AS occurrence
         WHERE roster.roster_size > 0
           -- "Needs attention" is THREE questions joined by OR, and any one
           -- alone keeps the session on the list.
           --
           -- This derivation has a TWIN IN TYPESCRIPT — the gedu feed's
           -- entry-state module, which decides the same thing for the card
           -- from the feed document — and the two must agree, or the dashboard
           -- badge counts a session the card calls finished. Changing either
           -- half means changing both, in the same commit.
           AND (
             -- (1) Some of the CURRENT roster has no answer yet. Measured
             -- against the current roster, never against the stored map's keys
             -- — which is why someone joining a long-running group reopens
             -- previously-complete sessions. That is the honest reading and it
             -- is chosen with eyes open.
             (
               SELECT COUNT(*)
                 FROM public.session_attendance att
                 JOIN public.group_sessions gs2 ON gs2.id = att.session_id
                 JOIN public.participations part2
                   ON part2.participant_id = att.participant_id
                  AND part2.group_id = g.id
                  AND part2.status   = 'active'::public.participation_status
                WHERE gs2.group_id     = g.id
                  AND gs2.session_date = occurrence.session_date
             ) < roster.roster_size
             -- (2) Nothing has been written for the families. NOT EXISTS rather
             -- than a LEFT JOIN's NULL test, so a date with no materialized row
             -- at all — the common case for a session nobody has touched — is
             -- the same answer as a row holding a blank report.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs3
                WHERE gs3.group_id     = g.id
                  AND gs3.session_date = occurrence.session_date
                  AND btrim(COALESCE(gs3.report, ''), E' \t\r\n\v\f') <> ''
             )
             -- (3) The families have not been told it is there (00197).
             -- Writing the report is half the job; a report nobody was mailed
             -- about is a report nobody reads, so a session stays owed until
             -- the send has been claimed.
             --
             -- NOT EXISTS again, for the same reason as (2): a date with no
             -- materialized row is the same answer as a row that was never
             -- mailed, and neither is a LEFT JOIN's three-valued NULL test.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs4
                WHERE gs4.group_id     = g.id
                  AND gs4.session_date = occurrence.session_date
                  AND gs4.report_emailed_at IS NOT NULL
             )
           )
      ) AS owed ON true

     WHERE a.gedu_id = v_uid
  ), '[]'::jsonb);
END;
$$;


--
-- Name: FUNCTION get_my_gedu_assignment_summaries(p_epoch_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS 'One row per gedu assignment for the dashboard cards: group name, that group''s participant count (renamed from group_gamer_count in 00175 — an active seat may be held by an adult since 00173), the venue name on in-person products, and how many past sessions still owe a register, a family-facing report, or the mail that tells the families it is there. A finished session on or after the epoch counts until ALL THREE are in (the third since 00197). The enforcement epoch travels in as an argument because it is a code constant, not a column. This count has a twin in TypeScript — the gedu feed''s entry-state derivation, which answers the same question for one card — and the two must be changed together.';


--
-- Name: get_my_parents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_parents() RETURNS SETOF public.profiles
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM profiles p
  INNER JOIN parent_gamer pg ON p.id = pg.parent_id
  WHERE pg.gamer_id = auth.uid();
END;
$$;


--
-- Name: get_my_participation_subscription_states(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_participation_subscription_states() RETURNS TABLE(participation_id uuid, status text, current_period_end timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT fs.participation_id, fs.status, fs.current_period_end
  FROM public.family_subscriptions fs
  JOIN public.participations p ON p.id = fs.participation_id
  WHERE fs.status IN ('past_due', 'canceling')
    AND (
      p.customer_id = (SELECT auth.uid())
      OR p.participant_id = (SELECT auth.uid())
    );
$$;


--
-- Name: get_my_waitlist_positions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_waitlist_positions() RETURNS TABLE(participation_id uuid, waitlist_position integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT mine.id,
         -- Same derivation as join_waitlist and get_waitlist_position: count the
         -- waitlisted rows ordered at-or-before this one by (waitlisted_at, id).
         -- Recomputed live, so it shrinks as people ahead of them leave.
         -- waitlisted_at is never NULL on a waitlisted row
         -- (chk_participations_waitlisted_has_timestamp), so neither comparison
         -- can go three-valued and swallow a peer.
         (SELECT COUNT(*)::INTEGER
            FROM public.participations peer
           WHERE peer.product_id = mine.product_id
             AND peer.status = 'waitlisted'::public.participation_status
             AND (peer.waitlisted_at < mine.waitlisted_at
                  OR (peer.waitlisted_at = mine.waitlisted_at
                      AND peer.id <= mine.id)))
    FROM public.participations mine
   WHERE mine.status = 'waitlisted'::public.participation_status
     AND (mine.customer_id = (SELECT auth.uid())
          OR mine.participant_id = (SELECT auth.uid()));
$$;


--
-- Name: FUNCTION get_my_waitlist_positions(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_waitlist_positions() IS 'Every waitlist position the caller is party to (purchasing parent or the gamer), in one snapshot. SECURITY DEFINER to count past the caller''s RLS; returns only their own participation ids and an integer each.';


--
-- Name: get_product_groups_with_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_product_groups_with_details(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
  v_waitlist   JSONB;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'created_at', g->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email
                   )
                   ORDER BY ga.created_at, gp.id
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                             p.id,
                     'participant_id',                 p.participant_id,
                     'participant_first_name',         gmp.first_name,
                     'participant_date_of_birth',      gprof.date_of_birth,
                     'participant_gender',             gprof.gender,
                     'participant_minecraft_username', mca.minecraft_username,
                     'participant_minecraft_uuid',     mca.minecraft_uuid,
                     -- The Roblox pair, on the same terms as the Minecraft one
                     -- next to it: both are LEFT-joined, both are null on a
                     -- person who has never given that platform a handle, and
                     -- neither implies the other. The chip shows whichever the
                     -- product's topic is about.
                     'participant_roblox_username',    rba.roblox_username,
                     'participant_roblox_user_id',     rba.roblox_user_id,
                     -- The contact behind a CHILD's seat, which is what these
                     -- two describe — not the participant. Hence `parent_`
                     -- rather than `participant_parent_`: one prefix per
                     -- subject, and parent_email next door already set it.
                     'parent_first_name',              parent.first_name,
                     'parent_last_name',               parent.last_name,
                     -- An adult seat has no linked parent to name, so the chip
                     -- shows an address instead. NULL on every child row: a
                     -- gamer profile's email is the synthetic
                     -- @gamer.sogverse.internal handle, not a mailbox. The role
                     -- check (00177) makes "adult seat" the ROLE, not the id
                     -- equality alone — a transposed id yields NULL, not a leak.
                     'participant_email',
                       CASE WHEN p.participant_id = p.customer_id
                             AND gmp.role = 'customer'
                            THEN gmp.email END,
                     'status',                         p.status,
                     'signed_up_at',                   p.signed_up_at,
                     -- The demote/remove dialogs' condition, resolved
                     -- server-side so the panel needs no round trip per chip.
                     -- The join below excludes dead subscriptions, so this is
                     -- "live", not "ever existed".
                     'has_live_subscription',          (fs.id IS NOT NULL),
                     -- The promote dialog's condition (00167): money once
                     -- arrived for this seat.
                     'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
                     -- The staff-only flair (00203), identical in all three
                     -- arms. The groups PANEL draws neither mark — a chip there
                     -- is a drag handle — so these ride for shape parity across
                     -- the three roster readers, not for a reader of this one.
                     'group_joined_at',                p.group_joined_at,
                     'note',                           gn.note,
                     'note_updated_by_first_name',     ned.first_name,
                     -- The seat-offer stamps (00207), identical in all three
                     -- arms for the same reason. NULL here and on the
                     -- unassigned arm by construction — the CHECK forbids an
                     -- offer stamp on anything but a waitlisted row — and read
                     -- for real only on the waitlist arm, where the card draws
                     -- the offer's standing. Whether an offer is LIVE is
                     -- derived from sent_at on the reader's side, against the
                     -- same five-day window this file states everywhere else.
                     'seat_offer_sent_at',             p.seat_offer_sent_at,
                     'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.participant_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
            -- user_id is this table's primary key, so this cannot fan the row
            -- out any more than the Minecraft join above it can.
            LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
            -- participation_id is UNIQUE here, so this cannot fan the row out.
            -- The status predicate lives in the JOIN rather than a WHERE so a
            -- dead subscription simply fails to match and leaves fs.id NULL,
            -- instead of dropping the participation from the snapshot.
            LEFT JOIN family_subscriptions fs
                   ON fs.participation_id = p.id
                  AND fs.status <> 'cancelled'
            -- Keyed on exactly (group_id, participant_id), so this cannot fan
            -- the row out; profiles.id behind it is a primary key.
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = p.group_id
                  AND gn.participant_id = p.participant_id
            LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.participant_id
               ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
               LIMIT 1
            ) parent ON true
           WHERE p.group_id = pg.id
             AND p.status = 'active'
        ), '[]'::jsonb)
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_date_of_birth',      gprof.date_of_birth,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
             -- Group-less by definition, so the join matches nothing and all
             -- three come back NULL. That is the truth rather than a gap: a
             -- seat in no group is new to nothing and has no note filed under
             -- any group. Keeping the expression identical is what keeps this
             -- arm the same shape as the other two.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name,
             -- NULL here too, and by a constraint rather than by a join that
             -- misses: an ACTIVE seat cannot carry an offer stamp at all.
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.group_id IS NULL
     AND p.status = 'active';

  -- Waitlist: same detail shape as `unassigned`, but ordered by the derived
  -- waitlist key (waitlisted_at, id). Position is the array index + 1, computed
  -- client-side — never stored. waitlisted_at drives ORDER BY but is omitted
  -- from the object so the row shape stays identical to a group/unassigned chip.
  --
  -- has_live_subscription is a REAL READ here as of 00170. It used to be a
  -- constant FALSE, resting on "demote_to_waitlist refuses a subscribed row, so
  -- this cannot exist". It can: the webhook inserts family_subscriptions after a
  -- Stripe round trip without taking the product gate lock, so a demote landing
  -- in that window creates exactly this row — and the manual sub-adoption
  -- process writes one directly. A snapshot asserting FALSE about a seat that
  -- has money behind it is the panel being lied to, so the branch reads the
  -- same join as the other two.
  --
  -- has_payment_marker remains a real read and remains the branch where it
  -- decides something: demotion leaves the Checkout Session id in place, so a
  -- family that paid and was later demoted is distinguishable here from one
  -- that only ever queued.
  --
  -- The two seat-offer stamps (00207) are the same story one step further on:
  -- this is the ONLY arm where either can be non-NULL, and the waitlist card is
  -- the only reader of them. They ride on the other two arms for shape parity.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_date_of_birth',      gprof.date_of_birth,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
             -- A waitlisted seat holds no group either, so these are NULL for
             -- the same reason as the arm above. The note RPC does admit a
             -- waitlisted TARGET — a note about somebody queueing for the group
             -- is coherent — but such a row is reached through the group's own
             -- roster, not through this arm.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name,
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
           )
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.status = 'waitlisted';

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned,
    'waitlist',   v_waitlist
  );
END;
$$;


--
-- Name: FUNCTION get_product_groups_with_details(p_product_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) IS 'Admin-gated snapshot behind the product Groups panel: groups with their gedus and active members, the unassigned actives, and the waitlist in derived (waitlisted_at, id) order. Every participation object carries the same fields, including the two the panel''s refusal dialogs are keyed to: has_live_subscription (a real read on ALL THREE branches since 00170 — a LEFT JOIN to family_subscriptions excluding status ''cancelled'', so it means live rather than ever-existed) and has_payment_marker (a real read of stripe_checkout_session_id — money once arrived for this seat, which demotion does not clear). Both are resolved here so the panel decides a drag from one snapshot rather than asking per chip. Since 00175 the person keys are participant_* (whoever holds the seat) and the contact behind a child''s seat is parent_first_name/parent_last_name; an adult seat names none of those and carries participant_email — its own address — instead. Since 00195 each chip also carries participant_roblox_username/participant_roblox_user_id beside the Minecraft pair, so the panel can show whichever identity the product''s topic is about; the topic itself is NOT emitted here, because the page already holds the product row. Since 00203 all three branches also carry the staff-only flair — group_joined_at, note and note_updated_by_first_name — from one identical LEFT JOIN, which comes back NULL on the two group-less branches because that is the truth and because one expression is what keeps the three shapes one shape. The groups panel draws neither mark, and no admin surface reads either of them from THIS document today — the group details page renders both and reads them off get_gedu_group_feed, the copy a note write invalidates — so all three fields ride here for shape parity across the three roster readers rather than for a reader of this one. Since 00207 all three branches also carry seat_offer_sent_at and seat_offer_expiry_notified_at, on exactly the same terms: only the WAITLIST branch can hold a non-NULL value (a CHECK forbids an offer stamp on any other status) and only the waitlist card reads them, but the expression is identical in all three so the shape stays one shape. Whether an offer is LIVE is derived on the reader''s side from sent_at plus the five-day window.';


--
-- Name: get_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role() RETURNS public.user_role
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid());
END;
$$;


--
-- Name: get_waitlist_position(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_waitlist_position(p_participation_id uuid) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id     UUID;
  v_participant_id UUID;
  v_customer_id    UUID;
  v_status         public.participation_status;
  v_waitlisted_at  TIMESTAMPTZ;
  v_uid            UUID;
  v_position       INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT product_id, participant_id, customer_id, status, waitlisted_at
    INTO v_product_id, v_participant_id, v_customer_id, v_status, v_waitlisted_at
    FROM public.participations
    WHERE id = p_participation_id;

  -- Unknown row, not waitlisted, or caller doesn't own it -> no position.
  -- Owner = the purchasing parent (customer) or the gamer themselves. Returning
  -- NULL rather than raising avoids leaking whether the id exists.
  IF NOT FOUND
     OR v_status <> 'waitlisted'
     OR (v_uid <> v_customer_id AND v_uid <> v_participant_id) THEN
    RETURN NULL;
  END IF;

  -- Position = count of waitlisted rows ordered at-or-before this one
  -- (waitlisted_at, id) — the same derivation join_waitlist uses, recomputed
  -- live so it shrinks as people ahead leave.
  SELECT COUNT(*)::INTEGER INTO v_position
    FROM public.participations
    WHERE product_id = v_product_id
      AND status = 'waitlisted'
      AND (waitlisted_at < v_waitlisted_at
           OR (waitlisted_at = v_waitlisted_at AND id <= p_participation_id));

  RETURN v_position;
END;
$$;


--
-- Name: group_session_date_is_writable(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_session_date_is_writable(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start_date date;
  v_end_date   date;
  v_timezone   text;
  v_horizon    date;
BEGIN
  IF p_group_id IS NULL OR p_session_date IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.start_date, p.end_date, p.timezone
    INTO v_start_date, v_end_date, v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_start_date IS NOT NULL AND p_session_date < v_start_date THEN
    RETURN false;
  END IF;

  IF v_end_date IS NOT NULL THEN
    v_horizon := v_end_date;
  ELSE
    -- Open-ended products show eight upcoming occurrences, which is eight weeks
    -- for a weekly club and eight days for a daily one. Ninety days is a
    -- comfortable superset of both and is meant to be: this is the loose bound,
    -- not a second schedule model.
    v_horizon := (now() AT TIME ZONE v_timezone)::date + 90;
  END IF;

  IF p_session_date > v_horizon THEN
    RETURN false;
  END IF;

  RETURN public.derive_group_session_window(p_group_id, p_session_date) IS NOT NULL;
END;
$$;


--
-- Name: FUNCTION group_session_date_is_writable(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_session_date_is_writable(p_group_id uuid, p_session_date date) IS 'Loose, holiday-blind write validation for a session date: at or after the product start, within the visible horizon, and on a weekday the current schedule uses.';


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
  profile_referral_raw TEXT;
  profile_referral     TEXT;
BEGIN
  profile_first_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    'New User'
  );

  profile_last_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    ''
  );

  -- Sanitise here, in the body, rather than letting the CHECK decide: a
  -- malformed code must cost this family nothing at all, so it degrades to NULL
  -- and the signup succeeds. Normalise first, then test the normalised value.
  profile_referral_raw := NEW.raw_user_meta_data->>'referral_code';
  profile_referral := CASE
    WHEN lower(btrim(profile_referral_raw)) ~ '^[a-z0-9_-]{1,64}$'
      THEN lower(btrim(profile_referral_raw))
    ELSE NULL
  END;

  INSERT INTO public.profiles (id, email, role, first_name, last_name, referral_code)
  VALUES (NEW.id, NEW.email, 'customer', profile_first_name, profile_last_name, profile_referral);

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$_$;


--
-- Name: handle_orphaned_gamer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_orphaned_gamer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  remaining_parents INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_parents
  FROM parent_gamer
  WHERE gamer_id = OLD.gamer_id;

  IF remaining_parents = 0 THEN
    DELETE FROM auth.users WHERE id = OLD.gamer_id;
  END IF;

  RETURN OLD;
END;
$$;


--
-- Name: has_active_participation_in_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_active_participation_in_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.participations p
     WHERE p.group_id = p_group_id
       AND (p.customer_id = (SELECT auth.uid()) OR p.participant_id = (SELECT auth.uid()))
       AND p.status = 'active'
  );
$$;


--
-- Name: has_active_participation_on_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_active_participation_on_product(p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.participations p
     WHERE p.product_id = p_product_id
       AND (p.customer_id = (SELECT auth.uid()) OR p.participant_id = (SELECT auth.uid()))
       AND p.status = 'active'
  );
$$;


--
-- Name: immutable_unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.immutable_unaccent(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, p_value);
$$;


--
-- Name: FUNCTION immutable_unaccent(p_value text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.immutable_unaccent(p_value text) IS 'Diacritic-stripping fold, declared IMMUTABLE so it may be used in a generated column. unaccent() itself is STABLE because it resolves a dictionary by name; pinning the dictionary makes the result depend on nothing but the input. If the extensions.unaccent dictionary is ever redefined, locations.search_blob must be recomputed and its index rebuilt.';


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN get_user_role() = 'admin';
END;
$$;


--
-- Name: is_no_charge(public.billing_mode); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_no_charge(p_mode public.billing_mode) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT p_mode IN ('free', 'external_contract');
$$;


--
-- Name: FUNCTION is_no_charge(p_mode public.billing_mode); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_no_charge(p_mode public.billing_mode) IS 'Whether a seat on a product with this billing mode costs anyone money: true for ''free'' and for ''external_contract'' (municipality clubs, invoiced off-platform — currently the only consumer of that mode), false for ''paid''. The named home of the colloquial "free", which almost always means both. The distinction between the two no-charge modes stays load-bearing elsewhere — each gates its own purchase shape in create_participation — so this is only for the two-versus-paid question. Kept in lockstep with NO_CHARGE_BILLING_MODES / isNoChargeBillingMode in src/lib/constants/billing.ts, which the admin groups panel reads to decide whether to draw the unassigned inbox.';


--
-- Name: is_parent_of(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_parent_of(gamer_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM parent_gamer
    WHERE parent_id = auth.uid() AND gamer_id = gamer_uuid
  );
END;
$$;


--
-- Name: is_voice_group_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_voice_group_member(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.participations p
      where p.group_id = p_group_id
        and p.participant_id = (select auth.uid())
        and p.status = 'active'
    )
    or exists (
      select 1
      from public.product_groups g
      join public.gedu_group_assignments a on a.product_id = g.product_id
      where g.id = p_group_id
        and a.gedu_id = (select auth.uid())
    );
$$;


--
-- Name: is_voice_group_moderator(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_voice_group_moderator(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.product_groups g
      join public.gedu_group_assignments a on a.product_id = g.product_id
      where g.id = p_group_id
        and a.gedu_id = (select auth.uid())
    );
$$;


--
-- Name: join_product_waitlist(uuid, uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('customer');

  -- Everything else — product lock, parent-of-gamer check, waitlist_enabled
  -- gate, idempotency, the consent gate, the clock_timestamp() ordering stamp —
  -- is unchanged and lives in the engine. This function's whole job is
  -- authorization plus pinning the actor to the session.
  RETURN public.join_waitlist(
    p_product_id, p_participant_id, (SELECT auth.uid()), p_consented_documents
  );
END;
$$;


--
-- Name: FUNCTION join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]) IS 'Guarded, authenticated-facing entry point for joining a product waitlist. The customer is auth.uid(); the parent-of-gamer check and, since 00210, the required-consent gate both live in join_waitlist.';


--
-- Name: join_waitlist(uuid, uuid, uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product           public.products;
  v_existing_id       UUID;
  v_existing_ts       TIMESTAMPTZ;
  v_existing_status   public.participation_status;
  v_now               TIMESTAMPTZ;
  v_position          INTEGER;
  v_participation_id  UUID;
  v_is_parent         BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Same audience gate as create_participation, and for the same reason: a
  -- queue is a promise of a seat, so it has to refuse exactly the seats the
  -- signup path would. See that function for why `=` rather than
  -- `IS NOT DISTINCT FROM`, and for why the parent-link arm is what keeps a
  -- parent from enrolling another adult.
  IF p_participant_id = p_customer_id THEN
    IF NOT v_product.for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.parent_gamer
      WHERE parent_id = p_customer_id AND gamer_id = p_participant_id
    ) INTO v_is_parent;
    IF NOT v_is_parent THEN
      RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_participant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_product.for_gamers THEN
      RAISE EXCEPTION 'product % is not open to gamers', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT v_product.waitlist_enabled THEN
    RAISE EXCEPTION 'waitlist is not enabled for this product'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency: existing waitlisted/reserving/active row → return it as-is,
  -- flagged so the caller can tell this apart from the INSERT below.
  SELECT id, waitlisted_at, status
    INTO v_existing_id, v_existing_ts, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status IN ('waitlisted', 'reserving', 'active')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'waitlisted' THEN
      SELECT COUNT(*) INTO v_position
        FROM public.participations
        WHERE product_id = p_product_id AND status = 'waitlisted'
          AND (waitlisted_at < v_existing_ts
               OR (waitlisted_at = v_existing_ts AND id <= v_existing_id));
    ELSE
      -- Already holds a spot (active/reserving) — not on the waitlist.
      v_position := 0;
    END IF;
    RETURN jsonb_build_object(
      'participation_id', v_existing_id,
      'waitlist_position', v_position,
      'status', v_existing_status::text,
      'idempotent', TRUE
    );
  END IF;

  -- THE ENROLMENT CONDITIONS (00210), below the idempotency return so a replay
  -- records nothing: the same enrolment agreed once. Raises check_violation
  -- naming any required document the caller did not agree to; otherwise writes
  -- one acceptance row per required document at its current version. Joining a
  -- queue IS the enrolment moment on this path — meeting the conditions for the
  -- first time at promotion would ask a family to agree at the moment they are
  -- least able to decline.
  --
  -- The customer is both the agreeing party and the actor (00212), for the
  -- reason create_participation states.
  PERFORM public.record_required_consents(
    p_product_id, p_customer_id, p_participant_id, p_customer_id,
    p_consented_documents
  );

  -- Stamp the join time; order is derived from it, never stored as a rank.
  -- clock_timestamp(), NOT now(): now() is transaction_timestamp() (frozen at
  -- transaction start), so concurrent joins serialized on the gate lock can
  -- carry equal/inverted stamps and both compute rank 1. clock_timestamp()
  -- reads the wall clock at this statement — which runs under the lock, after
  -- the prior joiner committed — so stamps are monotonic with real join order.
  v_now := clock_timestamp();
  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, waitlisted_at
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'waitlisted', v_now
  )
  RETURNING id INTO v_participation_id;

  SELECT COUNT(*) INTO v_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted'
      AND (waitlisted_at < v_now
           OR (waitlisted_at = v_now AND id <= v_participation_id));

  -- The one call that wrote a row. Everything that must happen exactly once per
  -- place in line keys on this.
  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_position,
    'status', 'waitlisted',
    'idempotent', FALSE
  );
END;
$$;


--
-- Name: FUNCTION join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[]) IS 'Waitlist engine behind join_product_waitlist: gates the audience, refuses a product with the waitlist off, and either writes a waitlisted participation stamped with clock_timestamp() or returns the waitlisted/reserving/active row already there. Returns participation_id, waitlist_position (0 when the row already holds a seat rather than a place in line), status, and idempotent — false only on the call that ran the INSERT, true on a call that recognised an existing row. Anything that must happen exactly once per place in line (the confirmation email) keys on idempotent=false; the flag is the only way to tell a replay apart, since both answers are otherwise identical. Since 00210 it takes p_consented_documents and calls record_required_consents just below the idempotency return, so joining a queue is held to the same enrolment conditions as taking a seat — a family that could queue unconsented would first meet the conditions at promotion, which is the moment they are least able to decline — and a replay records nothing, because it is the same enrolment agreed once. Since 00212 it names p_customer_id as the acceptance''s accepted_by as well as its customer, the parent having ticked the boxes themselves. No EXECUTE grant to anyone: the guarded wrapper is the only caller.';


--
-- Name: leave_my_waitlist_spot(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid        UUID;
  v_product_id UUID;
  v_status     public.participation_status;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- Keyed to the purchasing parent rather than to the row's existence: a row
  -- belonging to someone else is answered identically to one that never
  -- existed, so a probe learns nothing from which id it aims at.
  SELECT product_id, status
    INTO v_product_id, v_status
    FROM public.participations
   WHERE id = p_participation_id
     AND customer_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- Serialize against concurrent joins, promotions and cancels on this product,
  -- the same gate every other waitlist transition takes.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Re-read under the lock. An admin promotion can land between the ownership
  -- read above and the lock; deleting then would throw away a seat the family
  -- now holds, which is emphatically not what the parent confirmed.
  SELECT status
    INTO v_status
    FROM public.participations
   WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  IF v_status <> 'waitlisted'::public.participation_status THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  -- The ownership predicate is repeated on the DELETE so the statement that
  -- actually mutates carries the authorization itself, rather than inheriting
  -- it from a SELECT several statements up.
  DELETE FROM public.participations
   WHERE id = p_participation_id
     AND customer_id = v_uid;

  RETURN jsonb_build_object(
    'kind', 'left',
    'participation_id', p_participation_id,
    'product_id', v_product_id
  );
END;
$$;


--
-- Name: FUNCTION leave_my_waitlist_spot(p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) IS 'Give up a waitlist spot. Authorized to the purchasing parent (customer_id = auth.uid()); refuses any row that is not still waitlisted, under the product gate lock. Deletes the row, matching cancel_participation.';


--
-- Name: location_search_blob(text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT coalesce(
    public.location_search_separator()
      || string_agg(term, public.location_search_separator() ORDER BY term)
      || public.location_search_separator(),
    public.location_search_separator()
  )
  FROM (
    SELECT DISTINCT lower(public.immutable_unaccent(btrim(raw.value))) AS term
      FROM (
             SELECT p_name
             UNION ALL
             -- Alternates only. `name` is never duplicated into name_i18n, so
             -- the keys are irrelevant here; only the values are searchable.
             SELECT alternate.value
               FROM jsonb_each_text(coalesce(p_name_i18n, '{}'::jsonb)) AS alternate
             UNION ALL
             SELECT p_external_code
           ) AS raw(value)
     WHERE raw.value IS NOT NULL
       AND btrim(raw.value) <> ''
  ) AS terms;
$$;


--
-- Name: FUNCTION location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text) IS 'Every searchable string for a location row — canonical name, each name_i18n alternate, the official code — folded to lowercase without diacritics and joined with the separator around each term. Backs the generated locations.search_blob column.';


--
-- Name: location_search_separator(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.location_search_separator() RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT chr(31);
$$;


--
-- Name: FUNCTION location_search_separator(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.location_search_separator() IS 'The term delimiter inside locations.search_blob: U+001F UNIT SEPARATOR. A term-prefix match is "contains separator || needle"; an exact term match is "contains separator || needle || separator".';


--
-- Name: participation_state(public.participation_status, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN p_status = 'waitlisted' THEN 'waitlisted'
    WHEN p_group_id IS NULL      THEN 'unassigned'
    ELSE 'assigned'
  END;
$$;


--
-- Name: pin_is_set(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pin_is_set() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select coalesce(
    (select pin_hash is not null
       from customer_profiles
      where user_id = auth.uid()),
    false
  );
$$;


--
-- Name: product_has_session(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.product_has_session(p_product_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH p AS (
    SELECT timezone FROM public.products WHERE id = p_product_id
  )
  SELECT
    EXISTS (
      SELECT 1 FROM public.schedule_slots s
      WHERE s.product_id = p_product_id
        AND s.weekday = (EXTRACT(ISODOW FROM p_session_date)::INTEGER - 1)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_holiday_calendars phc
      JOIN public.calendar_holidays ch ON ch.calendar_id = phc.calendar_id
      WHERE phc.product_id = p_product_id
        AND ch.date = p_session_date
    );
$$;


--
-- Name: promote_from_waitlist(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id  UUID;
  v_status      public.participation_status;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- Serialize against concurrent joins/cancels/promotions on this product.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Idempotent / wrong-state: report current status without mutating.
  IF v_status <> 'waitlisted' THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  -- A drop target group must belong to this product (NULL = unassigned inbox).
  IF p_group_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.product_groups
        WHERE id = p_group_id AND product_id = v_product_id
     ) THEN
    RAISE EXCEPTION 'group % is not in product %', p_group_id, v_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Give them a seat. No seat-count gate by design: promoting from a full
  -- waitlist is a deliberate admin capacity override. waitlisted_at cleared so
  -- they leave the waitlist ordering. The uq_participations_active_or_waitlisted
  -- index already guaranteed no other in-set row exists for this (product,gamer).
  --
  -- The two offer stamps go with it (00207). An admin dragging a row that
  -- carries a live offer is answering it on the family's behalf — granting
  -- exactly the seat the offer asked about — so the offer is over, and the
  -- emailed link stops validating on its own because it no longer matches. The
  -- clear is unconditional rather than guarded: the CHECK forbids an offer
  -- stamp on a non-waitlisted row, so leaving one behind would fail this very
  -- UPDATE.
  UPDATE public.participations
     SET status = 'active',
         group_id = p_group_id,
         waitlisted_at = NULL,
         seat_offer_sent_at = NULL,
         seat_offer_expiry_notified_at = NULL
   WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'promoted',
    'participation_id', p_participation_id,
    'product_id', v_product_id,
    'group_id', p_group_id
  );
END;
$$;


--
-- Name: FUNCTION promote_from_waitlist(p_participation_id uuid, p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid) IS 'Admin-gated promotion of a waitlisted participation into a seat, under the product gate lock. No seat-count gate by design — promoting from a full waitlist is a deliberate capacity override. Clears waitlisted_at so the row leaves the queue ordering, and since 00207 clears the two seat-offer stamps with it: an admin dragging an invited row is honouring that offer by hand, which ends it, and the emailed link stops validating on its own because it no longer matches the row. The clear is unconditional because the CHECK forbids an offer stamp on a non-waitlisted row.';


--
-- Name: record_attendance(uuid, date, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_starts_at  timestamptz;
  v_status     text := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_uid        uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Authorize the TARGET as well as the actor: the person must actually be on
  -- this group's roster. Without this, an assigned gedu could aim a mark at any
  -- profile id in the system. It binds an ADMIN identically — the privilege
  -- granted above is a gedu's, not a licence to write a record a gedu could
  -- not. The predicate has never cared who the participant is, which is why an
  -- adult seat is markable with no branch here.
  IF NOT EXISTS (
    SELECT 1
      FROM public.participations part
     WHERE part.group_id = p_group_id
       AND part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_session_id := public.ensure_group_session(p_group_id, p_session_date);

  SELECT starts_at INTO v_starts_at
    FROM public.group_sessions WHERE id = v_session_id;

  -- The roll-call boundary: marks open the moment the session's scheduled
  -- start passes. A session under way takes attendance — that is when the gedu
  -- can see who is in the room — while a session that has not started cannot,
  -- because there is nothing yet to have attended. An admin is bound by it too:
  -- it is a fact about the record, not about who is writing it.
  IF v_starts_at > now() THEN
    RAISE EXCEPTION 'Attendance can only be recorded once the session has started'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status IS NULL THEN
    DELETE FROM public.session_attendance
     WHERE session_id = v_session_id AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
      'session_id',     v_session_id,
      'participant_id', p_participant_id,
      'status',         NULL
    );
  END IF;

  INSERT INTO public.session_attendance (
    session_id, participant_id, status, recorded_by
  )
  VALUES (v_session_id, p_participant_id, v_status, v_uid)
  ON CONFLICT (session_id, participant_id) DO UPDATE
    SET status      = EXCLUDED.status,
        recorded_by = EXCLUDED.recorded_by,
        recorded_at = now();

  -- The session's audit trail follows the marks: recording attendance IS a
  -- write to the session, even when neither note changed.
  UPDATE public.group_sessions
     SET updated_by = v_uid, updated_at = now()
   WHERE id = v_session_id;

  RETURN jsonb_build_object(
    'session_id',     v_session_id,
    'participant_id', p_participant_id,
    'status',         v_status
  );
END;
$$;


--
-- Name: FUNCTION record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) IS 'Record (or, with a NULL status, clear) ONE participant''s attendance mark for one session. Per-mark so concurrent writers cannot clobber each other; marks open at the session''s scheduled start (roll call during the session is the standard pattern) and never before. Open to an ADMIN or to the gedu assigned to the group (00200) — the guard admits either role and only the assignment half of the gate is skipped for an admin. The TARGET check is not: both callers must aim the mark at somebody who actually holds an active seat in the group, and both are refused before the session starts. The target is whoever holds the seat — an adult is marked present exactly as a child is, with no branch for it.';


--
-- Name: record_registration_marketing_consent(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_registration_marketing_consent(p_customer_id uuid, p_granted boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_current boolean;
BEGIN
  IF p_customer_id IS NULL OR p_granted IS NULL THEN
    RAISE EXCEPTION
      'a registration marketing consent needs both a customer and an answer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The role invariant `set_marketing_consent` gets from assert_role, read off
  -- the named profile instead because there is no session here to ask about.
  -- A missing profile fails the same test and gets the same refusal: both mean
  -- "this is not a parent's mailbox".
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = p_customer_id
       AND p.role = 'customer'
  ) THEN
    RAISE EXCEPTION
      'marketing consent belongs to a customer profile (% is not one)',
      p_customer_id
      USING ERRCODE = 'raise_exception';
  END IF;

  -- FOR UPDATE so a retry racing the original serializes rather than both
  -- concluding they are the change. A row that does not exist locks nothing,
  -- which is the harmless half — the ON CONFLICT below settles a first-answer
  -- race, and the losing side writes an event for a state it genuinely set.
  SELECT mc.granted
    INTO v_current
    FROM public.marketing_consents mc
   WHERE mc.customer_id = p_customer_id
     AND mc.consent_type = 'school_of_gaming'
   FOR UPDATE;

  -- IS NOT DISTINCT FROM, not `=`: no row at all yields NULL, and NULL is
  -- distinct from both true and false, which is the intended reading. Never
  -- answered is not the same state as answered no, so a parent declining on the
  -- sign-up form is a change and gets its event.
  IF v_current IS NOT DISTINCT FROM p_granted THEN
    RETURN;
  END IF;

  INSERT INTO public.marketing_consents (
    customer_id, consent_type, granted, updated_at
  )
  VALUES (p_customer_id, 'school_of_gaming', p_granted, now())
  ON CONFLICT (customer_id, consent_type) DO UPDATE
    SET granted    = EXCLUDED.granted,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.marketing_consent_events (
    customer_id, consent_type, granted, source
  )
  VALUES (p_customer_id, 'school_of_gaming', p_granted, 'registration');
END;
$$;


--
-- Name: FUNCTION record_registration_marketing_consent(p_customer_id uuid, p_granted boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_registration_marketing_consent(p_customer_id uuid, p_granted boolean) IS 'Record the marketing answer given on the parent sign-up form — the state row and its event row together, in one transaction. The register route called PostgREST twice for this and two calls are two transactions, so a failed second write left marketing_consents asserting an answer that marketing_consent_events could not corroborate; on the one consent whose value is provable provenance, an opt-in nobody can evidence is worse than none. Deliberately narrower than set_marketing_consent: the consent type is hardcoded to school_of_gaming (ours is the only list asked for at registration — the partner''s is asked on products, per 00220) and the source is hardcoded to `registration`, so neither can be forged through this function. The customer IS a parameter because no session exists yet, which is why the only EXECUTE grant is to service_role: a parameter naming the subject can be aimed at somebody, so nothing reachable may call it. It still tests that the named profile is a `customer`, which is the invariant assert_role gives the self-service writer, read from the only place available here. Appends an event only when the state actually MOVES, so a retried registration request records nothing twice — and a first explicit "no" IS a move, because an absent row means never asked.';


--
-- Name: record_required_consents(uuid, uuid, uuid, uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_required_consents(p_product_id uuid, p_customer_id uuid, p_participant_id uuid, p_accepted_by uuid, p_consented_documents text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_required text[];
  v_missing  text[];
BEGIN
  -- FIRST, before anything reads the product: an array carrying a NULL element
  -- is refused outright (00211). A NULL is not a slug, so it can never be an
  -- agreement to a document, and the only thing it has ever been good for is
  -- turning the membership test below into a three-valued expression that
  -- answers "nothing is missing" for a caller who agreed to nothing.
  -- `unnest(NULL::text[])` yields no rows, so an omitted array (the ordinary
  -- shape on a product that requires nothing) passes straight through here.
  IF EXISTS (
    SELECT 1 FROM unnest(p_consented_documents) AS c WHERE c IS NULL
  ) THEN
    RAISE EXCEPTION
      'the consented-document list contains a NULL entry, which is not a document'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT array_agg(prc.document_slug ORDER BY prc.document_slug)
    INTO v_required
    FROM public.product_required_consents prc
   WHERE prc.product_id = p_product_id;

  -- The overwhelmingly common case: a product with no required consents. It is
  -- not an error to send slugs anyway — an extra slug is a client that has not
  -- refreshed, not an attack — so nothing is written and nothing is refused.
  IF v_required IS NULL THEN
    RETURN;
  END IF;

  -- COALESCE rather than a NULL check: a caller who sent nothing and a caller
  -- who sent an empty array are making the same claim, and both must be refused
  -- with the same message naming what is missing.
  --
  -- NOT EXISTS rather than 00210's `NOT (r = ANY (...))` (00211): the ANY form
  -- is three-valued and a NULL element makes it answer NULL instead of false for
  -- every required document, which drops every row from this ARRAY() and
  -- reports that nothing is missing. This form is two-valued — a NULL element
  -- fails `c = r` and contributes nothing — so a required document with no
  -- match stays missing whatever else is in the array. The guard at the top of
  -- this function already refuses that input; this is the second lock on the
  -- same door, and it is deliberate.
  v_missing := ARRAY(
    SELECT r
      FROM unnest(v_required) AS r
     WHERE NOT EXISTS (
       SELECT 1
         FROM unnest(COALESCE(p_consented_documents, ARRAY[]::text[])) AS c
        WHERE c = r
     )
  );

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'this product requires consent to % before enrolling',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- One row per REQUIRED document — never one per slug the caller sent, so a
  -- client that ticks a document the product does not require records nothing
  -- extra. The version is resolved here and never taken from the caller: the
  -- greatest created_at for that slug, with `version DESC` as a tiebreaker so
  -- two revisions published in one transaction pick deterministically rather
  -- than arbitrarily (an arbitrary answer to "what is current" is worse than a
  -- wrong one, because it changes between reads).
  --
  -- A required slug with NO published version yields NULL here and the NOT NULL
  -- on document_version aborts the enrolment. That is the intended handling: it
  -- is a data error only a migration could create, and enrolling somebody
  -- against a document that has never been published is not a lesser outcome
  -- than failing loudly.
  --
  -- accepted_by is likewise the caller's to state and not the caller's to
  -- forge: every one of the three callers is SECURITY DEFINER and passes either
  -- the customer it already pinned or its own auth.uid(), so no wire field
  -- reaches this column.
  INSERT INTO public.consent_acceptances (
    customer_id, participant_id, product_id, document_slug, document_version,
    accepted_by
  )
  SELECT p_customer_id,
         p_participant_id,
         p_product_id,
         r,
         (SELECT cdv.version
            FROM public.consent_document_versions cdv
           WHERE cdv.document_slug = r
           ORDER BY cdv.created_at DESC, cdv.version DESC
           LIMIT 1),
         p_accepted_by
    FROM unnest(v_required) AS r;
END;
$$;


--
-- Name: FUNCTION record_required_consents(p_product_id uuid, p_customer_id uuid, p_participant_id uuid, p_accepted_by uuid, p_consented_documents text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_required_consents(p_product_id uuid, p_customer_id uuid, p_participant_id uuid, p_accepted_by uuid, p_consented_documents text[]) IS 'The enrolment-consent gate, and the only writer of consent_acceptances. Loads the product''s required document slugs, refuses the enrolment with check_violation unless the caller''s array covers ALL of them (naming the missing ones), and then writes one acceptance row per REQUIRED slug at that slug''s CURRENT version — the row with the greatest created_at, resolved server-side and never supplied by a caller. A product requiring nothing is a no-op, including when slugs are sent anyway. Carries no EXECUTE grant for any role, because every caller is SECURITY DEFINER and already holds the privilege as the owner. Since 00211 an array containing a NULL element is refused before anything else happens, and the missing-set test is a two-valued NOT EXISTS rather than 00210''s `NOT (r = ANY (...))`: the ANY form answered SQL NULL — which NOT turns into NULL, not true — whenever the array held a NULL and nothing matched, so ARRAY[NULL] passed the gate for every required document and recorded acceptances nobody had given. Since 00212 it takes p_accepted_by, the profile that PERFORMED the act, and there are THREE callers rather than two: create_participation and join_waitlist pass their own p_customer_id, because the parent ticked the boxes themselves, and admin_enroll_participant passes the acting admin''s auth.uid() while leaving customer_id the family''s. These consents are NON-REVOCABLE enrolment conditions — see the consent_acceptances table comment.';


--
-- Name: refresh_product_seat_counts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_product_seat_counts(p_product_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_active     INTEGER;
  v_waitlist   INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'active'),
    COUNT(*) FILTER (WHERE status = 'waitlisted')
    INTO v_active, v_waitlist
    FROM public.participations
    WHERE product_id = p_product_id;

  INSERT INTO public.product_seat_counts (
    product_id, active_count, waitlist_count, updated_at
  )
  VALUES (p_product_id, v_active, v_waitlist, NOW())
  ON CONFLICT (product_id) DO UPDATE SET
    active_count    = EXCLUDED.active_count,
    waitlist_count  = EXCLUDED.waitlist_count,
    updated_at      = EXCLUDED.updated_at;
END;
$$;


--
-- Name: register_gedu(uuid, text, text, text, text, public.spoken_language[], uuid[], text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages public.spoken_language[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: request_my_verification_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_my_verification_email() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_count   integer;
BEGIN
  -- Not reachable through PostgREST as `authenticated` (that role's JWT always
  -- carries a subject), but a request row attributed to nobody would count
  -- against nobody, so this fails closed rather than inserting NULL.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock keyed to the caller: without it two concurrent requests both
  -- read the same count and both pass, which is precisely the bypass a
  -- database-side limit exists to close.
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  SELECT count(*) INTO v_count
  FROM public.verification_email_requests
  WHERE user_id = v_user_id
    AND created_at > now() - interval '1 hour';

  -- Returns false (not an error) when the per-hour rate limit is hit; the route
  -- maps that to 429.
  IF v_count >= 6 THEN
    RETURN false;
  END IF;

  INSERT INTO public.verification_email_requests (user_id)
  VALUES (v_user_id);

  -- These rows are pure bookkeeping — nothing reads them but the count above,
  -- and one older than the window can never change that count again — so the
  -- RPC self-prunes instead of leaving a table to grow forever. Scoped to the
  -- caller, under the lock already held.
  DELETE FROM public.verification_email_requests
  WHERE user_id = v_user_id
    AND created_at <= now() - interval '1 hour';

  RETURN true;
END;
$$;


--
-- Name: FUNCTION request_my_verification_email(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.request_my_verification_email() IS 'Self-scoping rate-limit gate for the verification-email send: takes no argument and writes a verification_email_requests row for auth.uid(), refusing with false once the caller has six rows in the trailing hour. Prunes the caller''s expired rows on the way past, because nothing reads them but its own count. The route maps false to 429.';


--
-- Name: reset_email_verification_on_email_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_email_verification_on_email_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- A no-op rewrite of the same address is not a change and must not cost the
  -- family their verified state; only a different string does.
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: respond_seat_offer(uuid, timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id        uuid;
  v_product_status    public.product_status;
  v_status            public.participation_status;
  v_sent_at           timestamptz;
  v_customer_id       uuid;
  v_participant_id    uuid;
  v_group_id          uuid;
  v_group_count       integer;
  v_within_window     boolean;
  v_already_notified  boolean;
BEGIN
  SELECT product_id INTO v_product_id
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- The same gate lock, so an admin drag-promoting this very row and a parent
  -- pressing Accept cannot both write it. The status rides back on the lock
  -- rather than being read in a second statement, because the answer has to be
  -- the one the lock is holding still.
  SELECT status INTO v_product_status
    FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- THE ONE FACT AN HONOURED INVITE ALWAYS REQUIRES: the product still exists
  -- and still stands. Everything else about the offer is grandfathered (see the
  -- header) — the terms it went out on survive an admin's edit, because we
  -- asked and they said yes. The product itself is not one of those terms. An
  -- invitation to a club that has been cancelled is an invitation to nothing,
  -- and seating a family into it would be worse than refusing them.
  --
  -- NOT FOUND is reachable even though the participation was found a statement
  -- ago: participations.product_id cascades on delete, so a product dropped
  -- between the two takes the row with it and this lock finds nothing.
  --
  -- Both answer `stale`, which is the outcome every other "this is no longer
  -- open" case already produces — deliberately not a new kind. THIS IS ALSO THE
  -- ONE REFUSAL THAT STAYS GENERIC ALL THE WAY OUT. A `stale` answer is re-read
  -- against the row by the caller, and every shape that means the offer was
  -- consumed — accepted, promoted, declined, withdrawn, superseded — resolves
  -- to `used`. A row still holding this exact offer inside its window cannot be
  -- any of those, so it is this guard that refused, and it resolves to the
  -- generic `invalid` instead: a distinguishable answer would let an
  -- unauthenticated caller ask which products have been cancelled.
  IF NOT FOUND OR v_product_status = 'cancelled'::public.product_status THEN
    RETURN jsonb_build_object('kind', 'stale');
  END IF;

  -- The notified stamp is read HERE, in the same statement as the identifiers
  -- and for the same reason: the DELETE below takes the column with it, and
  -- after that nothing can tell whether staff were ever told this offer went
  -- unanswered. See the header for why the answer matters and why this read is
  -- deliberately unlocked.
  SELECT status,
         seat_offer_sent_at,
         customer_id,
         participant_id,
         seat_offer_expiry_notified_at IS NOT NULL
    INTO v_status, v_sent_at, v_customer_id, v_participant_id, v_already_notified
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- The compare-and-swap, and the whole of this feature's replay protection.
  -- Every way an offer ends moves this value: accepting clears it, declining
  -- deletes the row, re-offering replaces it. So a link, a stale tab and a
  -- second click all fail here rather than in a revocation table that does not
  -- exist. `IS DISTINCT FROM` because a NULL stamp must compare unequal to
  -- everything rather than swallow the test three-valued.
  --
  -- The status test below can only fire if the CHECK constraint has been
  -- broken, since an offer stamp cannot survive on a non-waitlisted row. It is
  -- here because a silent seat grant would be the failure mode otherwise.
  IF v_sent_at IS NULL
     OR v_sent_at IS DISTINCT FROM p_offer_sent_at
     OR v_status <> 'waitlisted'::public.participation_status THEN
    RETURN jsonb_build_object('kind', 'stale');
  END IF;

  -- The window is enforced HERE and not only in the token, because the in-app
  -- path carries no token at all: a parent pressing Accept on their My SOG card
  -- names a participation and nothing else.
  --
  -- THE WINDOW BINDS ACCEPT AND NOTHING ELSE, AND THAT ASYMMETRY IS THE POINT
  --
  -- The deadline exists to stop a seat being claimed after we have given up
  -- waiting and offered it to somebody else. Nothing about that reasoning
  -- reaches a DECLINE: a family saying "we cannot come" is giving something
  -- back, and there is no hour of the day when we would rather not know. A
  -- refusal there would be the database insisting a family keep a place they
  -- have just told us they do not want, purely because they answered late.
  --
  -- So the window is read once into a flag and tested only on the accept side.
  -- The flag rides back on the DECLINE result because the ROUTE has to tell an
  -- answer that beat the deadline from one that did not, even though the family
  -- does not. It is computed here rather than by the caller because this
  -- transaction is the only place the stamp and the clock are read together
  -- under the lock.
  v_within_window := v_sent_at + interval '5 days' > now();

  IF p_accept AND NOT v_within_window THEN
    RETURN jsonb_build_object(
      'kind',             'expired',
      'participation_id', p_participation_id,
      'product_id',       v_product_id
    );
  END IF;

  IF p_accept THEN
    -- The single group, resolved again at answer time rather than trusted from
    -- send time: an admin may have added or removed one while the family was
    -- deciding. If the answer is no longer unambiguous the seat is STILL
    -- granted and simply lands unassigned — we asked, they said yes, and a
    -- placement question is ours to sort out, not a reason to refuse them.
    SELECT count(*) INTO v_group_count
      FROM public.product_groups
     WHERE product_id = v_product_id;

    IF v_group_count = 1 THEN
      SELECT id INTO v_group_id
        FROM public.product_groups
       WHERE product_id = v_product_id;
    ELSE
      v_group_id := NULL;
    END IF;

    -- No seat-count gate, deliberately — the same capacity override
    -- promote_from_waitlist makes, with a stronger claim behind it: this seat
    -- was offered by name and accepted. A product that refilled in the meantime
    -- goes one over rather than taking back an invitation.
    UPDATE public.participations
       SET status                        = 'active'::public.participation_status,
           group_id                      = v_group_id,
           waitlisted_at                 = NULL,
           seat_offer_sent_at            = NULL,
           seat_offer_expiry_notified_at = NULL
     WHERE id = p_participation_id;

    RETURN jsonb_build_object(
      'kind',             'accepted',
      'participation_id', p_participation_id,
      'product_id',       v_product_id,
      'group_id',         v_group_id,
      'customer_id',      v_customer_id,
      'participant_id',   v_participant_id
    );
  END IF;

  -- Declining gives up the place in line, exactly as leave_my_waitlist_spot
  -- does — a family who cannot come has no queue position to keep warm, and the
  -- staff mail this triggers is what turns their answer into the next family's
  -- invitation. The identifiers are read above, before the row is gone, because
  -- the mail names all four.
  --
  -- Reachable after the window has closed as well as inside it, which is the
  -- whole of the asymmetry above. The two flags below are what tell the caller
  -- which of the two it just did AND whether anybody has already been told this
  -- offer lapsed — and after this statement neither question has an answer left
  -- anywhere, because the row that held both is gone.
  DELETE FROM public.participations WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind',             'declined',
    'participation_id', p_participation_id,
    'product_id',       v_product_id,
    'customer_id',      v_customer_id,
    'participant_id',   v_participant_id,
    'within_window',    v_within_window,
    'already_notified', v_already_notified
  );
END;
$$;


--
-- Name: FUNCTION respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean) IS 'A family''s answer to a seat offer, under the product gate lock. Compare-and-swap on p_offer_sent_at against the stored stamp: every way an offer ends moves that value, so a used link, a stale tab and a superseded offer all come back ''stale'' with no revocation table anywhere. The five-day window is re-checked here rather than trusted from the token, because the in-app path (a parent pressing Accept in My SOG) carries no token. THE WINDOW BINDS ACCEPT ALONE. A DECLINE succeeds for as long as the row exists, late or not: the deadline is there to stop a seat being claimed after we have offered it elsewhere, and none of that reasoning reaches a family giving a place back. THE DECLINED RESULT CARRIES TWO FLAGS AND THEY ANSWER DIFFERENT QUESTIONS. within_window says the answer beat the deadline. already_notified says seat_offer_expiry_notified_at was set when we read it — read before the DELETE, because the DELETE takes the column with it and after that nothing can tell whether staff were ever told this offer went unanswered. The caller mails on within_window OR NOT already_notified, which skips the mail only where the no-response mail demonstrably went: expiry here is OBSERVED rather than scheduled, so an offer nobody looked at between its fifth day and a late answer was never reported, and treating lateness alone as proof of notification made staff learn less from an answer than from silence. The already_notified read is deliberately not locked against a concurrent sweep — this transaction holds the product gate lock, not the participation row — so the worst case is one duplicate staff mail, which is the recoverable direction. THE PRODUCT IS RE-CHECKED BY ID ON THE LOCK: a MISSING or ''cancelled'' product answers ''stale'' and grants nothing. That is the boundary of this function''s grandfathering — the TERMS the offer went out on survive an admin''s edit (the billing mode is deliberately not re-read), but the product''s own existence and standing are not terms, and the one fact an honoured invite always requires is that the product it names still exists and stands. A product that has merely run out of dates is NOT guarded: it still exists and nothing has been withdrawn. That guard is also the one refusal that stays generic all the way out to the reader: every other ''stale'' resolves to ''used'' when the caller re-reads the row, and only a row still holding this exact live offer resolves to ''invalid'', because a distinguishable answer would let an unauthenticated caller ask which products have been cancelled. ACCEPT activates the seat and places it in the product''s single group, resolved again at answer time — if the product no longer has exactly one group the seat is still granted and lands unassigned, because a placement question is ours and not a reason to withdraw an invitation. There is no seat-count gate, deliberately: the same capacity override promote_from_waitlist makes, with a stronger claim behind it, so a product that refilled while the family was deciding goes one over. DECLINE hard-deletes the row, matching leave_my_waitlist_spot, and returns the four identifiers the staff mail names because they cannot be read afterwards. No EXECUTE grant to authenticated: the public landing route has no session to guard on — the signed token is the authorization — and the in-app route establishes the parent''s ownership before calling.';


--
-- Name: search_locations(text, public.location_type[], integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_locations(p_query text, p_types public.location_type[] DEFAULT NULL::public.location_type[], p_limit integer DEFAULT 20, p_country text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
WITH RECURSIVE
probe AS (
  SELECT
    folded.needle,
    -- LIKE metacharacters in the needle are escaped, not stripped: a user typing
    -- "%" should find nothing rather than everything. Both arms build their
    -- patterns from this one value.
    replace(replace(replace(folded.needle, '\', '\\'), '%', '\%'), '_', '\_') AS pattern,
    char_length(folded.needle) >= 2 AS runnable,
    -- The cap is the server's, not the caller's. Clamped rather than rejected so
    -- an out-of-range limit degrades to a sane page instead of an error.
    least(greatest(coalesce(p_limit, 20), 1), 50) AS cap
  FROM (
    SELECT lower(public.immutable_unaccent(btrim(coalesce(p_query, '')))) AS needle
  ) AS folded
),
matched AS (
  -- One row per matching place, at its best rank across both arms. A place found
  -- by name AND by postal code is one hit, not two, and it keeps the better of
  -- the two ranks — which is what `DISTINCT ON (id) ORDER BY id, match_rank`
  -- expresses.
  SELECT DISTINCT ON (h.id)
         h.id, h.name, h.name_i18n, h.type, h.parent_id, h.country_code,
         h.external_code,
         -- Carried for the ordering below only; not part of the wire shape.
         h.depth,
         h.match_rank
    FROM (
      -- ARM 1 — the stored fold: canonical name, name_i18n alternates, official
      -- code. Unchanged from 00155.
      SELECT
        l.id, l.name, l.name_i18n, l.type, l.parent_id, l.country_code,
        l.external_code, l.depth,
        CASE
          -- A term IS the needle.
          WHEN l.search_blob LIKE (SELECT '%' || public.location_search_separator() || pattern || public.location_search_separator() || '%' FROM probe) THEN 0
          -- A term STARTS WITH the needle. A prefix hit found late in the scan
          -- therefore still outranks an infix hit found early, which is the whole
          -- point of ranking rather than filtering.
          WHEN l.search_blob LIKE (SELECT '%' || public.location_search_separator() || pattern || '%' FROM probe) THEN 1
          ELSE 2
        END AS match_rank
      FROM public.locations l
      -- Scalar subqueries rather than a join to `probe`: each becomes an InitPlan
      -- evaluated once, which is what lets the planner treat the pattern as a
      -- runtime constant and consider the trigram index.
      WHERE (SELECT runnable FROM probe)
        AND l.search_blob LIKE (SELECT '%' || pattern || '%' FROM probe)
        AND (p_types IS NULL OR l.type = ANY (p_types))
        -- Both filters live here rather than in `page`, so the total the panel
        -- reports counts only rows it could actually offer.
        AND l.retired_at IS NULL
        AND (p_country IS NULL OR l.country_code = p_country)

      UNION ALL

      -- ARM 2 — postal codes, joined back to the municipality they reach. The
      -- hit is the place, never the code: the code carries no name, no parent and
      -- nothing anyone browses.
      SELECT
        l.id, l.name, l.name_i18n, l.type, l.parent_id, l.country_code,
        l.external_code, l.depth,
        -- The needle IS a whole code, or it is a prefix of one. Nothing else —
        -- an infix arm on a five-digit code is noise, not a search.
        --
        -- Equality takes the unescaped needle because `=` interprets no
        -- metacharacters; the prefix takes the escaped pattern for the same
        -- reason arm 1 does.
        CASE
          WHEN pc.postal_code = (SELECT needle FROM probe) THEN 0
          ELSE 1
        END AS match_rank
      FROM public.postal_codes pc
      JOIN public.locations l ON l.id = pc.location_id
      WHERE (SELECT runnable FROM probe)
        AND pc.postal_code LIKE (SELECT pattern || '%' FROM probe)
        -- Every filter arm 1 applies, applied to the joined row rather than
        -- assumed from the fact that postal rows point at municipalities.
        AND (p_types IS NULL OR l.type = ANY (p_types))
        AND l.retired_at IS NULL
        AND (p_country IS NULL OR l.country_code = p_country)
    ) AS h
   ORDER BY h.id, h.match_rank
),
page AS (
  SELECT m.*
    FROM matched m
   -- A total order, so the page is stable: rank, then venues after places, then
   -- broadest level first, then name, then id to break the homonym ties France
   -- is full of.
   --
   -- Breadth is the stored `depth`, which is true for any hierarchy shape. Sites
   -- are pushed below places by their own term ahead of depth, because depth
   -- cannot separate them: a Finnish site and a French commune are both at
   -- depth 3.
   ORDER BY m.match_rank, (m.type = 'site'), m.depth, m.name, m.id
   LIMIT (SELECT cap FROM probe)
),
-- The chain of every hit on this page, at most `cap` rows walking at most a
-- handful of levels. Bounded by depth as well as by the parent FK in case a
-- hand-made row ever forms a cycle.
--
-- Deliberately unfiltered on `retired_at`: a hit's ancestors are rendered as a
-- path, and a path with a link missing is unreadable. Retirement hides a place
-- from being *chosen*, not from being *named*.
walk AS (
  SELECT p.id AS anchor_id, p.parent_id AS node_id, 1 AS depth
    FROM page p
  UNION ALL
  SELECT w.anchor_id, up.parent_id, w.depth + 1
    FROM walk w
    JOIN public.locations up ON up.id = w.node_id
   WHERE w.depth < 10
),
chains AS (
  SELECT w.anchor_id,
         jsonb_agg(
           jsonb_build_object(
             'id', a.id,
             'name', a.name,
             'name_i18n', a.name_i18n,
             'type', a.type
           ) ORDER BY w.depth
         ) AS ancestors
    FROM walk w
    JOIN public.locations a ON a.id = w.node_id
   GROUP BY w.anchor_id
)
SELECT jsonb_build_object(
  -- The union, deduped — so a place matching by name and by code counts once.
  'total', (SELECT count(*) FROM matched),
  'results', coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',            p.id,
        'name',          p.name,
        'name_i18n',     p.name_i18n,
        'type',          p.type,
        'parent_id',     p.parent_id,
        'country_code',  p.country_code,
        'external_code', p.external_code,
        -- Nearest first, matching every other ancestor chain in this codebase.
        'ancestors',     coalesce(c.ancestors, '[]'::jsonb)
      ) ORDER BY p.match_rank, (p.type = 'site'), p.depth, p.name, p.id
    )
      FROM page p
      LEFT JOIN chains c ON c.anchor_id = p.id
  ), '[]'::jsonb)
);
$$;


--
-- Name: FUNCTION search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text) IS 'Cross-country location search over two match sources merged before ranking: the stored fold on locations (canonical names, name_i18n alternates, official codes; exact > term-prefix > infix) and postal_codes joined to the municipality each code reaches (exact code > code prefix, no infix). Diacritic-insensitive both ways; one folded needle serves both arms. A place matching both ways appears once, at its better rank, and the total counts the deduped union. Returns {total, results[]} where results carry each hit''s ancestor chain nearest-first, ranked then places before venues, then broadest-first by the stored depth, and capped server-side. p_types and p_country restrict both arms, and the restriction applies to the total as well as the page. Retired rows are excluded from matches, but the ancestor walk still climbs through them so a chain renders whole. SECURITY INVOKER, so the caller''s RLS on locations and postal_codes applies unchanged; needles shorter than two characters return an empty result without reading either table.';


--
-- Name: send_seat_offer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_seat_offer(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product        public.products;
  v_product_id     uuid;
  v_status         public.participation_status;
  v_sent_at        timestamptz;
  v_customer_id    uuid;
  v_participant_id uuid;
  v_group_count    integer;
BEGIN
  SELECT product_id INTO v_product_id
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- The product gate lock, the same one every other waitlist transition takes.
  -- It serializes two admins pressing Invite on the same row at once, which is
  -- what makes the live-offer test below decide the replay rather than racing.
  SELECT * INTO v_product FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Re-read under the lock: a promotion or a leave can land between the two.
  SELECT status, seat_offer_sent_at, customer_id, participant_id
    INTO v_status, v_sent_at, v_customer_id, v_participant_id
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- Already moved on. Not an error: the admin is looking at a snapshot, and the
  -- panel refetches rather than arguing.
  IF v_status <> 'waitlisted'::public.participation_status THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  -- A seat offer says "come and join us", with no invoice attached and nothing
  -- for the family to agree to beyond turning up. On a paid product that
  -- sentence would be false — accepting would seat them with no subscription
  -- behind the seat — so the offer exists only where a seat costs the family
  -- nothing: free products, and the municipality clubs we invoice the
  -- municipality for.
  --
  -- Asked through `public.is_no_charge` (00206) rather than spelled out as an
  -- IN-list, so the two-versus-paid question has ONE spelling in this database:
  -- widening the no-charge set must not leave this gate behind. 00206 sorts
  -- before this file, so the helper exists by the time a from-scratch build runs
  -- this line — there is no ordering hazard, and none of the other seat-offer
  -- functions needs the helper (`respond_seat_offer` deliberately never reads
  -- billing mode at all — see the header — and the dashboard's live-offer read
  -- asks about offers, not about price).
  IF NOT public.is_no_charge(v_product.billing_mode) THEN
    RAISE EXCEPTION 'seat offers are only made on no-charge products'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Accepting has to place the child somewhere, and the family is never asked
  -- to choose. One group is the only arrangement where the answer is
  -- unambiguous, so it is the only arrangement that may be offered — an admin
  -- with two groups makes the placement decision themselves, by dragging.
  SELECT count(*) INTO v_group_count
    FROM public.product_groups
   WHERE product_id = v_product_id;
  IF v_group_count <> 1 THEN
    RAISE EXCEPTION 'product % has % groups; a seat offer needs exactly one',
                    v_product_id, v_group_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- A live offer already stands. Answer with the stamp that is actually on the
  -- row and flag the replay: `idempotent` is the only thing telling a
  -- double-click apart from a first send, and the mail keys on it — exactly the
  -- signal `join_waitlist` returns for the same reason. Note what it does NOT
  -- do: it does not refresh the deadline. A family looking at a mail with a
  -- date on it must not have that date moved under them by an admin pressing a
  -- button twice.
  IF v_sent_at IS NOT NULL AND v_sent_at + interval '5 days' > now() THEN
    RETURN jsonb_build_object(
      'kind',             'offered',
      'participation_id', p_participation_id,
      'product_id',       v_product_id,
      'customer_id',      v_customer_id,
      'participant_id',   v_participant_id,
      'sent_at',          v_sent_at,
      'idempotent',       TRUE
    );
  END IF;

  -- No offer, or an expired one. An expired offer is re-offerable outright: the
  -- family did not answer, the seat is still open, and asking again is the
  -- whole point. The old notification stamp goes with it, so a second silence
  -- notifies staff a second time.
  --
  -- date_trunc('milliseconds', …) — see the header. The token is signed over
  -- this instant and compared back through a JavaScript Date.
  UPDATE public.participations
     SET seat_offer_sent_at             = date_trunc('milliseconds', now()),
         seat_offer_expiry_notified_at  = NULL
   WHERE id = p_participation_id
  RETURNING seat_offer_sent_at INTO v_sent_at;

  RETURN jsonb_build_object(
    'kind',             'offered',
    'participation_id', p_participation_id,
    'product_id',       v_product_id,
    'customer_id',      v_customer_id,
    'participant_id',   v_participant_id,
    'sent_at',          v_sent_at,
    'idempotent',       FALSE
  );
END;
$$;


--
-- Name: FUNCTION send_seat_offer(p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.send_seat_offer(p_participation_id uuid) IS 'Offer an open seat to one waitlisted family, under the product gate lock. Refuses anything but a no-charge product (free or external_contract) and anything but exactly one group — accepting has to place the child, and the family is never asked to choose. Stamps seat_offer_sent_at with now() truncated to MILLISECONDS, which is load-bearing: the emailed token is signed over that exact instant and compared back through a JavaScript Date, which cannot hold microseconds. Returns the stored stamp (never the caller''s idea of it) plus idempotent — false only on the call that wrote a stamp, true when a LIVE offer was already standing. The mail keys on idempotent = false, the same signal join_waitlist returns for the same reason; a replay deliberately does not refresh the deadline, because a family reading a date in their inbox must not have it moved. An EXPIRED offer is re-offerable and clears the old expiry-notification stamp with it. No EXECUTE grant to authenticated: the admin route calls it through the service-role client, having established the admin''s identity itself.';


--
-- Name: set_gamer_group_note(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_row  public.gamer_group_notes;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ACTOR half: an admin, or a gedu who teaches this group's product. Read
  -- and write parity between the two is deliberate — refusing a substitute
  -- standing in for another group would make the feature useless in the one
  -- situation it matters most.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The TARGET half: a note may only be written about somebody who sits in the
  -- group it is filed under. Without this an authorized gedu could file a note
  -- against any profile id on the platform. The table carries no write grant,
  -- so it is correctly outside the write-IDOR loop's completeness check — these
  -- two checks together are what stands in for an entry there, and the db tests
  -- assert both halves negatively.
  --
  -- ANY status counts, not just active: a note about somebody on the group's
  -- waitlist is a coherent thing to write, and narrowing it buys nothing. What
  -- it does exclude is a member who has LEFT the group, which is why an
  -- orphaned note cannot be edited back into life.
  IF NOT EXISTS (
    SELECT 1 FROM public.participations part
     WHERE part.group_id       = p_group_id
       AND part.participant_id = p_participant_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- A trimmed-empty save DELETES the row. Clearing a note is how a gedu retires
  -- guidance that no longer applies, and the absence of a row is what "no note"
  -- means on every surface — so the empty save has to produce that absence
  -- rather than an empty string standing in for it. The returned document is
  -- the null shape, so a caller merges the same keys either way.
  IF v_note IS NULL THEN
    DELETE FROM public.gamer_group_notes
     WHERE group_id = p_group_id AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
      'group_id',                   p_group_id,
      'participant_id',             p_participant_id,
      'note',                       NULL,
      'note_updated_by_first_name', NULL,
      'updated_at',                 NULL
    );
  END IF;

  -- Upsert, last-write-wins, no history: only the last editor is stored.
  -- updated_at is left to the touch trigger. Length is NOT checked here — the
  -- CHECK refuses anything over 2000 with 23514, and since the dialog caps at
  -- 2000 a longer write can only come from a non-UI caller, which deserves a
  -- loud refusal rather than a silent truncation.
  INSERT INTO public.gamer_group_notes AS n
         (group_id, participant_id, note, updated_by)
  VALUES (p_group_id, p_participant_id, v_note, (SELECT auth.uid()))
  ON CONFLICT (group_id, participant_id) DO UPDATE
     SET note       = EXCLUDED.note,
         updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'group_id',       v_row.group_id,
    'participant_id', v_row.participant_id,
    'note',           v_row.note,
    -- Resolved at read time on purpose, unlike the signed-name snapshot on a
    -- contract acceptance: this line answers "who should I ask about this
    -- note", so the name they go by today is the right answer. NULL when the
    -- editor's account is gone (updated_by is ON DELETE SET NULL), and the
    -- surface then shows the note with no editor line.
    'note_updated_by_first_name',
      (SELECT pr.first_name FROM public.profiles pr WHERE pr.id = v_row.updated_by),
    'updated_at',     v_row.updated_at
  );
END;
$$;


--
-- Name: FUNCTION set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) IS 'Write, replace or clear the staff note about one member of one group, and return the resulting document (group_id, participant_id, note, note_updated_by_first_name, updated_at). Open to an ADMIN or to any gedu assigned to any group of the group''s product, with full read/write parity between the two; guard-first on assert_role, then two further 42501s — the ACTOR half (staff reach over the product) and the TARGET half (the participant actually holds a participation in that group, at ANY status). The target half is what stands in for a write-IDOR loop entry, since the table carries no write grant for any client role. A trimmed-empty note DELETES the row and returns the null-shaped document, because absence of a row is what "no note" means everywhere else. Over-long notes are refused by the table''s CHECK (23514) rather than truncated. Last-write-wins, and only the last editor is stored — there is no history. A note does not follow a member moved to another group: it stays where it was written.';


--
-- Name: set_gedu_certified(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gedu_certified(p_gedu_id uuid, p_certified boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_certified: % is not a gedu', p_gedu_id;
  END IF;

  UPDATE public.gedu_profiles
  SET certified    = p_certified,
      certified_at = CASE WHEN p_certified THEN now() ELSE NULL END,
      certified_by = CASE WHEN p_certified THEN (SELECT auth.uid()) ELSE NULL END
  WHERE user_id = p_gedu_id;
END;
$$;


--
-- Name: FUNCTION set_gedu_certified(p_gedu_id uuid, p_certified boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_gedu_certified(p_gedu_id uuid, p_certified boolean) IS 'Certify or de-certify a game educator. Admin-only (guard-first on assert_admin), and it stamps certified_at / certified_by server-side so the audit trail cannot be forged — which is why gedu_profiles carries no write grant at all and this RPC is the only way in. Called from the admin user-detail page through the admin''s own session. Renamed from set_gedu_verified in 00187.';


--
-- Name: set_gedu_criminal_record_check(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_criminal_record_check: % is not a gedu', p_gedu_id;
  END IF;

  UPDATE public.gedu_profiles
  SET criminal_record_check_passed = p_passed,
      criminal_record_check_at     = CASE WHEN p_passed THEN now() ELSE NULL END,
      criminal_record_check_by     = CASE WHEN p_passed THEN (SELECT auth.uid()) ELSE NULL END
  WHERE user_id = p_gedu_id;
END;
$$;


--
-- Name: FUNCTION set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean) IS 'Record — or withdraw — that an admin has seen an acceptable criminal record extract (rikostaustaote) for one game educator. The document itself is never stored: Finnish law 504/2002 has the educator obtain it themselves and lets us keep only the fact that it was presented and when. Admin-only, guard-first on assert_admin, and it refuses a target that is not a gedu. It stamps criminal_record_check_at / criminal_record_check_by server-side so the audit trail cannot be forged — which is why gedu_profiles carries no write grant at all and this RPC is the only way in — and nulls both when the check is withdrawn. Recording it GATES NOTHING: like contract acceptance it informs the certification decision, and admin certification remains the only blocking lever over an educator. Called from the admin user-detail page through the admin''s own session, which is why authenticated is the only role granted EXECUTE.';


--
-- Name: set_group_member_minecraft(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_uuid     text;
BEGIN
  -- Guard-first, in the shape the authorization spine reads: the role half
  -- admits an admin or a gedu and refuses everyone else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- Actor AND target: the participant must be actively participating in a group
  -- the caller is assigned to. A gedu may fix a username for the people they
  -- teach and for nobody else.
  --
  -- An admin passes this outright (00205). The admin group details page renders
  -- the gedu workspace's roster body — this editor included — for any group of
  -- any product, and an admin already holds the same edit on /admin/users/[id],
  -- so the group question was never a statement about them.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.participations part
      JOIN public.gedu_group_assignments ga ON ga.group_id = part.group_id
     WHERE part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
       AND ga.gedu_id    = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Target must be a GAMER (00177). A Minecraft link is a child's; an adult
  -- seat carries no game account and the roster renders that slot empty by
  -- design, so a row keyed to a customer would be an orphan the admin twin
  -- already refuses to write. The scope check above does not care about the
  -- target's role, so this stands on its own — and it binds an admin too, being
  -- about the integrity of the row rather than about who is looking.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_participant_id
       AND pr.role = 'gamer'
  ) THEN
    RAISE EXCEPTION 'participant % is not a gamer', p_participant_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_username := NULLIF(btrim(COALESCE(p_minecraft_username, '')), '');
  -- Clearing the username clears the uuid with it: a uuid without a name is a
  -- verified link to nothing.
  v_uuid := CASE WHEN v_username IS NULL
                 THEN NULL
                 ELSE NULLIF(btrim(COALESCE(p_minecraft_uuid, '')), '')
            END;

  INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
  VALUES (p_participant_id, v_username, v_uuid)
  ON CONFLICT (user_id) DO UPDATE
    SET minecraft_username = EXCLUDED.minecraft_username,
        minecraft_uuid     = EXCLUDED.minecraft_uuid;

  RETURN jsonb_build_object(
    'participant_id',     p_participant_id,
    'minecraft_username', v_username,
    'minecraft_uuid',     v_uuid
  );
END;
$$;


--
-- Name: FUNCTION set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) IS 'Set a group member''s Minecraft username + resolved UUID, scoped to participants actively enrolled in a group the calling gedu teaches. The Mojang lookup happens in the calling route, so a successful edit lands verified. In practice this is always a child: an adult seat carries no linked game account and the roster row shows that slot empty by design. Open since 00205 to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the group question as a second 42501 — the same shape the session writers took in 00200 and the group feed in 00204. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s roster body unchanged, inline editor included; an admin already holds this exact edit on /admin/users/[id], so the widening aligns two surfaces on one action rather than granting a power. An admin passes the group half outright and is exempt from nothing else: the target must still be a gamer (23514), and a customer or a gamer is still refused on the first statement.';


--
-- Name: set_group_member_roblox(uuid, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_user_id  bigint;
BEGIN
  -- Guard-first, in the shape the authorization spine reads: the role half
  -- admits an admin or a gedu and refuses everyone else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- Actor AND target: the participant must be actively participating in a group
  -- the caller is assigned to. A gedu may fix a username for the people they
  -- teach and for nobody else. An admin passes it outright (00205) — see the
  -- Minecraft twin above for why.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.participations part
      JOIN public.gedu_group_assignments ga ON ga.group_id = part.group_id
     WHERE part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
       AND ga.gedu_id    = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Target must be a GAMER (00177). A game account is a child's; an adult seat
  -- carries none and the roster renders that slot empty by design, so a row
  -- keyed to a customer would be an orphan the admin twin already refuses to
  -- write. The scope check above does not care about the target's role, so this
  -- stands on its own — and it binds an admin too.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_participant_id
       AND pr.role = 'gamer'
  ) THEN
    RAISE EXCEPTION 'participant % is not a gamer', p_participant_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_username := NULLIF(btrim(COALESCE(p_roblox_username, '')), '');
  -- Clearing the username clears the account id with it: an id without a name
  -- is a verified link to nothing. An omitted (or NULL) id alongside a name is
  -- the UNVERIFIED save — the calling route stores the name it was sent and
  -- takes the id only from its own server-side lookup, so a name Roblox could
  -- not resolve lands here with nothing beside it.
  v_user_id := CASE WHEN v_username IS NULL
                    THEN NULL
                    ELSE p_roblox_user_id
               END;

  INSERT INTO public.roblox_accounts (user_id, roblox_username, roblox_user_id)
  VALUES (p_participant_id, v_username, v_user_id)
  ON CONFLICT (user_id) DO UPDATE
    SET roblox_username = EXCLUDED.roblox_username,
        roblox_user_id  = EXCLUDED.roblox_user_id;

  RETURN jsonb_build_object(
    'participant_id',  p_participant_id,
    'roblox_username', v_username,
    'roblox_user_id',  v_user_id
  );
END;
$$;


--
-- Name: FUNCTION set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) IS 'Set a group member''s Roblox username + resolved account id, scoped to participants actively enrolled in a group the calling gedu teaches. The Roblox twin of set_group_member_minecraft, and identical to it in every respect but the key''s type: Roblox''s id is an int64, so the account-id parameter is a DEFAULTed bigint rather than a text column carrying an '''' sentinel, and omitting it is how an unverified save is expressed. The Roblox lookup happens in the calling route (neither Roblox API is reachable from a browser), so an id arriving here was resolved server-side and its presence is the whole of "verified". Clearing the username clears the id with it. In practice the target is always a child: an adult seat carries no linked game account and the roster row shows that slot empty by design. Open since 00205 to an ADMIN as well as to the assigned gedu, in the same change and the same shape as its Minecraft twin — the admin group details page renders one roster editor serving both platforms, so widening one alone would have shipped a control that works on a Minecraft group and refuses on a Roblox one. An admin passes the group half outright and is exempt from nothing else.';


--
-- Name: set_group_notes(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.product_groups;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.product_groups
     SET public_note = NULLIF(btrim(COALESCE(p_public_note, '')), ''),
         gedu_note   = NULLIF(btrim(COALESCE(p_gedu_note, '')), '')
   WHERE id = p_group_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',          v_row.id,
    'public_note', v_row.public_note,
    'gedu_note',   v_row.gedu_note
  );
END;
$$;


--
-- Name: FUNCTION set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) IS 'Write a group''s standing family-facing and gedu notes. Open to an ADMIN or to the gedu assigned to the group (00200) — the guard admits either role and only the assignment half of the gate is skipped for an admin. Last-write-wins.';


--
-- Name: set_group_session_notes(uuid, date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
  v_row        public.group_sessions;
BEGIN
  -- An admin, or a gedu. Written as one guard call rather than a branch around
  -- one so the authorization spine can read it — see the migration header.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The assignment half of the gate, which is what an admin is exempt from.
  -- Everything below it applies to both callers identically.
  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_session_id := public.ensure_group_session(p_group_id, p_session_date);

  UPDATE public.group_sessions
     SET report     = NULLIF(btrim(COALESCE(p_report, '')), ''),
         gedu_note  = NULLIF(btrim(COALESCE(p_gedu_note, '')), ''),
         updated_by = v_uid
   WHERE id = v_session_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',           v_row.id,
    'group_id',     v_row.group_id,
    'session_date', v_row.session_date,
    'starts_at',    v_row.starts_at,
    'ends_at',      v_row.ends_at,
    'report',       v_row.report,
    'gedu_note',    v_row.gedu_note
  );
END;
$$;


--
-- Name: FUNCTION set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) IS 'Write the family-facing report and the gedu note for one session, materializing the row if needed. Open to an ADMIN or to the gedu assigned to the group (00200): the guard admits either role, and the assignment half of the gate is skipped for an admin only. Everything else is unchanged for both — an unscheduled date is still refused with check_violation, and updated_by is still stamped with the caller, so an admin''s edit is attributed to the admin. Last-write-wins.';


--
-- Name: set_location_depth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_location_depth() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_parent_depth smallint;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  SELECT l.depth INTO v_parent_depth
    FROM public.locations l
   WHERE l.id = NEW.parent_id;

  -- A BEFORE trigger runs ahead of the FK check, so a parent_id pointing at no
  -- row arrives here first. Raising the FK error ourselves is what the products
  -- location trigger does for the same case: without it the assignment below
  -- would write NULL into a NOT NULL column and report a constraint the caller
  -- did not violate.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'locations.parent_id % references no row', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.depth := v_parent_depth + 1;
  RETURN NEW;
END;
$$;


--
-- Name: set_marketing_consent(public.marketing_consent_type, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) RETURNS void
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

  -- 'registration' is refused here and only ever written by the register route
  -- through the service-role client, before the account has a session at all.
  -- See the header: source is the one field on an event that nothing else can
  -- corroborate, so the source with no live caller is the one a live caller may
  -- not claim. NULL is refused by the same statement rather than by a NOT NULL
  -- further down, so the message names the real problem.
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


--
-- Name: FUNCTION set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) IS 'The one self-service writer of a marketing consent: the settings toggle and the product signup panel both call it, so the two paths cannot drift. Guard-first on assert_role(''customer'') — gamers and gedus hold no marketing consents, and an admin toggles their own on their own parent account rather than through here, because the answer belongs to whoever owns the mailbox. The customer is auth.uid() and is never a parameter, so there is nothing for a caller to aim at another family. REFUSES p_source = ''registration'': that source is written only by the register route through the service-role client, before a session exists, and it is the one field on an event nothing else can corroborate. IDEMPOTENT AND HONEST ABOUT IT — submitting the state already on file succeeds and appends NO event, because a change log that recorded non-changes would answer "how often did this parent change their mind" with a number made of page loads. A first explicit "no" IS a change: an absent row means never answered, which is not the same state as a recorded refusal.';


--
-- Name: set_my_pin(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_my_pin(p_pin text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
begin
  if p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  update customer_profiles
    set pin_hash = crypt(p_pin, gen_salt('bf'))
    where user_id = auth.uid();

  if not found then
    raise exception 'No customer profile for the current user';
  end if;
end;
$_$;


--
-- Name: set_pin_for_user(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_pin_for_user(p_user_id uuid, p_pin text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
begin
  if p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  update customer_profiles
    set pin_hash = crypt(p_pin, gen_salt('bf'))
    where user_id = p_user_id;

  if not found then
    raise exception 'No customer profile for user %', p_user_id;
  end if;
end;
$_$;


--
-- Name: set_product_required_consents(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_product_required_consents(p_product_id uuid, p_slugs text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- A NULL element is refused rather than repaired. Without this the DELETE
  -- below matches nothing — `document_slug = ANY (array containing NULL)` is
  -- NULL for every row that does not match, and `NOT NULL` is NULL — so a
  -- wipe-and-replace silently degrades into a merge, and the INSERT then dies
  -- on the NOT NULL with an error that says nothing about which argument was
  -- wrong. NULL as the whole array still means "requires nothing"; it is only a
  -- NULL *element* that is meaningless.
  IF EXISTS (SELECT 1 FROM unnest(p_slugs) AS s WHERE s IS NULL) THEN
    RAISE EXCEPTION
      'the required-consent slug list contains a NULL entry, which is not a document'
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOT EXISTS rather than `NOT (document_slug = ANY (...))`, for the same
  -- reason record_required_consents uses it: two-valued, so the set really is
  -- replaced whatever the array holds. The guard above already refuses the one
  -- input that made the difference; this is the second lock.
  DELETE FROM public.product_required_consents
   WHERE product_id = p_product_id
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(COALESCE(p_slugs, ARRAY[]::text[])) AS s
        WHERE s = document_slug
     );

  -- ON CONFLICT DO NOTHING rather than a blind insert after a blind delete: the
  -- pair above and below is a *set* replacement, and leaving an unchanged row
  -- in place keeps the delete from churning rows an admin did not touch. A slug
  -- the whitelist has never heard of is refused by the foreign key, which is
  -- the only validation this needs — admins are trusted, and a bad slug is a
  -- broken deploy rather than an attack.
  IF p_slugs IS NOT NULL AND array_length(p_slugs, 1) > 0 THEN
    INSERT INTO public.product_required_consents (product_id, document_slug)
    SELECT p_product_id, s
      FROM unnest(p_slugs) AS s
    ON CONFLICT (product_id, document_slug) DO NOTHING;
  END IF;
END;
$$;


--
-- Name: FUNCTION set_product_required_consents(p_product_id uuid, p_slugs text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_product_required_consents(p_product_id uuid, p_slugs text[]) IS 'Replace the set of consent documents a product requires, admin-only and guard-first on assert_admin. The only writer of product_required_consents: that table carries no write grant for any Data API role, and this function is what create_product and update_product both call so the join table has exactly one door. NULL and an empty array both mean "requires nothing", which is how a requirement is cleared. An unknown slug is refused by the foreign key into consent_documents — the only validation needed, since admins are trusted and a bad slug is a broken deploy rather than an attack. Since 00211 a NULL *element* is refused with check_violation, and the replacing DELETE uses a two-valued NOT EXISTS rather than 00210''s `NOT (document_slug = ANY (...))`, which matched no row at all once the array held a NULL and quietly turned the replacement into a merge.';


--
-- Name: set_site_notes(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_public_note text;
  v_gedu_note   text;
  v_address     text;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- "You run something at this building" — the site-scoped analogue of the
  -- assignment check, and the half an admin is exempt from.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
      JOIN public.products p ON p.id = ga.product_id
     WHERE ga.gedu_id     = (SELECT auth.uid())
       AND p.location_id  = p_location_id
       AND p.is_remote    = false
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_public_note := NULLIF(btrim(COALESCE(p_public_note, '')), '');
  v_gedu_note   := NULLIF(btrim(COALESCE(p_gedu_note, '')), '');

  INSERT INTO public.site_details (location_id, address, notes)
  VALUES (p_location_id, NULL, v_public_note)
  ON CONFLICT (location_id) DO UPDATE
    -- `address` is deliberately absent from this SET list: whatever an admin
    -- put there stays there.
    SET notes = EXCLUDED.notes
  RETURNING address INTO v_address;

  INSERT INTO public.site_staff_details (location_id, notes)
  VALUES (p_location_id, v_gedu_note)
  ON CONFLICT (location_id) DO UPDATE
    SET notes = EXCLUDED.notes;

  RETURN jsonb_build_object(
    'location_id', p_location_id,
    'address',     v_address,
    'public_note', v_public_note,
    'gedu_note',   v_gedu_note
  );
END;
$$;


--
-- Name: FUNCTION set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) IS 'Write a site''s shared family note and its gedu note. The venue ADDRESS is not a parameter and is never touched — it belongs to the location record and is an admin''s to edit through the location itself. Open to an ADMIN, or to a gedu who teaches on an in-person product at that site (00200). Last-write-wins on the notes, across products.';


--
-- Name: stamp_participation_group_joined_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_participation_group_joined_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- No group, no join. The ON DELETE SET NULL cascade from product_groups lands
  -- here too, which is the path no function would ever have covered: deleting a
  -- group rewrites group_id on every member row with nothing in between. A
  -- member with no group is not new to anything.
  IF NEW.group_id IS NULL THEN
    NEW.group_joined_at := NULL;

  -- IS DISTINCT FROM rather than <>, so a NULL on either side counts as a
  -- change: a seat moving from no group into one is exactly the case <> would
  -- miss. An UPDATE that does not NAME group_id never fires this trigger at
  -- all, so an unrelated write — a status change, the updated_at touch — cannot
  -- re-stamp; an UPDATE that names it with the value it already held does fire,
  -- and this comparison is what makes that a no-op.
  ELSIF TG_OP = 'INSERT' OR NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    -- now(), not clock_timestamp(). This is a display timestamp with no
    -- cross-row ordering semantics — the same case as signed_up_at beside it.
    -- Two moves inside one transaction therefore stamp identically, which is
    -- correct: they are one decision.
    NEW.group_joined_at := now();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION stamp_participation_group_joined_at(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.stamp_participation_group_joined_at() IS 'Trigger function: keep participations.group_joined_at in step with group_id. Sets it to now() when a seat enters a group or moves to a different one, clears it when the seat leaves a group (including via the ON DELETE SET NULL cascade from product_groups), and leaves it alone otherwise. The column has no other writer.';


--
-- Name: submit_feedback(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_feedback(p_user_id uuid, p_message text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  -- Advisory lock keyed to user prevents concurrent rate-limit bypass
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT count(*) INTO v_count
  FROM feedback_submissions
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 hour';

  IF v_count >= 6 THEN
    RETURN false;
  END IF;

  INSERT INTO feedback_submissions (user_id, message)
  VALUES (p_user_id, p_message);

  RETURN true;
END;
$$;


--
-- Name: submit_my_feedback(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_my_feedback(p_message text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  -- Not reachable through PostgREST as `authenticated` (that role's JWT always
  -- carries a subject), but an unattributable feedback row is worse than a
  -- refused one, so this fails closed rather than inserting NULL.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_message IS NULL OR length(p_message) < 10 OR length(p_message) > 2000 THEN
    RAISE EXCEPTION 'feedback message must be between 10 and 2000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Returns false (not an error) when the per-hour rate limit is hit; the route
  -- maps that to 429.
  RETURN public.submit_feedback(v_user_id, p_message);
END;
$$;


--
-- Name: FUNCTION submit_my_feedback(p_message text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.submit_my_feedback(p_message text) IS 'Self-scoping feedback submission: writes a feedback_submissions row for auth.uid(), rate-limited and length-bounded. Returns false when rate-limited.';


--
-- Name: trg_refresh_product_seat_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_refresh_product_seat_counts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_product_seat_counts(OLD.product_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_product_seat_counts(NEW.product_id);

  -- An UPDATE that moved a row to a different product needs the old product
  -- recomputed too (theoretical — product_id doesn't change in practice,
  -- but the trigger covers it anyway).
  IF TG_OP = 'UPDATE' AND OLD.product_id <> NEW.product_id THEN
    PERFORM public.refresh_product_seat_counts(OLD.product_id);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_seed_product_seat_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_seed_product_seat_counts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.product_seat_counts (
    product_id, active_count, waitlist_count
  ) VALUES (NEW.id, 0, 0)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_locales       TEXT[];
  v_material_url  TEXT := NULLIF(btrim(COALESCE(p_material_url, '')), '');
BEGIN
  PERFORM public.assert_admin();

  -- The product gate lock, taken where the existence probe used to be: this
  -- function now deletes from the product's roster, so it serializes against
  -- the participation RPCs that write it (join_waitlist et al) exactly as they
  -- serialize against each other. FOUND is set by PERFORM, so the not-found
  -- error is unchanged in code and position.
  PERFORM 1 FROM public.products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every editable column is assigned on every call, which is why a new column
  -- has to reach this statement in the same change that adds it — a column this
  -- function does not know about is nulled by the next admin edit. `tag` is the
  -- one 00178 added, and it is the case that shows why the rule needs stating:
  -- its parameter is defaulted, so an omitting caller clears the tag silently
  -- and legally. That is the intended way to clear one; what stops it happening
  -- by accident is the wire schema demanding the field on every update.
  -- `region_lock_country` (00193) is the same shape for the same reasons, and a
  -- region lock is editable for a product's whole life on purpose: it gates
  -- future enrolments only and never revisits an existing seat.
  --
  -- `image_path` is the one editable-looking column this statement must NOT
  -- name, and 00198 removed the assignment along with the parameter that fed
  -- it. It is derived from image_id by trg_products_apply_image_path, which
  -- runs on this very UPDATE; assigning it here only ever wrote a value the
  -- trigger overwrote a moment later.
  UPDATE public.products SET
    billing_mode             = p_billing_mode,
    topic                    = p_topic,
    min_age                  = p_min_age,
    max_age                  = p_max_age,
    for_gamers               = p_for_gamers,
    for_parents              = p_for_parents,
    tag                      = p_tag,
    region_lock_country      = p_region_lock_country,
    spoken_language_code     = p_spoken_language_code,
    location_id              = p_location_id,
    is_remote                = p_is_remote,
    signup_threshold         = p_signup_threshold,
    start_date               = p_start_date,
    end_date                 = p_end_date,
    timezone                 = p_timezone,
    seat_count               = p_seat_count,
    waitlist_enabled         = p_waitlist_enabled,
    registration_opens_at    = p_registration_opens_at,
    is_visible               = p_is_visible,
    primary_gedu_fee_cents   = p_primary_gedu_fee_cents,
    assistant_gedu_fee_cents = p_assistant_gedu_fee_cents,
    municipality_fee_cents   = p_municipality_fee_cents
  WHERE id = p_id;

  -- A product with no waitlist holds no queue. The admin form turns the flag
  -- off two ways — unticking the box, or choosing Unlimited seats, which
  -- derives it false — and the groups panel draws its waitlist column only
  -- while the flag is on, so anything left queued here would be invisible to
  -- every affordance that could promote or remove it. Deleting is the clean
  -- answer rather than the harsh one: the edit that got us here means the
  -- product has seats open, so a dropped family can re-enter through the front
  -- door and land in a BETTER state than the queue they were in (free products
  -- re-enroll instantly; paid ones check out, which is what creates the
  -- subscription a promotion could never have created for them). Promoting
  -- them here instead would grant a free seat on a subscription-billed club.
  --
  -- This is silent by owner decision: no confirmation, no warning, no email.
  -- The triggering edit is expected to be accidental, and the families are told
  -- nothing — a known, accepted impact, recorded here because it is the kind of
  -- thing a future reader will assume was an oversight.
  --
  -- Keyed to the flag's VALUE, not to it changing, so the same statement heals
  -- a queue stranded by an edit made before this rule existed: the next save of
  -- anything at all on the product clears it.
  --
  -- THE CARVE-OUT: never delete a row that carries a LIVE subscription
  -- (00170's predicate — a family_subscriptions row with status <>
  -- 'cancelled'; a dunning-dead one is not live and does not protect the row).
  -- The FK is ON DELETE CASCADE, so dropping such a row would delete our only
  -- record of a subscription Stripe keeps billing — the exact hazard
  -- demote_to_waitlist and admin_remove_participation refuse for. A waitlisted
  -- row with a live subscription is a webhook-race ghost (a demote landing
  -- between Checkout completing and the webhook's insert, or a manual
  -- sub-adoption), effectively unreachable, and it is skipped in silence:
  -- there is no surface here to report it on, and refusing the whole product
  -- edit over a row nobody can see would be worse than leaving it queued.
  IF NOT p_waitlist_enabled THEN
    DELETE FROM public.participations p
     WHERE p.product_id = p_id
       AND p.status = 'waitlisted'
       AND NOT EXISTS (
         SELECT 1
           FROM public.family_subscriptions fs
          WHERE fs.participation_id = p.id
            AND fs.status <> 'cancelled'
       );
  END IF;

  -- Cleared means the row goes, so "no lesson material" stays the absence of a
  -- record rather than becoming a row holding NULL.
  IF v_material_url IS NULL THEN
    DELETE FROM public.product_staff_details WHERE product_id = p_id;
  ELSE
    INSERT INTO public.product_staff_details (product_id, material_url)
    VALUES (p_id, v_material_url)
    ON CONFLICT (product_id) DO UPDATE
      SET material_url = EXCLUDED.material_url;
  END IF;

  -- product_translations — UPSERT new set, then DELETE leftovers (the
  -- "≥1 row remains" trigger passes because the new rows are already in
  -- place before any delete fires).
  v_locales := ARRAY[]::TEXT[];

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      p_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      v_translation->>'long_description'
    )
    ON CONFLICT (product_id, locale) DO UPDATE SET
      name              = EXCLUDED.name,
      short_description = EXCLUDED.short_description,
      long_description  = EXCLUDED.long_description,
      updated_at        = NOW();

    v_locales := array_append(v_locales, v_translation->>'locale');
  END LOOP;

  DELETE FROM public.product_translations
  WHERE product_id = p_id
    AND locale <> ALL (v_locales);

  -- schedule_slots — wipe and replace.
  DELETE FROM public.schedule_slots WHERE product_id = p_id;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        p_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  -- product_prices — wipe and replace.
  DELETE FROM public.product_prices WHERE product_id = p_id;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_cents
      )
      VALUES (
        p_id,
        v_price->>'currency',
        (v_price->>'price_cents')::INTEGER
      );
    END LOOP;
  END IF;

  -- product_holiday_calendars — wipe and replace.
  DELETE FROM public.product_holiday_calendars WHERE product_id = p_id;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT p_id, unnest(p_holiday_calendar_ids);
  END IF;

  -- product_required_consents — wipe and replace (00210), through the join
  -- table's single guarded writer. NULL clears the set, which is the only
  -- expressible way to clear one and is why the wire schema demands the field
  -- on every update. Existing consent_acceptances are untouched: dropping a
  -- requirement changes what FUTURE enrolments must agree to and says nothing
  -- about what past ones did agree to.
  PERFORM public.set_product_required_consents(p_id, p_required_consent_slugs);

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]) IS 'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, holiday calendars, the staff-only material link and — since 00210 — the set of consent documents enrolling on it requires, under the product gate lock. Since 00171 it also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so it also heals a queue stranded before the rule existed. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'', 00170''s predicate) is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER since 00171 — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. Since 00173 it assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. Since 00178 it also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. Since 00193 it assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested. Since 00198 it does NOT assign image_path and takes no p_image_path: that column is derived from image_id by trg_products_apply_image_path on this very UPDATE, so the assignment was always overwritten a moment later. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone. Since 00210 p_required_consent_slugs replaces the requirement set through set_product_required_consents — NULL clears it, and past acceptances are never touched, because dropping a requirement changes what future enrolments must agree to and says nothing about what past ones did.';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: validate_gedu_assignment_product(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_gedu_assignment_product() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_group_product_id UUID;
BEGIN
  SELECT product_id INTO v_group_product_id
    FROM public.product_groups
    WHERE id = NEW.group_id;

  IF v_group_product_id IS NULL THEN
    RAISE EXCEPTION 'group_id % does not exist', NEW.group_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.product_id IS NULL THEN
    NEW.product_id := v_group_product_id;
  ELSIF NEW.product_id <> v_group_product_id THEN
    RAISE EXCEPTION 'gedu_group_assignments.product_id % does not match group %''s product_id %',
      NEW.product_id, NEW.group_id, v_group_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_parent_gamer_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_parent_gamer_roles() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  parent_role user_role;
  gamer_role user_role;
BEGIN
  SELECT role INTO parent_role FROM profiles WHERE id = NEW.parent_id;
  SELECT role INTO gamer_role FROM profiles WHERE id = NEW.gamer_id;

  IF parent_role != 'customer' THEN
    RAISE EXCEPTION 'Parent must be a customer account, got: %', parent_role;
  END IF;

  IF gamer_role != 'gamer' THEN
    RAISE EXCEPTION 'Child must be a gamer account, got: %', gamer_role;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_participations_group(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_participations_group() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_group_product_id UUID;
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT product_id INTO v_group_product_id
    FROM public.product_groups
    WHERE id = NEW.group_id;

  IF v_group_product_id IS NULL THEN
    RAISE EXCEPTION 'group_id % does not exist', NEW.group_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_group_product_id <> NEW.product_id THEN
    RAISE EXCEPTION 'group_id % belongs to a different product', NEW.group_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_products_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_products_location() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  loc_type public.location_type;
BEGIN
  IF NEW.location_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT type INTO loc_type FROM public.locations WHERE id = NEW.location_id;
  IF loc_type IS NULL THEN
    RAISE EXCEPTION 'location_id % does not exist', NEW.location_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.is_remote = false THEN
    IF loc_type <> 'site' THEN
      RAISE EXCEPTION 'In-person product location must be a site (got %)', loc_type
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.product_type = 'municipality_club' THEN
    IF loc_type NOT IN ('country', 'region', 'municipality') THEN
      RAISE EXCEPTION 'Online municipality club location must be country/region/municipality (got %)', loc_type
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_profile_spoken_languages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_profile_spoken_languages() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF array_length(NEW.spoken_languages, 1) IS NOT NULL THEN
    -- Membership is the column type's job since 00199. Uniqueness is not:
    -- public.spoken_language[] is perfectly happy to hold ARRAY['fi','fi'],
    -- and every reader of this column treats it as a set.
    IF (SELECT count(DISTINCT v) FROM unnest(NEW.spoken_languages) v)
       < array_length(NEW.spoken_languages, 1) THEN
      RAISE EXCEPTION 'Duplicate language codes are not allowed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_profile_spoken_languages(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_profile_spoken_languages() IS 'BEFORE INSERT OR UPDATE OF profiles.spoken_languages. Its only remaining rule is that no language appears twice — public.spoken_language decides which values are legal, and did so from 00199. It stays a trigger rather than a CHECK on purpose: EXECUTE on a trigger function is checked when the trigger is created, so this never needs a grant to authenticated, and therefore never needs a classification in the authorization spine, for a rule no caller has any business invoking.';


--
-- Name: validate_site_details_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_site_details_location() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  loc_type public.location_type;
BEGIN
  SELECT type INTO loc_type FROM public.locations WHERE id = NEW.location_id;
  IF loc_type IS NULL THEN
    RAISE EXCEPTION 'location_id % does not exist', NEW.location_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF loc_type <> 'site' THEN
    RAISE EXCEPTION 'site detail rows are only valid for type=site (got %)', loc_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: verify_my_pin(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_my_pin(p_pin text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select coalesce(
    (select pin_hash = crypt(p_pin, pin_hash)
       from customer_profiles
      where user_id = auth.uid()),
    false
  );
$$;


--
-- Name: calendar_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_holidays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    calendar_id uuid NOT NULL,
    date date NOT NULL,
    reason text
);


--
-- Name: consent_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    document_slug text NOT NULL,
    document_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_by uuid NOT NULL
);


--
-- Name: TABLE consent_acceptances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.consent_acceptances IS 'One row per (enrolment, required document): the whole of what the platform records about a parent agreeing to a product''s enrolment conditions. INSERT-ONLY — nothing updates or deletes a row here, and no Data API role holds a write grant, because every field a forger would want is stamped server-side by record_required_consents, which is the only writer and is reachable only from inside create_participation and join_waitlist. DELIBERATELY carries no unique constraint: enrolling a second child, or leaving and re-joining a term later, each produce fresh rows, and those are history rather than duplicates — a constraint would make the second enrolment silently inherit the first one''s agreement. These consents are NON-REVOCABLE enrolment conditions and are not the (future, separate) revocable marketing/media consent system; there is no revoked_at column and there must never be one on this table.';


--
-- Name: COLUMN consent_acceptances.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.customer_id IS 'The adult who agreed — the purchasing customer, taken from the enrolment in hand rather than from anything the caller supplied separately. Same FK and same cascade as participations.customer_id.';


--
-- Name: COLUMN consent_acceptances.participant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.participant_id IS 'Whose seat the agreement conditions: the child being enrolled, or the adult themselves on a product whose audience admits parents (participant_id = customer_id is what a self seat looks like, exactly as on participations).';


--
-- Name: COLUMN consent_acceptances.product_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.product_id IS 'The product enrolled onto. ON DELETE CASCADE, matching participations: a deleted product takes its seats with it, and an agreement to conditions of an enrolment that no longer exists conditions nothing.';


--
-- Name: COLUMN consent_acceptances.document_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.document_version IS 'The version that was CURRENT for this slug at the moment of enrolment, resolved server-side — never supplied by a caller. Together with document_slug it is a foreign key into consent_document_versions, so a row can only ever name a document the platform actually published.';


--
-- Name: COLUMN consent_acceptances.accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.accepted_at IS 'When the agreement was recorded, stamped by the server. A client never supplies it — a timestamp the agreeing party chooses proves nothing about when they agreed.';


--
-- Name: COLUMN consent_acceptances.accepted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.accepted_by IS 'The profile that PERFORMED the consent act — a different question from customer_id, which names the adult the agreement binds. On both family paths they are the same id, because the parent ticked the boxes themselves; on the admin comp-enrolment path (00212) this is the acting admin''s own profile while customer_id stays the family''s, so a staff-made record can never be read back as a parent''s own click. Taken from auth.uid() on that path and from the enrolment in hand on the others — never from a caller argument. No cascade on the FK, matching products.created_by: the profile that made a legal record is part of it, so it cannot be hard-deleted while the record stands; the family''s own removal runs through customer_id, which does cascade.';


--
-- Name: consent_document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_document_versions (
    document_slug text NOT NULL,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_consent_document_versions_version_not_empty CHECK ((btrim(version) <> ''::text))
);


--
-- Name: TABLE consent_document_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.consent_document_versions IS 'One row per published revision of a consent document. Rows arrive by MIGRATION only — no Data API role holds a write grant — because a version is a document that was published, not a value an app invents. The CURRENT version OF A SLUG is the row with the greatest created_at for that slug, the same derivation gedu_contract_versions uses (00201), and that is the version an enrolment records. Publishing a new revision is therefore one INSERT and touches no product: existing acceptances go on naming the version that was live when they were made, which is the whole point of storing a version rather than a boolean.';


--
-- Name: COLUMN consent_document_versions.document_slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_document_versions.document_slug IS 'Which document this is a revision of. ON DELETE CASCADE only because a slug that is gone has no revisions; nothing deletes one today.';


--
-- Name: COLUMN consent_document_versions.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_document_versions.version IS 'The version label as the published document carries it — the date under "Last updated" on the page a parent reads. The value consent_acceptances stores.';


--
-- Name: COLUMN consent_document_versions.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_document_versions.created_at IS 'When this revision was added to the platform. Ordering key and nothing else: the greatest created_at for a slug IS that document''s current version, which is the one question anything asks of this table.';


--
-- Name: consent_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_documents (
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_consent_documents_slug_not_empty CHECK ((btrim(slug) <> ''::text))
);


--
-- Name: TABLE consent_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.consent_documents IS 'One row per consent DOCUMENT the platform knows about — its identity, not any one revision of its text. A product points at a slug here to say "a parent must agree to this before enrolling", and that pointer survives every republication of the document. Rows arrive by MIGRATION only: there is no write grant for any Data API role, because a document is something that was drafted and published, not a value an app invents. Readable by anon as well as authenticated, because the public shop names a product''s required consents before anybody has signed in.';


--
-- Name: COLUMN consent_documents.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_documents.slug IS 'The document''s stable identifier, e.g. roblox-programme-terms. The primary key, the value product_required_consents points at, and the value consent_acceptances stores alongside a version.';


--
-- Name: COLUMN consent_documents.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_documents.created_at IS 'When this document identity was added to the platform. Not an ordering key for anything — versions carry that — just a record of when the slug started existing.';


--
-- Name: customer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_profiles (
    user_id uuid NOT NULL,
    stripe_customer_id text,
    pin_hash text
);


--
-- Name: family_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    stripe_subscription_id text NOT NULL,
    stripe_customer_id text NOT NULL,
    currency text NOT NULL,
    status text NOT NULL,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    participation_id uuid NOT NULL,
    stripe_price_id text,
    CONSTRAINT family_subscriptions_currency_check CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text]))),
    CONSTRAINT family_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'past_due'::text, 'cancelled'::text, 'incomplete'::text, 'canceling'::text])))
);


--
-- Name: feedback_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gamer_group_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamer_group_notes (
    group_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT chk_gamer_group_notes_length CHECK ((((char_length(note) >= 1) AND (char_length(note) <= 2000)) AND (btrim(note) <> ''::text)))
);


--
-- Name: TABLE gamer_group_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gamer_group_notes IS 'One row per (group, member): what the staff running that group need to know about that person before the session starts. Plain text, not markdown — a note is read in the box it was typed in, and offering headings would invite composing a document rather than jotting. Strictly keyed to the group, so a note does NOT follow a member who is moved: it is about how THIS group is going, and half of them would be stale or actively misleading in the next one. A member who leaves the group leaves their row behind, unreachable from every surface (all of them render the group''s active roster) and refused by the write RPC''s target check — an ACCEPTED leftover, not an oversight, and deliberately not cleaned up. Deleting the GROUP does delete the note, by FK. No Data API role holds a grant on this table and RLS is on with no policy at all: every read rides a roster document or get_group_staff_overlay, every write goes through set_gamer_group_note, and all of those are SECURITY DEFINER. Absence of a row is what "no note" means everywhere. One further consequence of the retention, also reviewed and accepted: a member who leaves and later RETURNS to the group silently regains their old row, and every surface presents it as current — the note dialog names its writer but not its date. Dating the edit line is the known follow-up if months-old guidance resurfacing this way ever misleads in practice.';


--
-- Name: COLUMN gamer_group_notes.group_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_group_notes.group_id IS 'The group the note is filed under. ON DELETE CASCADE — a note belongs to the group, so deleting the group deletes it. This is the one orphan case that IS cleaned up, and the FK is what cleans it.';


--
-- Name: COLUMN gamer_group_notes.participant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_group_notes.participant_id IS 'The person the note is about — whoever holds the seat, adult or child, the same subject participations.participant_id names. References profiles rather than participations so a seat rewritten in place does not take the note with it; membership is asserted by the write RPC''s target check instead.';


--
-- Name: COLUMN gamer_group_notes.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_group_notes.updated_by IS 'Who last wrote it, surfaced to other staff as "Last edited by {first name}". ON DELETE SET NULL: a departed gedu''s account must not delete the note they wrote — the note stands and the read simply shows no editor line. There is no history here; only the last editor is stored.';


--
-- Name: gamer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamer_profiles (
    user_id uuid NOT NULL,
    date_of_birth date NOT NULL,
    gender public.gender_type,
    CONSTRAINT gamer_profiles_date_of_birth_check CHECK ((date_of_birth <= CURRENT_DATE))
);


--
-- Name: gedu_contract_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_contract_acceptances (
    gedu_id uuid NOT NULL,
    contract_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    signed_name text NOT NULL,
    CONSTRAINT chk_gedu_contract_acceptances_signed_name_not_empty CHECK ((btrim(signed_name) <> ''::text))
);


--
-- Name: TABLE gedu_contract_acceptances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gedu_contract_acceptances IS 'One row per (gedu, contract version) accepted: the whole of what the platform records about a gedu agreeing to the contract. The primary key is what makes acceptance idempotent — a gedu accepting the same version twice is the same fact, not a second one — and version-keyed, so a new version leaves the old row standing and re-prompts. Because the version string carries its language, a gedu who signed both texts of one version holds two rows: two signatures on one agreement, not a contradiction, and either alone makes them current. Carries no write grant for any Data API role: every field a forger would want is stamped server-side by accept_gedu_contract, which is the only way in, the same arrangement gedu_profiles and set_gedu_certified have. Acceptance gates NOTHING — admin certification is the only blocking lever over an educator; this table informs that decision and does not pre-empt it.';


--
-- Name: COLUMN gedu_contract_acceptances.gedu_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_acceptances.gedu_id IS 'The educator who accepted. References gedu_profiles rather than profiles because only a gedu has a contract to accept, so the FK states that rather than leaving it to the RPC alone. ON DELETE CASCADE: an account that is gone has no contract standing.';


--
-- Name: COLUMN gedu_contract_acceptances.contract_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_acceptances.contract_version IS 'Which version was accepted, FK into the whitelist, stored and displayed as the full encoded <base>/<language> string — the language is half of what was signed and the record would be incomplete without it. Not free text: the version decides whether the gedu is re-prompted, so a value the platform does not know about would be unanswerable rather than merely wrong. Re-prompting compares the BASE, so a gedu who signed the Finnish text stands as current against the English one — both ARE the current version.';


--
-- Name: COLUMN gedu_contract_acceptances.accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_acceptances.accepted_at IS 'When the acceptance was recorded, stamped by the server inside accept_gedu_contract. A client never supplies it — a timestamp the signer chooses proves nothing about when they signed.';


--
-- Name: COLUMN gedu_contract_acceptances.signed_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_acceptances.signed_name IS 'The signer''s full name AS IT STOOD when they signed, snapshotted from profiles by the RPC. Deliberately not a join: a profile name is editable by its owner, so resolving it at read time would answer what this person is called today when the question is who signed this. It is the identity half of the legal record and must not drift.';


--
-- Name: gedu_contract_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_contract_versions (
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_gedu_contract_versions_version_not_empty CHECK ((btrim(version) <> ''::text))
);


--
-- Name: TABLE gedu_contract_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gedu_contract_versions IS 'Every version of the gedu contract (Pelikasvattajan sopimusehdot) the platform knows about, one row per version PER LANGUAGE — the languages of one version are the same agreement published twice and equally binding, so they share a base label and a created_at and differ only in the suffix. Rows arrive by MIGRATION only — there is no write grant for any Data API role — because a version is a document that was drafted and published, not a value an app invents. The CURRENT version is the BASE of the row with the greatest created_at, and that derivation is what makes acceptance version-keyed: a gedu whose accepted base is not the current one is re-prompted, and one who signed either language of the current version is not. Readable by every signed-in role, because a gedu needs to know what they are signing and an admin needs to know what "current" means.';


--
-- Name: COLUMN gedu_contract_versions.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_versions.version IS 'The version label, encoded as <base>/<language>: the label the document itself carries, a slash, and the code of the language that text is written in — e.g. 2026-2027/fi, 2026-2027/en. The primary key, and the value gedu_contract_acceptances stores verbatim, because which of the two equally binding texts a gedu read is part of what they signed. Anything asking whether a gedu is CURRENT compares the base alone (split_part(version, ''/'', 1)); anything displaying what they signed shows the whole string.';


--
-- Name: COLUMN gedu_contract_versions.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_versions.created_at IS 'When this version was added to the platform. Ordering key and nothing else: the greatest created_at names the current version, whose BASE is what "current" means. Every language of one version carries the same created_at, set from the moment that version was published rather than re-read per row — so the ordering picks a version and never a language, and a tie between the two texts is not a tie anything has to break.';


--
-- Name: gedu_group_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_group_assignments (
    group_id uuid NOT NULL,
    gedu_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gedu_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_locations (
    gedu_id uuid NOT NULL,
    location_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gedu_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_profiles (
    user_id uuid NOT NULL,
    certified boolean DEFAULT false NOT NULL,
    certified_at timestamp with time zone,
    certified_by uuid,
    criminal_record_check_passed boolean DEFAULT false NOT NULL,
    criminal_record_check_at timestamp with time zone,
    criminal_record_check_by uuid,
    CONSTRAINT gedu_profiles_criminal_record_check_stamp_matches_flag CHECK (((criminal_record_check_at IS NOT NULL) = criminal_record_check_passed))
);


--
-- Name: COLUMN gedu_profiles.certified; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_profiles.certified IS 'Whether an admin has vouched for this educator. Gates two things and nothing else: group assignment (UI-only, because assignment is admin-driven) and instant-voice-room moderation (server-side, because it is gedu-initiated). An uncertified gedu still has broad platform access by design. Distinct from profiles.email_verified_at, which is about an address rather than a person; this column was called "verified" until 00187.';


--
-- Name: COLUMN gedu_profiles.certified_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_profiles.certified_by IS 'The admin whose call this was, or NULL — either because the gedu is not certified, or because they predate the feature and were backfilled as trusted. ON DELETE SET NULL: losing the certifying admin''s account must never silently de-certify a working educator.';


--
-- Name: COLUMN gedu_profiles.criminal_record_check_passed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_profiles.criminal_record_check_passed IS 'Whether an admin has seen an acceptable criminal record extract (rikostaustaote) for this educator. The DOCUMENT IS NEVER STORED: Finnish law 504/2002 has the person obtain the extract themselves and permits the employer to record only that it was presented and when, so this flag plus criminal_record_check_at is the whole of what the platform may hold. Gates NOTHING — exactly like contract acceptance, it informs the certification decision and does not pre-empt it; admin certification remains the only blocking lever over an educator. false covers both "not recorded yet" and "recorded as not passing", which are the same operational state.';


--
-- Name: COLUMN gedu_profiles.criminal_record_check_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_profiles.criminal_record_check_at IS 'When the extract was presented, stamped server-side by set_gedu_criminal_record_check and NULL whenever the flag is false. It is the second half of what the law allows us to record, and a client never supplies it — a moment the subject could choose would prove nothing about when anybody saw anything.';


--
-- Name: COLUMN gedu_profiles.criminal_record_check_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_profiles.criminal_record_check_by IS 'The admin whose statement this was, stamped alongside criminal_record_check_at by set_gedu_criminal_record_check and NULL whenever the flag is false. Rendered on the admin user-detail card — the recording admin''s name beside the date, exactly like certified_by — and nowhere else; the gedu-facing surfaces read only the flag and the moment from their own row, so an educator is never shown who looked at their document. Unforgeable regardless of who reads it: the table carries no write grant for any Data API role and the RPC derives this from the calling session. ON DELETE SET NULL, so a departed admin leaves the check recorded without the name; losing an account must never silently unrecord a check that was made.';


--
-- Name: CONSTRAINT gedu_profiles_criminal_record_check_stamp_matches_flag ON gedu_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT gedu_profiles_criminal_record_check_stamp_matches_flag ON public.gedu_profiles IS 'The criminal record check''s moment is non-NULL exactly when its flag is true. Asserted in prose by 00213 and relied on by two admin surfaces that read different halves of it — the dashboard''s certification queue ships only criminal_record_check_at and reads NULL as "no check", while the users list reads only criminal_record_check_passed — so a disagreeing row would have the two describing the same educator differently. Nothing reachable can write one without the other (no write grant on the table; one RPC sets both in a single statement), which is why this fires only against a migration, a backfill or a hand-run UPDATE, and why failing loudly there is the whole of its job. criminal_record_check_by is deliberately outside it: ON DELETE SET NULL means a departed admin leaves a recorded check without a name, and that is correct.';


--
-- Name: group_session_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_session_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT chk_group_session_images_height CHECK (((height > 0) AND (height <= 4096))),
    CONSTRAINT chk_group_session_images_width CHECK (((width > 0) AND (width <= 4096)))
);


--
-- Name: TABLE group_session_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.group_session_images IS 'The photos attached to one session''s report — mostly in-game screenshots. One row per upload, and the row''s id is also the object''s name in the public `session-images` bucket (`<id>.jpg`), which is why there is no path column: it would restate the primary key. The name is a random UUID rather than a content hash on purpose — the unguessable name IS the access control (see the migration header''s unlisted-not-private model), and per-upload identity means deleting one report''s photo can never collide with another report that attached identical bytes. Dedup is a non-goal. RLS on with ZERO policies and no grant to `authenticated`: the same posture group_sessions itself carries, so the two RPCs below are the only way in and a grant added by accident still fails closed. A photo lives exactly as long as its report — removed by a gedu or an admin, or CASCADEd away when the session row goes — and there is no timer, no reaper and no scheduled job.';


--
-- Name: COLUMN group_session_images.width; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_session_images.width IS 'The stored image''s pixel width, claimed by the uploading client and bounded here. All gallery and email geometry is arithmetic from this and `height` — never measured — which is what lets server HTML and first client paint agree and keeps a mail laying out correctly with every image blocked. The CHECK''s 4096 is a SANITY ceiling, deliberately looser than the client''s ~2048 px edge cap and not derived from it: the uploader is an assigned staff member, the value feeds layout alone, and the worst a wrong one produces is a mis-sized box in that group''s own mail.';


--
-- Name: COLUMN group_session_images.height; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_session_images.height IS 'The stored image''s pixel height. See `width` — the same claim, the same sanity ceiling, and the same reason both are trusted after a bound check rather than re-derived by parsing the JPEG server-side.';


--
-- Name: COLUMN group_session_images.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_session_images.created_by IS 'Who uploaded this photo. AUDIT ONLY, and specifically for safeguarding: these are pictures concerning children and "who put this here" must be answerable. It gates nothing — removal is role-based, matching how the report itself is edited — and it appears on no feed. The exact mirror of group_sessions.report_emailed_by, ON DELETE SET NULL included, so a departed gedu leaves the upload recorded without the name.';


--
-- Name: COLUMN group_session_images.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_session_images.created_at IS 'When the photo was attached, and the DISPLAY ORDER key: every renderer orders by (created_at, id). Stamped with clock_timestamp() rather than now() because the insert runs under the session row''s lock, where a transaction-start stamp can tie or invert against lock-acquisition order; the id is the sub-tick tiebreaker.';


--
-- Name: group_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    session_date date NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    report text,
    gedu_note text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    report_emailed_at timestamp with time zone,
    report_emailed_by uuid,
    CONSTRAINT chk_group_sessions_ends_after_starts CHECK ((ends_at > starts_at))
);


--
-- Name: TABLE group_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.group_sessions IS 'Lazily materialized session records: one row per (group, product-local date), written only when a report, a note or an attendance mark needs somewhere to live. starts_at/ends_at are a snapshot of the schedule at materialization and are never re-derived.';


--
-- Name: COLUMN group_sessions.report_emailed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_sessions.report_emailed_at IS 'When this session''s report was emailed to the group''s families, and NULL until it has been — the AT-MOST-ONCE MARKER for that mail. Set by claim_group_session_report_email before any mail is composed, which is what makes two concurrent sends impossible; cleared again only by the route, and only when EVERY send failed and therefore no family received anything. A partial failure keeps it set on purpose. Never cleared by an edit to the report: there is no resend, and a gedu fixing a typo afterwards does not get to mail the families a second version.';


--
-- Name: COLUMN group_sessions.report_emailed_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_sessions.report_emailed_by IS 'The gedu whose click sent the report, stamped alongside report_emailed_at. Audit only — it is on neither feed and nothing renders it; the card''s author chip reads updated_by. ON DELETE SET NULL, so a departed gedu leaves the send recorded without the name.';


--
-- Name: holiday_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holiday_calendars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    timezone text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type public.location_type NOT NULL,
    parent_id uuid,
    country_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name_i18n jsonb,
    external_code text,
    search_blob text GENERATED ALWAYS AS (public.location_search_blob(name, name_i18n, external_code)) STORED,
    geonames_id bigint,
    retired_at timestamp with time zone,
    depth smallint DEFAULT 0 NOT NULL,
    CONSTRAINT locations_no_self_parent CHECK ((parent_id IS DISTINCT FROM id))
);


--
-- Name: COLUMN locations.name_i18n; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.name_i18n IS 'Locale -> display-name overrides (e.g. {"sv":"Helsingfors"}). Resolve as name_i18n[locale] ?? name. `name` holds the canonical native-language name and is never duplicated here.';


--
-- Name: COLUMN locations.external_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.external_code IS 'Official statistical code for this location in its national classification: INSEE Code officiel géographique code for FR rows (région / département / commune), Statistics Finland region (maakunta) or municipality (kunta) code for FI rows. NULL on admin-created sites, which exist in no national classification. Unique per (country_code, type) — France reuses the same code across levels.';


--
-- Name: COLUMN locations.search_blob; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.search_blob IS 'Derived, never written: the row''s folded searchable terms, separator-delimited. Read only by public.search_locations; it is present in select(*) responses and carries no information the other columns do not.';


--
-- Name: COLUMN locations.geonames_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.geonames_id IS 'GeoNames geonameid for a row sourced from the GeoNames dumps: the dedupe key for ingestion and sync, unique where present. NULL on admin-created sites and on config-declared synthetic rows GeoNames models no administrative record for. Never holds an official statistical code — that is external_code, and the two are separate columns on purpose.';


--
-- Name: COLUMN locations.retired_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.retired_at IS 'When a refresh found this place gone upstream. Retired rows are hidden from browse reads, the search function and the municipality directory, but keyed reads still return them and the ancestor walk still climbs through them: every existing FK, coverage claim and rendered chain has to keep working. Refresh never DELETEs a location row — gedu_locations cascades — so this is the only way a place leaves the pickers.';


--
-- Name: COLUMN locations.depth; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.depth IS 'Distance from the root: 0 for a country row, parent.depth + 1 below. Maintained by trg_set_location_depth and never written by hand; the DEFAULT exists so the column stays optional in the generated Insert type. Search ranks broadest-first on this rather than on the location_type enum, whose declared order is wrong for any country that nests district below municipality.';


--
-- Name: marketing_consent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_consent_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    consent_type public.marketing_consent_type NOT NULL,
    granted boolean NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_marketing_consent_events_source CHECK ((source = ANY (ARRAY['registration'::text, 'settings'::text, 'enrolment'::text])))
);


--
-- Name: TABLE marketing_consent_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_consent_events IS 'APPEND-ONLY history: one row per CHANGE to a marketing consent, and the evidence behind whatever marketing_consents currently says. Nothing updates or deletes a row here — no Data API role holds any write grant at all, and the only writers are set_marketing_consent and the register route''s service-role client — because an event is a statement that something happened at an instant, and editing one would destroy the only thing the table is for. A repeat submission that changes nothing appends nothing: a log of "changes" that recorded non-changes would answer "how often did this parent change their mind" with a number made of page loads. Rows carry NO unique constraint — granting, revoking and granting again is the ordinary life of a revocable consent, and those three rows are history rather than duplicates.';


--
-- Name: COLUMN marketing_consent_events.granted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consent_events.granted IS 'The state that was SET by this event, not the delta. Reading the log as a sequence of states is what makes a row meaningful on its own, and it is what lets the current-state table be reconstructed from the log if it ever has to be audited against it.';


--
-- Name: COLUMN marketing_consent_events.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consent_events.source IS 'Which surface the answer came from: `registration` (the checkbox on the parent sign-up form), `settings` (the toggle on their own account page), or `enrolment` (the ask inside a product signup panel). This is the one field on an event that no other field can corroborate, which is why set_marketing_consent REFUSES `registration`: that source is written only by the register route through the service-role client, before the account has a session at all, so a value a client could send would be a provenance claim nothing checks. A CHECK rather than an enum because the set is a list of our own surfaces, which move with the product rather than with the data model.';


--
-- Name: COLUMN marketing_consent_events.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consent_events.created_at IS 'When the answer was given, stamped by the server. A client never supplies it — a timestamp the consenting party chooses proves nothing about when they consented.';


--
-- Name: marketing_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_consents (
    customer_id uuid NOT NULL,
    consent_type public.marketing_consent_type NOT NULL,
    granted boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE marketing_consents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_consents IS 'The CURRENT answer to "may we mail this parent about this thing" — one row per (customer, consent type), and the row every send reads. Deliberately not derived from marketing_consent_events: a send must not fold a history to learn whether it may run, and the present tense must not depend on a log a retention policy could one day trim. An ABSENT row means never asked or never answered, which is not the same as `granted = false` (a parent who said no) — both are "do not mail", and only one of them is a decision the parent made. Account-level on purpose: the subject of a marketing consent is a mailbox, and a mailbox belongs to one adult rather than to one seat, which is the exact inverse of consent_acceptances (00210) and its per-enrolment key. REVOCABLE by construction — that is what makes this a separate system from the non-revocable enrolment conditions, per 00210''s own mandate. Written by set_marketing_consent and by the register route''s service-role client and by nothing else: no Data API role holds a write grant.';


--
-- Name: COLUMN marketing_consents.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consents.customer_id IS 'The adult who holds the permission, always a profile with role `customer`. Gamers and gedus hold none — a child''s synthetic address reaches nobody, and a gedu''s relationship with us is a contract (00201) rather than a mailing list — and the RPC''s role guard is what enforces that rather than a CHECK, because a role is a mutable property of a profile and a CHECK would freeze it at insert time. ON DELETE CASCADE: a permission to mail somebody who no longer exists is not a record worth keeping, and the audit trail cascades with them for the same reason.';


--
-- Name: COLUMN marketing_consents.granted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consents.granted IS 'True means we may mail; false means the parent said no. NOT NULL and no third state — "not asked" is the absence of the row, so a NULL here would be a second spelling of a state the primary key already expresses by omission.';


--
-- Name: COLUMN marketing_consents.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consents.updated_at IS 'When this state was last CHANGED, stamped server-side. Not a call counter: set_marketing_consent leaves the row untouched when the submitted state already matches, so this is the moment the parent last actually moved the toggle. The full history is in marketing_consent_events.';


--
-- Name: minecraft_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.minecraft_accounts (
    user_id uuid NOT NULL,
    minecraft_username text,
    minecraft_uuid text
);


--
-- Name: parent_gamer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parent_gamer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    gamer_id uuid NOT NULL,
    relationship text DEFAULT 'parent'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT no_self_link CHECK ((parent_id <> gamer_id))
);


--
-- Name: participations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    group_id uuid,
    participant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    status public.participation_status NOT NULL,
    signed_up_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    waitlisted_at timestamp with time zone,
    stripe_checkout_session_id text,
    group_joined_at timestamp with time zone,
    seat_offer_sent_at timestamp with time zone,
    seat_offer_expiry_notified_at timestamp with time zone,
    CONSTRAINT chk_participations_offer_notice_needs_offer CHECK (((seat_offer_expiry_notified_at IS NULL) OR (seat_offer_sent_at IS NOT NULL))),
    CONSTRAINT chk_participations_offer_only_when_waitlisted CHECK (((seat_offer_sent_at IS NULL) OR (status = 'waitlisted'::public.participation_status))),
    CONSTRAINT chk_participations_waitlisted_has_timestamp CHECK (((status <> 'waitlisted'::public.participation_status) OR (waitlisted_at IS NOT NULL)))
);


--
-- Name: TABLE participations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.participations IS 'One row per seat on a product: who holds it, who pays for it, which group they sit in and what state the seat is in. Some of its columns are settled by triggers rather than by any caller, and are therefore invisible at the call site: updated_at is touched on every write, product_id is reconciled against the group''s product by trg_validate_participations_group, and group_joined_at is stamped by trg_participations_stamp_group_joined_at whenever group_id is set, changed or cleared — group_id has at least five writers, including the ON DELETE SET NULL cascade from product_groups, which is why the stamp lives in a trigger and not in an RPC. Do not set group_joined_at by hand.';


--
-- Name: COLUMN participations.participant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.participant_id IS 'The profile occupying this seat: a gamer enrolled by their parent, or — on a product whose audience admits adults — the paying customer themselves (participant_id = customer_id is what a self seat looks like). The column is named for what it means rather than for any one role that fills it.';


--
-- Name: COLUMN participations.stripe_checkout_session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.stripe_checkout_session_id IS 'Stripe Checkout Session that paid for this seat. NULL for no-charge seats (free, municipality, admin enrollment, waitlist) and for rows predating the create-on-confirmation flow.';


--
-- Name: COLUMN participations.group_joined_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.group_joined_at IS 'When this seat entered its CURRENT group. NULL when the seat holds no group, and NULL for every row that predates the column — there was deliberately no backfill, because a group move leaves no trace and signed_up_at is not a join date for anyone who has ever been moved. A move between two groups of one product RESETS it: the member is new to THAT group, which is the whole claim the newcomer badge makes. Stamped only by trg_participations_stamp_group_joined_at, which is the column''s only writer — no RPC and no policy-driven UPDATE sets it, because group_id has at least five writers (including the ON DELETE SET NULL cascade from product_groups) and a trigger is the only point that sees all of them. A consequence with no undo, accepted for v1: an accidental move on the admin drag board, corrected with a second move back, re-stamps both times — the member reads as new to a group they never really left, for the length of the badge window, and no UI clears the stamp. The mislabel is rare, bounded at 30 days, and its harm is a Gedu welcoming someone they already know; a per-member clear affordance is the known follow-up if it starts to matter.';


--
-- Name: COLUMN participations.seat_offer_sent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.seat_offer_sent_at IS 'When a seat offer was last sent to this waitlisted family, truncated to milliseconds. NULL on every row that has never been offered a seat and on every row whose offer has been answered — accepting clears it, declining deletes the row, and re-offering after expiry replaces it. Only ever set on a waitlisted row (chk_participations_offer_only_when_waitlisted), which is what lets every status transition treat "clear the offer" as unconditional. Whether the offer is LIVE is derived from this and nothing else: seat_offer_sent_at + interval ''5 days'' > now(). The millisecond truncation is load-bearing rather than cosmetic — the emailed token is signed over this exact instant and compared back through JavaScript, whose Date cannot represent microseconds.';


--
-- Name: COLUMN participations.seat_offer_expiry_notified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.seat_offer_expiry_notified_at IS 'When staff were emailed that this offer ran out with no answer. Orthogonal to whether the offer is live or expired: it records that a notification happened, not the offer''s standing. Claimed atomically by claim_expired_seat_offer_notifications, whose UPDATE ... WHERE seat_offer_expiry_notified_at IS NULL is what makes the mail exactly-once under concurrency with no lock held across the send. Cleared whenever a fresh offer is stamped, so a re-offer that expires again notifies again.';


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    amount_cents integer NOT NULL,
    currency text NOT NULL,
    purpose public.payment_purpose NOT NULL,
    stripe_payment_intent_id text,
    stripe_invoice_id text,
    stripe_event_id text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT payments_currency_check CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text])))
);


--
-- Name: postal_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.postal_codes (
    country_code text NOT NULL,
    postal_code text NOT NULL,
    location_id uuid NOT NULL
);


--
-- Name: TABLE postal_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.postal_codes IS 'Postal code -> municipality, one row per (country, code, place) fact. An alternative key onto a locations row, never a level of the hierarchy. Nothing references this table, which is what makes a refresh a plain delete-and-reinsert rather than the retire-never-delete discipline locations lives under. Public reference data: anon, authenticated and service_role may SELECT, nobody may write from a client, and rows land through generated data migrations. service_role holds SELECT because search_locations is SECURITY INVOKER, reads this table for its postal match arm, and is executable by that role.';


--
-- Name: COLUMN postal_codes.country_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.postal_codes.country_code IS 'ISO 3166-1 alpha-2, matching the locations row this points at. Part of the key rather than derivable from it because the lookup starts here: a caller has a country and a code and no id yet, and codes are not unique across countries.';


--
-- Name: COLUMN postal_codes.postal_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.postal_codes.postal_code IS 'The code exactly as the upstream source spells it — no normalization, no padding, no case folding. Every seeded country''s codes are fixed-width digits (Finland and France alike), so there is nothing to normalize yet; a country whose codes carry spaces or letters will need that decision made deliberately rather than inherited.';


--
-- Name: COLUMN postal_codes.location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.postal_codes.location_id IS 'The municipality the code reaches. ON DELETE CASCADE, and safe here precisely because nothing references postal rows: losing them costs a lookup, never a coverage claim or a stored pick. Seeds resolve it by joining (country_code, type = ''municipality'', external_code), so a country whose level maps no official code cannot be seeded this way.';


--
-- Name: product_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    public_note text,
    gedu_note text,
    CONSTRAINT chk_product_groups_name_not_blank CHECK ((length(btrim(name)) > 0))
);


--
-- Name: COLUMN product_groups.public_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_groups.public_note IS 'Standing family-facing note about the group. Plain text (rich text for group/site notes is an open question).';


--
-- Name: COLUMN product_groups.gedu_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_groups.gedu_note IS 'Standing gedu + admin note about the group. Never shown to families. Plain text.';


--
-- Name: product_holiday_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_holiday_calendars (
    product_id uuid NOT NULL,
    calendar_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    sha256 text NOT NULL,
    path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_product_images_label_length CHECK (((length(label) >= 1) AND (length(label) <= 120))),
    CONSTRAINT chk_product_images_path_matches_sha256 CHECK ((path ~ (('^'::text || sha256) || '\.(jpg|png|webp|avif|svg)$'::text))),
    CONSTRAINT chk_product_images_path_not_empty CHECK ((path <> ''::text)),
    CONSTRAINT chk_product_images_sha256_is_a_hash CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: TABLE product_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_images IS 'The catalogue of pictures admins pick from for a product. One row per distinct image, identified by the sha256 of its bytes; the object key is <sha256>.<ext> in the public product-images bucket. A row is immutable except for its label — the bytes behind a path never change, which is what makes the image optimizer''s one-year cache floor safe. Admin-only: no anon grant and no anon policy, because nothing family-facing reads this table. Products reference it by products.image_id; products.image_path is derived from it by trg_products_apply_image_path and is what every reader still reads.';


--
-- Name: COLUMN product_images.sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_images.sha256 IS 'Lowercase hex sha256 of the stored bytes. UNIQUE, and that uniqueness IS the dedup mechanism: uploading the same file twice resolves to this row.';


--
-- Name: COLUMN product_images.path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_images.path IS 'Object key in the public product-images bucket, <sha256>.<ext>. Never changes for a given row, and no object is ever overwritten.';


--
-- Name: CONSTRAINT chk_product_images_path_matches_sha256 ON product_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_product_images_path_matches_sha256 ON public.product_images IS 'The object key is the hash plus a stored extension and nothing else. The extension list is the accept list in src/services/product-images/product-images.contracts.ts minus jpeg, which is accepted on upload and normalised to jpg before anything is stored — the two lists must be widened in the same change or an upload the route accepts is a row this constraint refuses after the bytes are already in the bucket. The pattern is built by concatenating the sha256 column into a regex, which is only safe because chk_product_images_sha256_is_a_hash guarantees that column holds no regex metacharacters — relax that constraint and this one silently becomes a wildcard.';


--
-- Name: CONSTRAINT chk_product_images_sha256_is_a_hash ON product_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_product_images_sha256_is_a_hash ON public.product_images IS 'Lowercase hex, exactly 64 characters. The column IS the identity of a picture, so a value that is not a hash is a row that can never be found again by the bytes it claims to name.';


--
-- Name: product_marketing_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_marketing_consents (
    product_id uuid NOT NULL,
    consent_type public.marketing_consent_type NOT NULL
);


--
-- Name: TABLE product_marketing_consents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_marketing_consents IS 'The admin-picked set: which marketing consents a product''s signup panel ASKS a parent about. Empty for almost every product — the Lynx Educate partnership is what this exists for. A row here is an ask and never a requirement: declining is a complete answer and the seat is unaffected, which is the whole line between this table and product_required_consents (00210). Written only by admin_set_product_marketing_consents; no Data API role holds a write grant, so the join table has exactly one writer. Readable through the product''s own read predicate, exactly as product_prices, schedule_slots and product_required_consents are, because the shop has to tell a stranger what signing up would ask them. ON DELETE CASCADE from products: an ask is a property of a product and means nothing without it.';


--
-- Name: COLUMN product_marketing_consents.consent_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_marketing_consents.consent_type IS 'Which permission the panel asks for. The consent itself is account-level, so a parent who already answered on another product is asked once and their existing answer stands — this column decides whether the question is PUT, never where the answer is stored.';


--
-- Name: product_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_prices (
    product_id uuid NOT NULL,
    currency text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price_cents integer NOT NULL,
    CONSTRAINT product_prices_currency_check CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text]))),
    CONSTRAINT product_prices_price_cents_check CHECK ((price_cents >= 0))
);


--
-- Name: product_required_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_required_consents (
    product_id uuid NOT NULL,
    document_slug text NOT NULL
);


--
-- Name: TABLE product_required_consents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_required_consents IS 'The admin-picked set: which consent documents a parent must agree to before enrolling on this product. Empty for almost every product — the Roblox programme is what this exists for. Written only by set_product_required_consents, which create_product and update_product both call; no Data API role holds a write grant, so the join table has exactly one writer. Readable through the product''s own read predicate, exactly as product_prices and schedule_slots are, because the shop has to tell a stranger what enrolling would commit them to. ON DELETE CASCADE from products: a requirement is a property of a product and means nothing without it. NO cascade from consent_documents, deliberately — a slug that products still require must not be deletable out from under them.';


--
-- Name: COLUMN product_required_consents.document_slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_required_consents.document_slug IS 'The DOCUMENT, never a version. Which version a parent actually agreed to is resolved at the moment of enrolment and stored on the acceptance row, so a republished document reaches every product that requires it without a single row changing here.';


--
-- Name: product_seat_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_seat_counts (
    product_id uuid NOT NULL,
    active_count integer DEFAULT 0 NOT NULL,
    waitlist_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_seat_counts_active_count_check CHECK ((active_count >= 0)),
    CONSTRAINT product_seat_counts_waitlist_count_check CHECK ((waitlist_count >= 0))
);


--
-- Name: product_staff_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_staff_details (
    product_id uuid NOT NULL,
    material_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE product_staff_details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_staff_details IS 'Admin + gedu only facts about a product, split off `products` because that table is anon-readable by column selection. One sparse row per product; a product with nothing staff-only recorded has no row. Reached by families through no path at all: admins read and write it under an admin-only RLS policy, gedus see only what get_gedu_group_feed hands them.';


--
-- Name: COLUMN product_staff_details.material_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_staff_details.material_url IS 'Gedu/admin-only lesson-material link, surfaced in the gedu group workspace. Never rendered to parents or gamers.';


--
-- Name: product_subscription_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_subscription_prices (
    product_id uuid NOT NULL,
    currency text NOT NULL,
    stripe_price_id text NOT NULL,
    unit_amount_cents integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_subscription_prices_currency_check CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text]))),
    CONSTRAINT product_subscription_prices_unit_amount_cents_check CHECK ((unit_amount_cents >= 0))
);


--
-- Name: product_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_translations (
    product_id uuid NOT NULL,
    locale text NOT NULL,
    name text NOT NULL,
    short_description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    long_description text,
    CONSTRAINT product_translations_long_description_check CHECK (((long_description IS NULL) OR (btrim(long_description, ' 	
'::text) <> ''::text))),
    CONSTRAINT product_translations_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_type public.product_type NOT NULL,
    billing_mode public.billing_mode NOT NULL,
    min_age integer,
    max_age integer,
    spoken_language_code public.spoken_language NOT NULL,
    image_path text,
    location_id uuid,
    is_remote boolean NOT NULL,
    status public.product_status DEFAULT 'pending'::public.product_status NOT NULL,
    signup_threshold integer,
    start_date date,
    end_date date,
    timezone text NOT NULL,
    seat_count integer,
    waitlist_enabled boolean DEFAULT true NOT NULL,
    registration_opens_at timestamp with time zone NOT NULL,
    is_visible boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    topic public.product_topic NOT NULL,
    primary_gedu_fee_cents integer,
    assistant_gedu_fee_cents integer,
    municipality_fee_cents integer,
    for_gamers boolean DEFAULT true NOT NULL,
    for_parents boolean DEFAULT false NOT NULL,
    tag public.product_tag,
    region_lock_country text,
    image_id uuid,
    CONSTRAINT chk_products_age_range CHECK (((min_age IS NULL) OR (max_age IS NULL) OR (max_age >= min_age))),
    CONSTRAINT chk_products_ages_iff_for_gamers CHECK (
CASE
    WHEN for_gamers THEN ((min_age IS NOT NULL) AND (max_age IS NOT NULL))
    ELSE ((min_age IS NULL) AND (max_age IS NULL))
END),
    CONSTRAINT chk_products_date_range CHECK (((start_date IS NULL) OR (end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT chk_products_event_single_date CHECK (((product_type <> 'event'::public.product_type) OR (NOT (end_date IS DISTINCT FROM start_date)))),
    CONSTRAINT chk_products_external_contract_muni CHECK (((billing_mode <> 'external_contract'::public.billing_mode) OR (product_type = 'municipality_club'::public.product_type))),
    CONSTRAINT chk_products_has_an_audience CHECK ((for_gamers OR for_parents)),
    CONSTRAINT chk_products_in_person_has_location CHECK (((is_remote = true) OR (location_id IS NOT NULL))),
    CONSTRAINT chk_products_municipality_fee_only_for_muni CHECK (((municipality_fee_cents IS NULL) OR (product_type = 'municipality_club'::public.product_type))),
    CONSTRAINT chk_products_non_consumer_has_end_date CHECK (((product_type = 'consumer_club'::public.product_type) OR (end_date IS NOT NULL))),
    CONSTRAINT chk_products_online_muni_has_location CHECK (((NOT ((is_remote = true) AND (product_type = 'municipality_club'::public.product_type))) OR (location_id IS NOT NULL))),
    CONSTRAINT chk_products_online_non_muni_no_location CHECK (((NOT ((is_remote = true) AND (product_type <> 'municipality_club'::public.product_type))) OR (location_id IS NULL))),
    CONSTRAINT chk_products_region_lock_country_shape CHECK (((region_lock_country IS NULL) OR (region_lock_country ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT chk_products_running_has_start_date CHECK (((status <> 'running'::public.product_status) OR (start_date IS NOT NULL))),
    CONSTRAINT chk_products_threshold_within_seat_count CHECK (((signup_threshold IS NULL) OR (seat_count IS NULL) OR (signup_threshold <= seat_count))),
    CONSTRAINT products_assistant_gedu_fee_cents_check CHECK (((assistant_gedu_fee_cents IS NULL) OR (assistant_gedu_fee_cents >= 0))),
    CONSTRAINT products_max_age_check CHECK (((max_age IS NULL) OR (max_age >= 0))),
    CONSTRAINT products_min_age_check CHECK (((min_age IS NULL) OR (min_age >= 0))),
    CONSTRAINT products_municipality_fee_cents_check CHECK (((municipality_fee_cents IS NULL) OR (municipality_fee_cents > 0))),
    CONSTRAINT products_primary_gedu_fee_cents_check CHECK (((primary_gedu_fee_cents IS NULL) OR (primary_gedu_fee_cents >= 0))),
    CONSTRAINT products_seat_count_check CHECK (((seat_count IS NULL) OR (seat_count >= 1))),
    CONSTRAINT products_signup_threshold_check CHECK (((signup_threshold IS NULL) OR (signup_threshold >= 1)))
);


--
-- Name: COLUMN products.image_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.image_path IS 'The object key every reader paints. DERIVED, with no exceptions: trg_products_apply_image_path writes the linked entry''s path on every products write and NULLs the column whenever image_id is NULL, so an app-supplied value is always inert and this column has exactly one writer. It deliberately carries NO foreign key into product_images(path): a second relationship between these two tables makes every PostgREST embed of product_images ambiguous (PGRST201) unless every caller hints it, and the trigger already guarantees what such a key would check. See 00198''s header before adding one.';


--
-- Name: COLUMN products.for_gamers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.for_gamers IS 'Children may occupy a seat on this product. Default true: every product that existed before 00173 is gamers-only, and stays so.';


--
-- Name: COLUMN products.for_parents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.for_parents IS 'Adults may occupy a seat on this product themselves — a parents'' evening, a family outing, a club a parent attends alongside their child. Independent of for_gamers: a product may be for either, or both.';


--
-- Name: COLUMN products.tag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.tag IS 'Optional design tag, NULL meaning untagged. Untagged is the ordinary state and renders nothing anywhere — no chip on the card, no chip on the detail hero, no explanation block — exactly as a gamers-only audience renders no badge. There is no default and no backfill: every product authored before 00178 is untagged because nobody has said otherwise.';


--
-- Name: COLUMN products.region_lock_country; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.region_lock_country IS 'Optional ISO 3166-1 alpha-2 country code this product is locked to; NULL (the state of every row before 00193) means not locked, and is the ordinary case. ENFORCEMENT IS UI-ONLY BY DESIGN: nothing in this database refuses a participation on a locked product. A family''s location is self-attested and editable by them at any time, so a server-side block would check a value the blocked party can rewrite — an obstacle, never a guarantee. The shop''s signup panel reads this column and tells a parent outside the country that the product is not for them; that is the whole mechanism. Two accepted consequences: a determined parent can restate their location and enrol, and a parent who moves after enroling keeps their seat, because the lock gates the enrolment decision and is never re-run against an existing one. The CHECK constrains the shape only (two uppercase letters). WHICH countries may be chosen is the seeded half of SUPPORTED_COUNTRIES in the application config, enforced by the write contract and the admin picker, because that list changes as location rows are seeded and an enum here would both need a migration per country and turn an already-stored lock into a violation the day one is un-seeded. Unrelated to the municipality-club country binding, which constrains a muni club''s location pickers and says nothing about who may enrol.';


--
-- Name: COLUMN products.image_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.image_id IS 'The catalogue entry this product shows, or NULL for no picture. Anon-readable like the rest of products (it is a UUID and reveals nothing), but only admins can resolve it against product_images. Writing it is what changes a product''s picture — image_path is derived and must not be written directly.';


--
-- Name: roblox_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roblox_accounts (
    user_id uuid NOT NULL,
    roblox_username text,
    roblox_user_id bigint
);


--
-- Name: TABLE roblox_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.roblox_accounts IS 'One row per Sogverse account that has given a Roblox handle. Mirrors minecraft_accounts: the row key IS the profile, unlinking clears the columns rather than deleting the row, and two accounts may hold the same Roblox account (siblings share).';


--
-- Name: COLUMN roblox_accounts.roblox_username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roblox_accounts.roblox_username IS 'The handle as Roblox spells it when a lookup confirmed one, or as the person typed it when no lookup could. Never rejected for being taken: a shared account is legitimate.';


--
-- Name: COLUMN roblox_accounts.roblox_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roblox_accounts.roblox_user_id IS 'Roblox''s int64 account id, present only when a lookup confirmed the account — its presence is the whole of "verified". Deliberately NOT unique: siblings sharing one Roblox account across two Sogverse accounts is supported, exactly as it is for Minecraft (00135).';


--
-- Name: schedule_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_time time without time zone NOT NULL,
    duration_minutes integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schedule_slots_duration_minutes_check CHECK ((duration_minutes > 0)),
    CONSTRAINT schedule_slots_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);


--
-- Name: COLUMN schedule_slots.weekday; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schedule_slots.weekday IS '0=Monday .. 6=Sunday (ISO-style, matches products-redesign.md §4.2).';


--
-- Name: session_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    status text NOT NULL,
    recorded_by uuid,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_session_attendance_status CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text])))
);


--
-- Name: TABLE session_attendance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.session_attendance IS 'One row per explicit attendance mark. A roster member with NO row here is unanswered, never absent — the three-state distinction a boolean cannot express. Marks are written one at a time and reverting to unmarked deletes the row, so two gedus marking different children in one session never clobber each other.';


--
-- Name: COLUMN session_attendance.participant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_attendance.participant_id IS 'The profile the mark is about — whoever holds the seat, matching participations.participant_id.';


--
-- Name: site_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_details (
    location_id uuid NOT NULL,
    address text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: site_staff_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_staff_details (
    location_id uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_search_index; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_search_index WITH (security_invoker='true') AS
 SELECT p.id,
    p.email,
    p.email_verified_at,
    p.first_name,
    p.last_name,
    p.role,
    p.phone,
    p.currency,
    p.home_location_id,
    p.referral_code,
    p.locale,
    p.spoken_languages,
    p.created_at,
    p.updated_at,
    concat_ws(' '::text, p.first_name, p.last_name, p.email, p.phone, mc.minecraft_username, rb.roblox_username) AS search_blob
   FROM ((public.profiles p
     LEFT JOIN public.minecraft_accounts mc ON ((mc.user_id = p.id)))
     LEFT JOIN public.roblox_accounts rb ON ((rb.user_id = p.id)));


--
-- Name: VIEW user_search_index; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.user_search_index IS 'Profiles as the admin user search matches them: every profile column, plus search_blob. Read by that one search and nothing else. SECURITY INVOKER, so RLS on profiles, minecraft_accounts and roblox_accounts governs every row exactly as it would a direct read — which also means a role granted SELECT here must hold SELECT on all three. The joins are on those tables'' primary key and so cannot multiply a profile into several rows; the search reads its match total from this view''s row count, so that is asserted rather than assumed. A future game platform is one more LEFT JOIN and one more argument to concat_ws, with no change anywhere outside the database.';


--
-- Name: COLUMN user_search_index.search_blob; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_search_index.search_blob IS 'Every string a person can be found by — name, email, phone, and each game handle — space-joined. Derived, never written, and never selected: the search filters on it and reads the profile columns beside it, so it does not cross the wire. referral_code and email_verified_at are deliberately absent: one labels where a family came from and the other is a date, and neither is a name anyone should be findable by. The phone is the stored digits (E.164 without the +), which is why a needle reduced to its trailing digits matches a number typed either nationally or internationally without the search knowing any dialling rules.';


--
-- Name: verification_email_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_email_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE verification_email_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.verification_email_requests IS 'One row per verification-email send, written only by request_my_verification_email. The rows exist to be counted and nothing else: they protect the shared Brevo quota (whose exhaustion would degrade password-reset delivery) from a button any signed-in caller may press. The RPC prunes the caller''s rows older than an hour as it goes, so the table stays proportional to recent activity with no scheduled job behind it.';


--
-- Name: voice_private_zone_occupants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_private_zone_occupants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    zone_id uuid NOT NULL,
    user_id uuid NOT NULL,
    group_id uuid NOT NULL,
    placed_by uuid NOT NULL,
    session_opens_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.voice_private_zone_occupants REPLICA IDENTITY FULL;


--
-- Name: voice_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text,
    icon text NOT NULL,
    color text NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT voice_zones_name_check CHECK (((name IS NULL) OR ((char_length(name) >= 1) AND (char_length(name) <= 40))))
);

ALTER TABLE ONLY public.voice_zones REPLICA IDENTITY FULL;


--
-- Name: whatsapp_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_contacts (
    phone text NOT NULL,
    wa_name text,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_messages (
    id text NOT NULL,
    phone text NOT NULL,
    direction text NOT NULL,
    body text,
    message_type text DEFAULT 'text'::text NOT NULL,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    status_error text,
    CONSTRAINT whatsapp_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT whatsapp_messages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'received'::text])))
);


--
-- Name: calendar_holidays calendar_holidays_calendar_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_holidays
    ADD CONSTRAINT calendar_holidays_calendar_id_date_key UNIQUE (calendar_id, date);


--
-- Name: calendar_holidays calendar_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_holidays
    ADD CONSTRAINT calendar_holidays_pkey PRIMARY KEY (id);


--
-- Name: consent_acceptances consent_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_pkey PRIMARY KEY (id);


--
-- Name: consent_document_versions consent_document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_document_versions
    ADD CONSTRAINT consent_document_versions_pkey PRIMARY KEY (document_slug, version);


--
-- Name: consent_documents consent_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_documents
    ADD CONSTRAINT consent_documents_pkey PRIMARY KEY (slug);


--
-- Name: customer_profiles customer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: family_subscriptions family_subscriptions_participation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_subscriptions
    ADD CONSTRAINT family_subscriptions_participation_id_key UNIQUE (participation_id);


--
-- Name: family_subscriptions family_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_subscriptions
    ADD CONSTRAINT family_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: family_subscriptions family_subscriptions_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_subscriptions
    ADD CONSTRAINT family_subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);


--
-- Name: feedback_submissions feedback_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_submissions
    ADD CONSTRAINT feedback_submissions_pkey PRIMARY KEY (id);


--
-- Name: gamer_group_notes gamer_group_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_notes
    ADD CONSTRAINT gamer_group_notes_pkey PRIMARY KEY (group_id, participant_id);


--
-- Name: gamer_profiles gamer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_profiles
    ADD CONSTRAINT gamer_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: gedu_contract_acceptances gedu_contract_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_contract_acceptances
    ADD CONSTRAINT gedu_contract_acceptances_pkey PRIMARY KEY (gedu_id, contract_version);


--
-- Name: gedu_contract_versions gedu_contract_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_contract_versions
    ADD CONSTRAINT gedu_contract_versions_pkey PRIMARY KEY (version);


--
-- Name: gedu_group_assignments gedu_group_assignments_gedu_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_gedu_id_product_id_key UNIQUE (gedu_id, product_id);


--
-- Name: gedu_group_assignments gedu_group_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_pkey PRIMARY KEY (group_id, gedu_id);


--
-- Name: gedu_locations gedu_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_locations
    ADD CONSTRAINT gedu_locations_pkey PRIMARY KEY (gedu_id, location_id);


--
-- Name: gedu_profiles gedu_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_profiles
    ADD CONSTRAINT gedu_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: group_session_images group_session_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_session_images
    ADD CONSTRAINT group_session_images_pkey PRIMARY KEY (id);


--
-- Name: group_sessions group_sessions_group_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_group_date_key UNIQUE (group_id, session_date);


--
-- Name: CONSTRAINT group_sessions_group_date_key ON group_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT group_sessions_group_date_key ON public.group_sessions IS 'One session per group per local calendar day — a deliberate architectural bet. It blocks multi-slot days (morning + afternoon camps), which we do not run; in exchange the key survives every schedule edit but a weekday move, and entry ids can be (group_id, session_date). Revisiting multi-slot days means revisiting this constraint.';


--
-- Name: group_sessions group_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_pkey PRIMARY KEY (id);


--
-- Name: holiday_calendars holiday_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holiday_calendars
    ADD CONSTRAINT holiday_calendars_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: marketing_consent_events marketing_consent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_consent_events
    ADD CONSTRAINT marketing_consent_events_pkey PRIMARY KEY (id);


--
-- Name: marketing_consents marketing_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_consents
    ADD CONSTRAINT marketing_consents_pkey PRIMARY KEY (customer_id, consent_type);


--
-- Name: minecraft_accounts minecraft_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.minecraft_accounts
    ADD CONSTRAINT minecraft_accounts_pkey PRIMARY KEY (user_id);


--
-- Name: parent_gamer parent_gamer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_gamer
    ADD CONSTRAINT parent_gamer_pkey PRIMARY KEY (id);


--
-- Name: participations participations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_stripe_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_stripe_event_id_key UNIQUE (stripe_event_id);


--
-- Name: postal_codes postal_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postal_codes
    ADD CONSTRAINT postal_codes_pkey PRIMARY KEY (country_code, postal_code, location_id);


--
-- Name: product_groups product_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_groups
    ADD CONSTRAINT product_groups_pkey PRIMARY KEY (id);


--
-- Name: product_holiday_calendars product_holiday_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_holiday_calendars
    ADD CONSTRAINT product_holiday_calendars_pkey PRIMARY KEY (product_id, calendar_id);


--
-- Name: product_images product_images_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_path_key UNIQUE (path);


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- Name: product_images product_images_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_sha256_key UNIQUE (sha256);


--
-- Name: product_marketing_consents product_marketing_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_marketing_consents
    ADD CONSTRAINT product_marketing_consents_pkey PRIMARY KEY (product_id, consent_type);


--
-- Name: product_prices product_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_pkey PRIMARY KEY (product_id, currency);


--
-- Name: product_required_consents product_required_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_required_consents
    ADD CONSTRAINT product_required_consents_pkey PRIMARY KEY (product_id, document_slug);


--
-- Name: product_seat_counts product_seat_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_seat_counts
    ADD CONSTRAINT product_seat_counts_pkey PRIMARY KEY (product_id);


--
-- Name: product_staff_details product_staff_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_staff_details
    ADD CONSTRAINT product_staff_details_pkey PRIMARY KEY (product_id);


--
-- Name: product_subscription_prices product_subscription_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_subscription_prices
    ADD CONSTRAINT product_subscription_prices_pkey PRIMARY KEY (product_id, currency);


--
-- Name: product_translations product_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_translations
    ADD CONSTRAINT product_translations_pkey PRIMARY KEY (product_id, locale);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: roblox_accounts roblox_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roblox_accounts
    ADD CONSTRAINT roblox_accounts_pkey PRIMARY KEY (user_id);


--
-- Name: schedule_slots schedule_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_slots
    ADD CONSTRAINT schedule_slots_pkey PRIMARY KEY (id);


--
-- Name: schedule_slots schedule_slots_product_id_weekday_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_slots
    ADD CONSTRAINT schedule_slots_product_id_weekday_key UNIQUE (product_id, weekday);


--
-- Name: session_attendance session_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_pkey PRIMARY KEY (id);


--
-- Name: session_attendance session_attendance_session_participant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_session_participant_key UNIQUE (session_id, participant_id);


--
-- Name: site_details site_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_details
    ADD CONSTRAINT site_details_pkey PRIMARY KEY (location_id);


--
-- Name: site_staff_details site_staff_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_staff_details
    ADD CONSTRAINT site_staff_details_pkey PRIMARY KEY (location_id);


--
-- Name: parent_gamer unique_parent_gamer; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_gamer
    ADD CONSTRAINT unique_parent_gamer UNIQUE (parent_id, gamer_id);


--
-- Name: verification_email_requests verification_email_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_email_requests
    ADD CONSTRAINT verification_email_requests_pkey PRIMARY KEY (id);


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_pkey PRIMARY KEY (id);


--
-- Name: voice_zones voice_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_zones
    ADD CONSTRAINT voice_zones_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_contacts whatsapp_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_contacts
    ADD CONSTRAINT whatsapp_contacts_pkey PRIMARY KEY (phone);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: group_session_images_session_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_session_images_session_order_idx ON public.group_session_images USING btree (session_id, created_at, id);


--
-- Name: group_sessions_group_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_sessions_group_date_idx ON public.group_sessions USING btree (group_id, session_date DESC);


--
-- Name: idx_calendar_holidays_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_holidays_date ON public.calendar_holidays USING btree (date);


--
-- Name: idx_consent_acceptances_accepted_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_acceptances_accepted_by ON public.consent_acceptances USING btree (accepted_by);


--
-- Name: idx_consent_acceptances_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_acceptances_customer ON public.consent_acceptances USING btree (customer_id);


--
-- Name: idx_consent_acceptances_product_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_acceptances_product_participant ON public.consent_acceptances USING btree (product_id, participant_id);


--
-- Name: idx_family_subscriptions_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_family_subscriptions_customer ON public.family_subscriptions USING btree (customer_id);


--
-- Name: idx_family_subscriptions_participation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_family_subscriptions_participation ON public.family_subscriptions USING btree (participation_id);


--
-- Name: idx_feedback_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_user_created ON public.feedback_submissions USING btree (user_id, created_at DESC);


--
-- Name: idx_gedu_group_assignments_gedu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gedu_group_assignments_gedu ON public.gedu_group_assignments USING btree (gedu_id);


--
-- Name: idx_gedu_group_assignments_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gedu_group_assignments_product ON public.gedu_group_assignments USING btree (product_id);


--
-- Name: idx_gedu_locations_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gedu_locations_location ON public.gedu_locations USING btree (location_id);


--
-- Name: idx_locations_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_country ON public.locations USING btree (country_code) WHERE (country_code IS NOT NULL);


--
-- Name: idx_locations_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_parent ON public.locations USING btree (parent_id);


--
-- Name: idx_locations_search_blob; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_search_blob ON public.locations USING gin (search_blob extensions.gin_trgm_ops);


--
-- Name: idx_locations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_type ON public.locations USING btree (type);


--
-- Name: idx_marketing_consent_events_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_consent_events_customer ON public.marketing_consent_events USING btree (customer_id);


--
-- Name: idx_parent_gamer_gamer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parent_gamer_gamer ON public.parent_gamer USING btree (gamer_id);


--
-- Name: idx_parent_gamer_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parent_gamer_parent ON public.parent_gamer USING btree (parent_id);


--
-- Name: idx_participations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_active ON public.participations USING btree (product_id) WHERE (status = 'active'::public.participation_status);


--
-- Name: idx_participations_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_customer ON public.participations USING btree (customer_id);


--
-- Name: idx_participations_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_group ON public.participations USING btree (group_id) WHERE (group_id IS NOT NULL);


--
-- Name: idx_participations_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_participant ON public.participations USING btree (participant_id);


--
-- Name: idx_participations_unnotified_seat_offers; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_unnotified_seat_offers ON public.participations USING btree (seat_offer_sent_at) WHERE ((seat_offer_sent_at IS NOT NULL) AND (seat_offer_expiry_notified_at IS NULL));


--
-- Name: idx_participations_waitlisted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_waitlisted ON public.participations USING btree (product_id, waitlisted_at) WHERE (status = 'waitlisted'::public.participation_status);


--
-- Name: idx_payments_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_customer ON public.payments USING btree (customer_id);


--
-- Name: idx_payments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_invoice ON public.payments USING btree (stripe_invoice_id) WHERE (stripe_invoice_id IS NOT NULL);


--
-- Name: idx_payments_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_payment_intent ON public.payments USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- Name: idx_postal_codes_code_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_postal_codes_code_trgm ON public.postal_codes USING gin (postal_code extensions.gin_trgm_ops);


--
-- Name: INDEX idx_postal_codes_code_trgm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_postal_codes_code_trgm IS 'Serves the postal match arm of search_locations, which asks for codes starting with a folded needle across every country at once. Trigram rather than btree because the needle arrives as an InitPlan over the search function''s probe CTE, and PostgreSQL''s LIKE-prefix-to-range rewrite needs a plan-time Const; GIN extracts its query keys at execution time instead, exactly as the locations search blob index does.';


--
-- Name: idx_postal_codes_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_postal_codes_location_id ON public.postal_codes USING btree (location_id);


--
-- Name: idx_product_groups_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_groups_product ON public.product_groups USING btree (product_id);


--
-- Name: idx_product_holiday_calendars_calendar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_holiday_calendars_calendar ON public.product_holiday_calendars USING btree (calendar_id);


--
-- Name: idx_product_translations_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_translations_locale ON public.product_translations USING btree (locale);


--
-- Name: idx_products_image_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_image_id ON public.products USING btree (image_id);


--
-- Name: idx_products_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_location ON public.products USING btree (location_id) WHERE (location_id IS NOT NULL);


--
-- Name: idx_products_reg_opens_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_reg_opens_at ON public.products USING btree (registration_opens_at);


--
-- Name: idx_products_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_status ON public.products USING btree (status);


--
-- Name: idx_products_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_topic ON public.products USING btree (topic);


--
-- Name: idx_products_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_type ON public.products USING btree (product_type);


--
-- Name: idx_products_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_visible ON public.products USING btree (is_visible) WHERE (is_visible = true);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_profiles_home_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_home_location_id ON public.profiles USING btree (home_location_id) WHERE (home_location_id IS NOT NULL);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_schedule_slots_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_slots_product ON public.schedule_slots USING btree (product_id);


--
-- Name: idx_verification_email_requests_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_email_requests_user_created ON public.verification_email_requests USING btree (user_id, created_at DESC);


--
-- Name: idx_whatsapp_contacts_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_contacts_last_message ON public.whatsapp_contacts USING btree (last_message_at DESC);


--
-- Name: idx_whatsapp_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages USING btree (phone, created_at DESC);


--
-- Name: minecraft_accounts_uuid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX minecraft_accounts_uuid_idx ON public.minecraft_accounts USING btree (minecraft_uuid);


--
-- Name: session_attendance_participant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_attendance_participant_idx ON public.session_attendance USING btree (participant_id);


--
-- Name: session_attendance_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_attendance_session_idx ON public.session_attendance USING btree (session_id);


--
-- Name: uq_locations_external_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_locations_external_code ON public.locations USING btree (country_code, type, external_code) WHERE (external_code IS NOT NULL);


--
-- Name: uq_locations_geonames_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_locations_geonames_id ON public.locations USING btree (geonames_id) WHERE (geonames_id IS NOT NULL);


--
-- Name: uq_participations_active_or_waitlisted; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_participations_active_or_waitlisted ON public.participations USING btree (product_id, participant_id) WHERE (status = ANY (ARRAY['active'::public.participation_status, 'waitlisted'::public.participation_status, 'completed'::public.participation_status]));


--
-- Name: uq_participations_checkout_session; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_participations_checkout_session ON public.participations USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL);


--
-- Name: voice_private_zone_occupants_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_private_zone_occupants_group_id_idx ON public.voice_private_zone_occupants USING btree (group_id);


--
-- Name: voice_private_zone_occupants_zone_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_private_zone_occupants_zone_id_idx ON public.voice_private_zone_occupants USING btree (zone_id);


--
-- Name: voice_zones_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_zones_group_id_idx ON public.voice_zones USING btree (group_id);


--
-- Name: family_subscriptions family_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_subscriptions_updated_at BEFORE UPDATE ON public.family_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: gamer_group_notes gamer_group_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gamer_group_notes_updated_at BEFORE UPDATE ON public.gamer_group_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: group_sessions group_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER group_sessions_updated_at BEFORE UPDATE ON public.group_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: holiday_calendars holiday_calendars_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER holiday_calendars_updated_at BEFORE UPDATE ON public.holiday_calendars FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: locations locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: parent_gamer on_parent_gamer_deleted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_parent_gamer_deleted AFTER DELETE ON public.parent_gamer FOR EACH ROW EXECUTE FUNCTION public.handle_orphaned_gamer();


--
-- Name: participations participations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER participations_updated_at BEFORE UPDATE ON public.participations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_groups product_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_groups_updated_at BEFORE UPDATE ON public.product_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_prices product_prices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_prices_updated_at BEFORE UPDATE ON public.product_prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_staff_details product_staff_details_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_staff_details_updated_at BEFORE UPDATE ON public.product_staff_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_translations product_translations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_translations_updated_at BEFORE UPDATE ON public.product_translations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: schedule_slots schedule_slots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER schedule_slots_updated_at BEFORE UPDATE ON public.schedule_slots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: site_details site_details_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER site_details_updated_at BEFORE UPDATE ON public.site_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: site_staff_details site_staff_details_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER site_staff_details_updated_at BEFORE UPDATE ON public.site_staff_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_translations trg_ensure_product_keeps_at_least_one_translation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_product_keeps_at_least_one_translation BEFORE DELETE ON public.product_translations FOR EACH ROW EXECUTE FUNCTION public.ensure_product_keeps_at_least_one_translation();


--
-- Name: participations trg_participations_refresh_counts_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_participations_refresh_counts_del AFTER DELETE ON public.participations FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_product_seat_counts();


--
-- Name: participations trg_participations_refresh_counts_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_participations_refresh_counts_ins AFTER INSERT ON public.participations FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_product_seat_counts();


--
-- Name: participations trg_participations_refresh_counts_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_participations_refresh_counts_upd AFTER UPDATE OF status, product_id ON public.participations FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_product_seat_counts();


--
-- Name: participations trg_participations_stamp_group_joined_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_participations_stamp_group_joined_at BEFORE INSERT OR UPDATE OF group_id ON public.participations FOR EACH ROW EXECUTE FUNCTION public.stamp_participation_group_joined_at();


--
-- Name: products trg_products_apply_image_path; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_apply_image_path BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.apply_product_image_path();


--
-- Name: products trg_products_seed_seat_counts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_seed_seat_counts AFTER INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.trg_seed_product_seat_counts();


--
-- Name: profiles trg_reset_email_verification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reset_email_verification BEFORE UPDATE OF email ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.reset_email_verification_on_email_change();


--
-- Name: TRIGGER trg_reset_email_verification ON profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER trg_reset_email_verification ON public.profiles IS 'Empties profiles.email_verified_at whenever profiles.email actually changes: the marker is a claim about one address, so it cannot be allowed to follow the account onto a new one. Fires on UPDATE OF email, which includes a SET that rewrites the same value, so the body tests IS DISTINCT FROM and leaves an unchanged address verified.';


--
-- Name: locations trg_set_location_depth; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_location_depth BEFORE INSERT OR UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_location_depth();


--
-- Name: TRIGGER trg_set_location_depth ON locations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER trg_set_location_depth ON public.locations IS 'Keeps locations.depth equal to the ancestor-chain length: 0 when parent_id is NULL, parent.depth + 1 otherwise. Fires on every INSERT and UPDATE so the column cannot be forged from outside. LIMIT, stated so nobody assumes otherwise: a FOR EACH ROW trigger corrects the row it is handed and cannot re-depth that row''s descendants, so re-parenting a node that HAS descendants would leave their depth stale. Nothing does that — nothing above `site` is ever created or moved by the application, sync never reparents without a human widening the migration by hand, and the FI/FR cutover re-parents only sites, which are leaves. A future migration that reparents a non-leaf must re-run the recursive backfill in this file.';


--
-- Name: gedu_group_assignments trg_validate_gedu_assignment_product; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_gedu_assignment_product BEFORE INSERT OR UPDATE OF group_id, product_id ON public.gedu_group_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_gedu_assignment_product();


--
-- Name: participations trg_validate_participations_group; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_participations_group BEFORE INSERT OR UPDATE OF group_id, product_id ON public.participations FOR EACH ROW EXECUTE FUNCTION public.validate_participations_group();


--
-- Name: products trg_validate_products_location; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_products_location BEFORE INSERT OR UPDATE OF location_id, is_remote, product_type ON public.products FOR EACH ROW EXECUTE FUNCTION public.validate_products_location();


--
-- Name: profiles trg_validate_profile_spoken_languages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_profile_spoken_languages BEFORE INSERT OR UPDATE OF spoken_languages ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_profile_spoken_languages();


--
-- Name: site_details trg_validate_site_details_location; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_site_details_location BEFORE INSERT OR UPDATE OF location_id ON public.site_details FOR EACH ROW EXECUTE FUNCTION public.validate_site_details_location();


--
-- Name: site_staff_details trg_validate_site_staff_details_location; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_site_staff_details_location BEFORE INSERT OR UPDATE OF location_id ON public.site_staff_details FOR EACH ROW EXECUTE FUNCTION public.validate_site_details_location();


--
-- Name: parent_gamer validate_parent_gamer_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_parent_gamer_on_insert BEFORE INSERT ON public.parent_gamer FOR EACH ROW EXECUTE FUNCTION public.validate_parent_gamer_roles();


--
-- Name: voice_zones voice_zones_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER voice_zones_updated_at BEFORE UPDATE ON public.voice_zones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: calendar_holidays calendar_holidays_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_holidays
    ADD CONSTRAINT calendar_holidays_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.holiday_calendars(id) ON DELETE CASCADE;


--
-- Name: consent_acceptances consent_acceptances_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.profiles(id);


--
-- Name: consent_acceptances consent_acceptances_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: consent_acceptances consent_acceptances_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_document_fkey FOREIGN KEY (document_slug, document_version) REFERENCES public.consent_document_versions(document_slug, version);


--
-- Name: consent_acceptances consent_acceptances_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: consent_acceptances consent_acceptances_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: consent_document_versions consent_document_versions_document_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_document_versions
    ADD CONSTRAINT consent_document_versions_document_slug_fkey FOREIGN KEY (document_slug) REFERENCES public.consent_documents(slug) ON DELETE CASCADE;


--
-- Name: customer_profiles customer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: family_subscriptions family_subscriptions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_subscriptions
    ADD CONSTRAINT family_subscriptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: family_subscriptions family_subscriptions_participation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_subscriptions
    ADD CONSTRAINT family_subscriptions_participation_id_fkey FOREIGN KEY (participation_id) REFERENCES public.participations(id) ON DELETE CASCADE;


--
-- Name: feedback_submissions feedback_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_submissions
    ADD CONSTRAINT feedback_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gamer_group_notes gamer_group_notes_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_notes
    ADD CONSTRAINT gamer_group_notes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: gamer_group_notes gamer_group_notes_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_notes
    ADD CONSTRAINT gamer_group_notes_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gamer_group_notes gamer_group_notes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_notes
    ADD CONSTRAINT gamer_group_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gamer_profiles gamer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_profiles
    ADD CONSTRAINT gamer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gedu_contract_acceptances gedu_contract_acceptances_contract_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_contract_acceptances
    ADD CONSTRAINT gedu_contract_acceptances_contract_version_fkey FOREIGN KEY (contract_version) REFERENCES public.gedu_contract_versions(version);


--
-- Name: gedu_contract_acceptances gedu_contract_acceptances_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_contract_acceptances
    ADD CONSTRAINT gedu_contract_acceptances_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.gedu_profiles(user_id) ON DELETE CASCADE;


--
-- Name: gedu_group_assignments gedu_group_assignments_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: gedu_group_assignments gedu_group_assignments_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: gedu_group_assignments gedu_group_assignments_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: gedu_locations gedu_locations_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_locations
    ADD CONSTRAINT gedu_locations_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gedu_locations gedu_locations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_locations
    ADD CONSTRAINT gedu_locations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: gedu_profiles gedu_profiles_certified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_profiles
    ADD CONSTRAINT gedu_profiles_certified_by_fkey FOREIGN KEY (certified_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gedu_profiles gedu_profiles_criminal_record_check_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_profiles
    ADD CONSTRAINT gedu_profiles_criminal_record_check_by_fkey FOREIGN KEY (criminal_record_check_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gedu_profiles gedu_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_profiles
    ADD CONSTRAINT gedu_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: group_session_images group_session_images_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_session_images
    ADD CONSTRAINT group_session_images_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: group_session_images group_session_images_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_session_images
    ADD CONSTRAINT group_session_images_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.group_sessions(id) ON DELETE CASCADE;


--
-- Name: group_sessions group_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: group_sessions group_sessions_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: group_sessions group_sessions_report_emailed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_report_emailed_by_fkey FOREIGN KEY (report_emailed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: group_sessions group_sessions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: locations locations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.locations(id) ON DELETE RESTRICT;


--
-- Name: marketing_consent_events marketing_consent_events_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_consent_events
    ADD CONSTRAINT marketing_consent_events_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: marketing_consents marketing_consents_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_consents
    ADD CONSTRAINT marketing_consents_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: minecraft_accounts minecraft_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.minecraft_accounts
    ADD CONSTRAINT minecraft_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: parent_gamer parent_gamer_gamer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_gamer
    ADD CONSTRAINT parent_gamer_gamer_id_fkey FOREIGN KEY (gamer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: parent_gamer parent_gamer_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_gamer
    ADD CONSTRAINT parent_gamer_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: participations participations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: participations participations_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE SET NULL;


--
-- Name: participations participations_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: participations participations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: payments payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: postal_codes postal_codes_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postal_codes
    ADD CONSTRAINT postal_codes_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: product_groups product_groups_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_groups
    ADD CONSTRAINT product_groups_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_holiday_calendars product_holiday_calendars_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_holiday_calendars
    ADD CONSTRAINT product_holiday_calendars_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.holiday_calendars(id) ON DELETE CASCADE;


--
-- Name: product_holiday_calendars product_holiday_calendars_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_holiday_calendars
    ADD CONSTRAINT product_holiday_calendars_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_marketing_consents product_marketing_consents_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_marketing_consents
    ADD CONSTRAINT product_marketing_consents_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_prices product_prices_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_required_consents product_required_consents_document_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_required_consents
    ADD CONSTRAINT product_required_consents_document_slug_fkey FOREIGN KEY (document_slug) REFERENCES public.consent_documents(slug);


--
-- Name: product_required_consents product_required_consents_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_required_consents
    ADD CONSTRAINT product_required_consents_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_seat_counts product_seat_counts_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_seat_counts
    ADD CONSTRAINT product_seat_counts_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_staff_details product_staff_details_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_staff_details
    ADD CONSTRAINT product_staff_details_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_subscription_prices product_subscription_prices_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_subscription_prices
    ADD CONSTRAINT product_subscription_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_translations product_translations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_translations
    ADD CONSTRAINT product_translations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: products products_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.product_images(id) ON DELETE SET NULL;


--
-- Name: products products_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_home_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_home_location_id_fkey FOREIGN KEY (home_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: roblox_accounts roblox_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roblox_accounts
    ADD CONSTRAINT roblox_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: schedule_slots schedule_slots_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_slots
    ADD CONSTRAINT schedule_slots_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: session_attendance session_attendance_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: session_attendance session_attendance_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: session_attendance session_attendance_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.group_sessions(id) ON DELETE CASCADE;


--
-- Name: site_details site_details_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_details
    ADD CONSTRAINT site_details_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: site_staff_details site_staff_details_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_staff_details
    ADD CONSTRAINT site_staff_details_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: verification_email_requests verification_email_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_email_requests
    ADD CONSTRAINT verification_email_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_placed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_placed_by_fkey FOREIGN KEY (placed_by) REFERENCES public.profiles(id);


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.voice_zones(id) ON DELETE CASCADE;


--
-- Name: voice_zones voice_zones_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_zones
    ADD CONSTRAINT voice_zones_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: voice_zones voice_zones_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_zones
    ADD CONSTRAINT voice_zones_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_phone_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_phone_fkey FOREIGN KEY (phone) REFERENCES public.whatsapp_contacts(phone);


--
-- Name: whatsapp_contacts Admins can insert whatsapp_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert whatsapp_contacts" ON public.whatsapp_contacts FOR INSERT TO authenticated WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: whatsapp_messages Admins can insert whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert whatsapp_messages" ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK ((( SELECT public.is_admin() AS is_admin) AND (direction = 'outbound'::text)));


--
-- Name: whatsapp_contacts Admins can read whatsapp_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read whatsapp_contacts" ON public.whatsapp_contacts FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: whatsapp_messages Admins can read whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read whatsapp_messages" ON public.whatsapp_messages FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: whatsapp_contacts Admins can update whatsapp_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update whatsapp_contacts" ON public.whatsapp_contacts FOR UPDATE TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: calendar_holidays admin_full_access_calendar_holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_calendar_holidays ON public.calendar_holidays TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: customer_profiles admin_full_access_customer_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_customer_profiles ON public.customer_profiles TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: family_subscriptions admin_full_access_family_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_family_subscriptions ON public.family_subscriptions TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: feedback_submissions admin_full_access_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_feedback ON public.feedback_submissions TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: gamer_profiles admin_full_access_gamer_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_gamer_profiles ON public.gamer_profiles TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: gedu_group_assignments admin_full_access_gedu_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_gedu_assignments ON public.gedu_group_assignments TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: gedu_profiles admin_full_access_gedu_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_gedu_profiles ON public.gedu_profiles TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: holiday_calendars admin_full_access_holiday_calendars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_holiday_calendars ON public.holiday_calendars TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: minecraft_accounts admin_full_access_minecraft_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_minecraft_accounts ON public.minecraft_accounts TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: parent_gamer admin_full_access_parent_gamer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_parent_gamer ON public.parent_gamer TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: participations admin_full_access_participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_participations ON public.participations TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: payments admin_full_access_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_payments ON public.payments TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_groups admin_full_access_product_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_groups ON public.product_groups TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_holiday_calendars admin_full_access_product_holiday_calendars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_holiday_calendars ON public.product_holiday_calendars TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_images admin_full_access_product_images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_images ON public.product_images TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_prices admin_full_access_product_prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_prices ON public.product_prices TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_staff_details admin_full_access_product_staff_details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_staff_details ON public.product_staff_details TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK ((( SELECT public.is_admin() AS is_admin) AND (EXISTS ( SELECT 1
   FROM public.products p
  WHERE (p.id = product_staff_details.product_id)))));


--
-- Name: product_subscription_prices admin_full_access_product_subscription_prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_subscription_prices ON public.product_subscription_prices TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_translations admin_full_access_product_translations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_translations ON public.product_translations TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: products admin_full_access_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_products ON public.products TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: profiles admin_full_access_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_profiles ON public.profiles TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: roblox_accounts admin_full_access_roblox_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_roblox_accounts ON public.roblox_accounts TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: schedule_slots admin_full_access_schedule_slots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_schedule_slots ON public.schedule_slots TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: site_details admin_full_access_site_details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_site_details ON public.site_details TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: site_staff_details admin_full_access_site_staff_details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_site_staff_details ON public.site_staff_details TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: gedu_locations admin_manage_gedu_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_gedu_locations ON public.gedu_locations TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: locations admin_manage_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_locations ON public.locations TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: consent_acceptances admins_read_consent_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_consent_acceptances ON public.consent_acceptances FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: gedu_contract_acceptances admins_read_gedu_contract_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_gedu_contract_acceptances ON public.gedu_contract_acceptances FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: marketing_consent_events admins_read_marketing_consent_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_marketing_consent_events ON public.marketing_consent_events FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: marketing_consents admins_read_marketing_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_marketing_consents ON public.marketing_consents FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: locations anon_read_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_read_locations ON public.locations FOR SELECT TO anon USING (true);


--
-- Name: locations authenticated_read_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read_locations ON public.locations FOR SELECT TO authenticated USING (true);


--
-- Name: calendar_holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_holidays ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_document_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_document_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: family_subscriptions customer_select_own_family_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_select_own_family_subscriptions ON public.family_subscriptions FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (customer_id = ( SELECT auth.uid() AS uid))));


--
-- Name: participations customer_select_own_participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_select_own_participations ON public.participations FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (customer_id = ( SELECT auth.uid() AS uid))));


--
-- Name: payments customer_select_own_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_select_own_payments ON public.payments FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (customer_id = ( SELECT auth.uid() AS uid))));


--
-- Name: parent_gamer customers_delete_own_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_delete_own_links ON public.parent_gamer FOR DELETE TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (parent_id = ( SELECT auth.uid() AS uid))));


--
-- Name: gedu_group_assignments customers_read_assignments_via_gamers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_assignments_via_gamers ON public.gedu_group_assignments FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND ( SELECT public.has_active_participation_on_product(gedu_group_assignments.product_id) AS has_active_participation_on_product)));


--
-- Name: product_groups customers_read_groups_via_gamers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_groups_via_gamers ON public.product_groups FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND ( SELECT public.has_active_participation_in_group(product_groups.id) AS has_active_participation_in_group)));


--
-- Name: consent_acceptances customers_read_own_consent_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_own_consent_acceptances ON public.consent_acceptances FOR SELECT TO authenticated USING ((customer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: customer_profiles customers_read_own_customer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_own_customer_profile ON public.customer_profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: marketing_consent_events customers_read_own_marketing_consent_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_own_marketing_consent_events ON public.marketing_consent_events FOR SELECT TO authenticated USING ((customer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: marketing_consents customers_read_own_marketing_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_own_marketing_consents ON public.marketing_consents FOR SELECT TO authenticated USING ((customer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: parent_gamer customers_view_own_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_view_own_links ON public.parent_gamer FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (parent_id = ( SELECT auth.uid() AS uid))));


--
-- Name: family_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.family_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: gamer_group_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gamer_group_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: gamer_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gamer_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: participations gamer_select_own_participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamer_select_own_participations ON public.participations FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gamer'::public.user_role) AND (participant_id = ( SELECT auth.uid() AS uid))));


--
-- Name: gamer_profiles gamers_read_own_gamer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamers_read_own_gamer_profile ON public.gamer_profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: product_groups gamers_read_own_group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamers_read_own_group ON public.product_groups FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gamer'::public.user_role) AND ( SELECT public.has_active_participation_in_group(product_groups.id) AS has_active_participation_in_group)));


--
-- Name: gamer_profiles gamers_update_own_gamer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamers_update_own_gamer_profile ON public.gamer_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: parent_gamer gamers_view_parent_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamers_view_parent_links ON public.parent_gamer FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gamer'::public.user_role) AND (gamer_id = ( SELECT auth.uid() AS uid))));


--
-- Name: gedu_contract_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_contract_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_contract_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_contract_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_group_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_group_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_locations gedu_manage_own_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedu_manage_own_locations ON public.gedu_locations TO authenticated USING (((gedu_id = ( SELECT auth.uid() AS uid)) AND (( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role))) WITH CHECK (((gedu_id = ( SELECT auth.uid() AS uid)) AND (( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role)));


--
-- Name: gedu_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: site_details gedu_read_site_details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedu_read_site_details ON public.site_details FOR SELECT TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role));


--
-- Name: site_staff_details gedu_read_site_staff_details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedu_read_site_staff_details ON public.site_staff_details FOR SELECT TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role));


--
-- Name: product_groups gedus_read_assigned_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_assigned_groups ON public.product_groups FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role) AND (id IN ( SELECT gedu_group_assignments.group_id
   FROM public.gedu_group_assignments
  WHERE (gedu_group_assignments.gedu_id = auth.uid())))));


--
-- Name: gedu_group_assignments gedus_read_own_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_own_assignments ON public.gedu_group_assignments FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role) AND (gedu_id = ( SELECT auth.uid() AS uid))));


--
-- Name: gedu_contract_acceptances gedus_read_own_contract_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_own_contract_acceptances ON public.gedu_contract_acceptances FOR SELECT TO authenticated USING ((gedu_id = ( SELECT auth.uid() AS uid)));


--
-- Name: gedu_profiles gedus_read_own_gedu_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_own_gedu_profile ON public.gedu_profiles FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: group_session_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_session_images ENABLE ROW LEVEL SECURITY;

--
-- Name: group_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: holiday_calendars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.holiday_calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_consent_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_consent_events ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: minecraft_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.minecraft_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: parent_gamer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parent_gamer ENABLE ROW LEVEL SECURITY;

--
-- Name: minecraft_accounts parents_read_linked_gamer_minecraft; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parents_read_linked_gamer_minecraft ON public.minecraft_accounts FOR SELECT TO authenticated USING (public.is_parent_of(user_id));


--
-- Name: gamer_profiles parents_read_linked_gamer_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parents_read_linked_gamer_profiles ON public.gamer_profiles FOR SELECT TO authenticated USING (public.is_parent_of(user_id));


--
-- Name: roblox_accounts parents_read_linked_gamer_roblox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parents_read_linked_gamer_roblox ON public.roblox_accounts FOR SELECT TO authenticated USING (public.is_parent_of(user_id));


--
-- Name: profiles parents_view_linked_gamers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parents_view_linked_gamers ON public.profiles FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (id IN ( SELECT parent_gamer.gamer_id
   FROM public.parent_gamer
  WHERE (parent_gamer.parent_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: participations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.participations ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: postal_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.postal_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: postal_codes postal_codes_are_public_reference_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY postal_codes_are_public_reference_data ON public.postal_codes FOR SELECT TO authenticated, anon USING (true);


--
-- Name: product_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: product_holiday_calendars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_holiday_calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: product_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

--
-- Name: product_marketing_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_marketing_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: product_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: product_required_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_required_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: product_seat_counts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_seat_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: product_staff_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_staff_details ENABLE ROW LEVEL SECURITY;

--
-- Name: product_subscription_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_subscription_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: product_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_holidays public_read_calendar_holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_calendar_holidays ON public.calendar_holidays FOR SELECT TO authenticated, anon USING (true);


--
-- Name: holiday_calendars public_read_holiday_calendars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_holiday_calendars ON public.holiday_calendars FOR SELECT TO authenticated, anon USING (true);


--
-- Name: product_seat_counts public_read_product_seat_counts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_product_seat_counts ON public.product_seat_counts FOR SELECT TO authenticated, anon USING (true);


--
-- Name: consent_document_versions public_reads_consent_document_versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_reads_consent_document_versions ON public.consent_document_versions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: consent_documents public_reads_consent_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_reads_consent_documents ON public.consent_documents FOR SELECT TO authenticated, anon USING (true);


--
-- Name: product_holiday_calendars read_product_holiday_calendars_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_holiday_calendars_via_product ON public.product_holiday_calendars FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: product_marketing_consents read_product_marketing_consents_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_marketing_consents_via_product ON public.product_marketing_consents FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: product_prices read_product_prices_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_prices_via_product ON public.product_prices FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: product_required_consents read_product_required_consents_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_required_consents_via_product ON public.product_required_consents FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: product_translations read_product_translations_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_translations_via_product ON public.product_translations FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: products read_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_products ON public.products FOR SELECT TO authenticated, anon USING (public.can_read_product(id));


--
-- Name: schedule_slots read_schedule_slots_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_schedule_slots_via_product ON public.schedule_slots FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: roblox_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roblox_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: session_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_contract_versions signed_in_reads_gedu_contract_versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY signed_in_reads_gedu_contract_versions ON public.gedu_contract_versions FOR SELECT TO authenticated USING (true);


--
-- Name: site_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_details ENABLE ROW LEVEL SECURITY;

--
-- Name: site_staff_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_staff_details ENABLE ROW LEVEL SECURITY;

--
-- Name: minecraft_accounts users_insert_own_minecraft_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_minecraft_account ON public.minecraft_accounts FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: roblox_accounts users_insert_own_roblox_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_roblox_account ON public.roblox_accounts FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: feedback_submissions users_read_own_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_feedback ON public.feedback_submissions FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: minecraft_accounts users_read_own_minecraft_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_minecraft_account ON public.minecraft_accounts FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: roblox_accounts users_read_own_roblox_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_roblox_account ON public.roblox_accounts FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: minecraft_accounts users_update_own_minecraft_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_minecraft_account ON public.minecraft_accounts FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: profiles users_update_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_profile ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK (((id = ( SELECT auth.uid() AS uid)) AND (role = ( SELECT public.get_user_role() AS get_user_role))));


--
-- Name: roblox_accounts users_update_own_roblox_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_roblox_account ON public.roblox_accounts FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: profiles users_view_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_view_own_profile ON public.profiles FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: verification_email_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verification_email_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_private_zone_occupants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_private_zone_occupants ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_private_zone_occupants_delete ON public.voice_private_zone_occupants FOR DELETE TO authenticated USING (public.is_voice_group_moderator(group_id));


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_private_zone_occupants_insert ON public.voice_private_zone_occupants FOR INSERT TO authenticated WITH CHECK ((public.is_voice_group_moderator(group_id) AND (placed_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.voice_zones z
  WHERE ((z.id = voice_private_zone_occupants.zone_id) AND (z.group_id = voice_private_zone_occupants.group_id) AND (z.is_locked = true))))));


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_private_zone_occupants_select ON public.voice_private_zone_occupants FOR SELECT TO authenticated USING (public.is_voice_group_member(group_id));


--
-- Name: voice_zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_zones ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_zones voice_zones_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_zones_delete ON public.voice_zones FOR DELETE TO authenticated USING (public.is_voice_group_moderator(group_id));


--
-- Name: voice_zones voice_zones_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_zones_insert ON public.voice_zones FOR INSERT TO authenticated WITH CHECK ((public.is_voice_group_moderator(group_id) AND (created_by = ( SELECT auth.uid() AS uid))));


--
-- Name: voice_zones voice_zones_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_zones_select ON public.voice_zones FOR SELECT TO authenticated USING (public.is_voice_group_member(group_id));


--
-- Name: voice_zones voice_zones_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_zones_update ON public.voice_zones FOR UPDATE TO authenticated USING (public.is_voice_group_moderator(group_id)) WITH CHECK (public.is_voice_group_moderator(group_id));


--
-- Name: whatsapp_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION _list_column_grants(p_grantee text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_column_grants(p_grantee text) FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_column_grants(p_grantee text) TO service_role;


--
-- Name: FUNCTION _list_cron_jobs(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_cron_jobs() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_cron_jobs() TO service_role;


--
-- Name: FUNCTION _list_function_authorization_surface(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_function_authorization_surface() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_function_authorization_surface() TO service_role;


--
-- Name: FUNCTION _list_security_definer_without_search_path(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_security_definer_without_search_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_security_definer_without_search_path() TO service_role;


--
-- Name: FUNCTION _list_table_grants(p_grantee text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_table_grants(p_grantee text) FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_table_grants(p_grantee text) TO service_role;


--
-- Name: FUNCTION _list_tables_without_rls(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_tables_without_rls() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_tables_without_rls() TO service_role;


--
-- Name: FUNCTION _list_views(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_views() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_views() TO service_role;


--
-- Name: FUNCTION accept_gedu_contract(p_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accept_gedu_contract(p_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_gedu_contract(p_version text) TO authenticated;


--
-- Name: FUNCTION add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) TO authenticated;
GRANT ALL ON FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) TO service_role;


--
-- Name: FUNCTION admin_enroll_participant(p_product_id uuid, p_participant_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) TO service_role;


--
-- Name: FUNCTION admin_remove_participation(p_product_id uuid, p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) TO service_role;


--
-- Name: FUNCTION admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) TO service_role;


--
-- Name: FUNCTION apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) TO service_role;


--
-- Name: FUNCTION apply_product_image_path(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_product_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_product_image_path() TO service_role;


--
-- Name: FUNCTION assert_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_admin() TO authenticated;
GRANT ALL ON FUNCTION public.assert_admin() TO service_role;


--
-- Name: FUNCTION assert_can_delete_session_image(p_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) TO service_role;


--
-- Name: FUNCTION assert_role(p_role public.user_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_role(p_role public.user_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_role(p_role public.user_role) TO authenticated;
GRANT ALL ON FUNCTION public.assert_role(p_role public.user_role) TO service_role;


--
-- Name: FUNCTION assert_self(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_self(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_self(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION can_read_product(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_read_product(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_read_product(p_product_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_read_product(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_read_product(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION cancel_participation(p_participation_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION claim_expired_seat_offer_notifications(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_expired_seat_offer_notifications(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_expired_seat_offer_notifications(p_participation_id uuid) TO service_role;


--
-- Name: FUNCTION claim_group_session_report_email(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) TO authenticated;
GRANT ALL ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) TO service_role;


--
-- Name: FUNCTION confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text) TO service_role;


--
-- Name: FUNCTION count_active_seats(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_active_seats(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_active_seats(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id bigint) TO service_role;


--
-- Name: FUNCTION create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]) TO service_role;


--
-- Name: FUNCTION create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]) TO service_role;


--
-- Name: FUNCTION delete_group_session_image(p_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_group_session_image(p_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_group_session_image(p_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_group_session_image(p_image_id uuid) TO service_role;


--
-- Name: FUNCTION demote_to_waitlist(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) TO service_role;


--
-- Name: FUNCTION derive_group_session_window(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) TO service_role;


--
-- Name: FUNCTION effective_status(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.effective_status(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.effective_status(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION ensure_group_session(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_group_session(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_group_session(p_group_id uuid, p_session_date date) TO service_role;


--
-- Name: FUNCTION ensure_product_keeps_at_least_one_translation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_product_keeps_at_least_one_translation() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_product_keeps_at_least_one_translation() TO service_role;


--
-- Name: FUNCTION gedu_teaches_group(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_teaches_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_teaches_group(p_group_id uuid) TO service_role;


--
-- Name: FUNCTION gedu_teaches_group_product(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_teaches_group_product(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_teaches_group_product(p_group_id uuid) TO service_role;


--
-- Name: FUNCTION get_admin_dashboard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_dashboard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_dashboard() TO service_role;


--
-- Name: FUNCTION get_admin_product_sessions(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION get_gedu_assigned_product(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION get_gedu_group_feed(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) TO service_role;


--
-- Name: FUNCTION get_group_staff_overlay(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_group_staff_overlay(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_group_staff_overlay(p_group_id uuid) TO authenticated;


--
-- Name: FUNCTION get_my_assigned_products(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO service_role;


--
-- Name: FUNCTION get_my_family_product_feed(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.phone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(phone) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.spoken_languages; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(spoken_languages) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.locale; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(locale) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.first_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(first_name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.last_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(last_name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.home_location_id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(home_location_id) ON TABLE public.profiles TO authenticated;


--
-- Name: FUNCTION get_my_gamers(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_gamers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_gamers() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_gamers() TO service_role;


--
-- Name: FUNCTION get_my_gedu_assignment_summaries(p_epoch_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) TO service_role;


--
-- Name: FUNCTION get_my_parents(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_parents() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_parents() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_parents() TO service_role;


--
-- Name: FUNCTION get_my_participation_subscription_states(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_participation_subscription_states() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_participation_subscription_states() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_participation_subscription_states() TO service_role;


--
-- Name: FUNCTION get_my_waitlist_positions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_waitlist_positions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_waitlist_positions() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_waitlist_positions() TO service_role;


--
-- Name: FUNCTION get_product_groups_with_details(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION get_user_role(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_role() TO service_role;


--
-- Name: FUNCTION get_waitlist_position(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_waitlist_position(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_waitlist_position(p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_waitlist_position(p_participation_id uuid) TO service_role;


--
-- Name: FUNCTION group_session_date_is_writable(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_session_date_is_writable(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_date_is_writable(p_group_id uuid, p_session_date date) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_orphaned_gamer(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_orphaned_gamer() TO anon;
GRANT ALL ON FUNCTION public.handle_orphaned_gamer() TO authenticated;
GRANT ALL ON FUNCTION public.handle_orphaned_gamer() TO service_role;


--
-- Name: FUNCTION has_active_participation_in_group(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_active_participation_in_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_active_participation_in_group(p_group_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.has_active_participation_in_group(p_group_id uuid) TO authenticated;


--
-- Name: FUNCTION has_active_participation_on_product(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_active_participation_on_product(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_active_participation_on_product(p_product_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.has_active_participation_on_product(p_product_id uuid) TO authenticated;


--
-- Name: FUNCTION immutable_unaccent(p_value text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.immutable_unaccent(p_value text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.immutable_unaccent(p_value text) TO anon;
GRANT ALL ON FUNCTION public.immutable_unaccent(p_value text) TO authenticated;
GRANT ALL ON FUNCTION public.immutable_unaccent(p_value text) TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION is_no_charge(p_mode public.billing_mode); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_no_charge(p_mode public.billing_mode) FROM PUBLIC;


--
-- Name: FUNCTION is_parent_of(gamer_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_parent_of(gamer_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_parent_of(gamer_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_parent_of(gamer_uuid uuid) TO service_role;


--
-- Name: FUNCTION is_voice_group_member(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_voice_group_member(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_voice_group_member(p_group_id uuid) TO authenticated;


--
-- Name: FUNCTION is_voice_group_moderator(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_voice_group_moderator(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_voice_group_moderator(p_group_id uuid) TO authenticated;


--
-- Name: FUNCTION join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]) TO authenticated;
GRANT ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]) TO service_role;


--
-- Name: FUNCTION join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[]) FROM PUBLIC;


--
-- Name: FUNCTION leave_my_waitlist_spot(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) TO service_role;


--
-- Name: FUNCTION location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text) TO authenticated;
GRANT ALL ON FUNCTION public.location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text) TO service_role;


--
-- Name: FUNCTION location_search_separator(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.location_search_separator() FROM PUBLIC;
GRANT ALL ON FUNCTION public.location_search_separator() TO anon;
GRANT ALL ON FUNCTION public.location_search_separator() TO authenticated;
GRANT ALL ON FUNCTION public.location_search_separator() TO service_role;


--
-- Name: FUNCTION participation_state(p_status public.participation_status, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) TO service_role;


--
-- Name: FUNCTION pin_is_set(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pin_is_set() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pin_is_set() TO authenticated;
GRANT ALL ON FUNCTION public.pin_is_set() TO service_role;


--
-- Name: FUNCTION product_has_session(p_product_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.product_has_session(p_product_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.product_has_session(p_product_id uuid, p_session_date date) TO service_role;


--
-- Name: FUNCTION promote_from_waitlist(p_participation_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid) TO service_role;


--
-- Name: FUNCTION record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_participant_id uuid, p_status text) TO service_role;


--
-- Name: FUNCTION record_registration_marketing_consent(p_customer_id uuid, p_granted boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_registration_marketing_consent(p_customer_id uuid, p_granted boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_registration_marketing_consent(p_customer_id uuid, p_granted boolean) TO service_role;


--
-- Name: FUNCTION record_required_consents(p_product_id uuid, p_customer_id uuid, p_participant_id uuid, p_accepted_by uuid, p_consented_documents text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_required_consents(p_product_id uuid, p_customer_id uuid, p_participant_id uuid, p_accepted_by uuid, p_consented_documents text[]) FROM PUBLIC;


--
-- Name: FUNCTION refresh_product_seat_counts(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_product_seat_counts(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_product_seat_counts(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages public.spoken_language[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages public.spoken_language[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages public.spoken_language[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id text) TO service_role;


--
-- Name: FUNCTION request_my_verification_email(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_my_verification_email() FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_my_verification_email() TO authenticated;


--
-- Name: FUNCTION reset_email_verification_on_email_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_email_verification_on_email_change() FROM PUBLIC;


--
-- Name: FUNCTION respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean) TO service_role;


--
-- Name: FUNCTION search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text) TO anon;
GRANT ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text) TO authenticated;
GRANT ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text) TO service_role;


--
-- Name: FUNCTION send_seat_offer(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.send_seat_offer(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_seat_offer(p_participation_id uuid) TO service_role;


--
-- Name: FUNCTION set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) TO authenticated;


--
-- Name: FUNCTION set_gedu_certified(p_gedu_id uuid, p_certified boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_gedu_certified(p_gedu_id uuid, p_certified boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_gedu_certified(p_gedu_id uuid, p_certified boolean) TO authenticated;


--
-- Name: FUNCTION set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean) TO authenticated;


--
-- Name: FUNCTION set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) TO service_role;


--
-- Name: FUNCTION set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) TO service_role;


--
-- Name: FUNCTION set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) TO service_role;


--
-- Name: FUNCTION set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) TO service_role;


--
-- Name: FUNCTION set_location_depth(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_location_depth() FROM PUBLIC;


--
-- Name: FUNCTION set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) TO authenticated;
GRANT ALL ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) TO service_role;


--
-- Name: FUNCTION set_my_pin(p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_my_pin(p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_my_pin(p_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.set_my_pin(p_pin text) TO service_role;


--
-- Name: FUNCTION set_pin_for_user(p_user_id uuid, p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_pin_for_user(p_user_id uuid, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_pin_for_user(p_user_id uuid, p_pin text) TO service_role;


--
-- Name: FUNCTION set_product_required_consents(p_product_id uuid, p_slugs text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_product_required_consents(p_product_id uuid, p_slugs text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_product_required_consents(p_product_id uuid, p_slugs text[]) TO authenticated;
GRANT ALL ON FUNCTION public.set_product_required_consents(p_product_id uuid, p_slugs text[]) TO service_role;


--
-- Name: FUNCTION set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) TO authenticated;
GRANT ALL ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) TO service_role;


--
-- Name: FUNCTION stamp_participation_group_joined_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.stamp_participation_group_joined_at() FROM PUBLIC;


--
-- Name: FUNCTION submit_feedback(p_user_id uuid, p_message text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_feedback(p_user_id uuid, p_message text) FROM PUBLIC;


--
-- Name: FUNCTION submit_my_feedback(p_message text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_my_feedback(p_message text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_my_feedback(p_message text) TO authenticated;
GRANT ALL ON FUNCTION public.submit_my_feedback(p_message text) TO service_role;


--
-- Name: FUNCTION trg_refresh_product_seat_counts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_refresh_product_seat_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_refresh_product_seat_counts() TO service_role;


--
-- Name: FUNCTION trg_seed_product_seat_counts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_seed_product_seat_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_seed_product_seat_counts() TO service_role;


--
-- Name: FUNCTION update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]) TO authenticated;
GRANT ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]) TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION validate_gedu_assignment_product(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_gedu_assignment_product() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_gedu_assignment_product() TO service_role;


--
-- Name: FUNCTION validate_parent_gamer_roles(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_parent_gamer_roles() TO anon;
GRANT ALL ON FUNCTION public.validate_parent_gamer_roles() TO authenticated;
GRANT ALL ON FUNCTION public.validate_parent_gamer_roles() TO service_role;


--
-- Name: FUNCTION validate_participations_group(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_participations_group() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_participations_group() TO service_role;


--
-- Name: FUNCTION validate_products_location(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_products_location() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_products_location() TO service_role;


--
-- Name: FUNCTION validate_profile_spoken_languages(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_profile_spoken_languages() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_profile_spoken_languages() TO service_role;


--
-- Name: FUNCTION validate_site_details_location(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_site_details_location() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_site_details_location() TO service_role;


--
-- Name: FUNCTION verify_my_pin(p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.verify_my_pin(p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verify_my_pin(p_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.verify_my_pin(p_pin text) TO service_role;


--
-- Name: TABLE calendar_holidays; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.calendar_holidays TO anon;
GRANT ALL ON TABLE public.calendar_holidays TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.calendar_holidays TO authenticated;


--
-- Name: TABLE consent_acceptances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.consent_acceptances TO authenticated;
GRANT ALL ON TABLE public.consent_acceptances TO service_role;


--
-- Name: TABLE consent_document_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.consent_document_versions TO anon;
GRANT SELECT ON TABLE public.consent_document_versions TO authenticated;
GRANT ALL ON TABLE public.consent_document_versions TO service_role;


--
-- Name: TABLE consent_documents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.consent_documents TO anon;
GRANT SELECT ON TABLE public.consent_documents TO authenticated;
GRANT ALL ON TABLE public.consent_documents TO service_role;


--
-- Name: TABLE customer_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.customer_profiles TO anon;
GRANT ALL ON TABLE public.customer_profiles TO service_role;
GRANT SELECT ON TABLE public.customer_profiles TO authenticated;


--
-- Name: TABLE family_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.family_subscriptions TO anon;
GRANT ALL ON TABLE public.family_subscriptions TO service_role;
GRANT SELECT ON TABLE public.family_subscriptions TO authenticated;


--
-- Name: TABLE feedback_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.feedback_submissions TO anon;
GRANT ALL ON TABLE public.feedback_submissions TO service_role;
GRANT SELECT ON TABLE public.feedback_submissions TO authenticated;


--
-- Name: TABLE gamer_group_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gamer_group_notes TO service_role;


--
-- Name: TABLE gamer_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gamer_profiles TO anon;
GRANT ALL ON TABLE public.gamer_profiles TO service_role;
GRANT SELECT,UPDATE ON TABLE public.gamer_profiles TO authenticated;


--
-- Name: TABLE gedu_contract_acceptances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_contract_acceptances TO authenticated;
GRANT ALL ON TABLE public.gedu_contract_acceptances TO service_role;


--
-- Name: TABLE gedu_contract_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_contract_versions TO authenticated;
GRANT ALL ON TABLE public.gedu_contract_versions TO service_role;


--
-- Name: TABLE gedu_group_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_group_assignments TO anon;
GRANT ALL ON TABLE public.gedu_group_assignments TO service_role;
GRANT SELECT ON TABLE public.gedu_group_assignments TO authenticated;


--
-- Name: TABLE gedu_locations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_locations TO anon;
GRANT ALL ON TABLE public.gedu_locations TO service_role;
GRANT SELECT,INSERT,DELETE ON TABLE public.gedu_locations TO authenticated;


--
-- Name: TABLE gedu_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_profiles TO anon;
GRANT SELECT ON TABLE public.gedu_profiles TO authenticated;
GRANT ALL ON TABLE public.gedu_profiles TO service_role;


--
-- Name: TABLE group_session_images; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_session_images TO service_role;


--
-- Name: TABLE group_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_sessions TO service_role;


--
-- Name: TABLE holiday_calendars; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.holiday_calendars TO anon;
GRANT ALL ON TABLE public.holiday_calendars TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.holiday_calendars TO authenticated;


--
-- Name: TABLE locations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.locations TO anon;
GRANT ALL ON TABLE public.locations TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.locations TO authenticated;


--
-- Name: TABLE marketing_consent_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.marketing_consent_events TO authenticated;
GRANT ALL ON TABLE public.marketing_consent_events TO service_role;


--
-- Name: TABLE marketing_consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.marketing_consents TO authenticated;
GRANT ALL ON TABLE public.marketing_consents TO service_role;


--
-- Name: TABLE minecraft_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.minecraft_accounts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.minecraft_accounts TO authenticated;


--
-- Name: TABLE parent_gamer; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.parent_gamer TO anon;
GRANT ALL ON TABLE public.parent_gamer TO service_role;
GRANT SELECT,DELETE ON TABLE public.parent_gamer TO authenticated;


--
-- Name: TABLE participations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.participations TO anon;
GRANT ALL ON TABLE public.participations TO service_role;
GRANT SELECT ON TABLE public.participations TO authenticated;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.payments TO anon;
GRANT ALL ON TABLE public.payments TO service_role;
GRANT SELECT ON TABLE public.payments TO authenticated;


--
-- Name: TABLE postal_codes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.postal_codes TO anon;
GRANT SELECT ON TABLE public.postal_codes TO authenticated;
GRANT SELECT ON TABLE public.postal_codes TO service_role;


--
-- Name: TABLE product_groups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_groups TO anon;
GRANT ALL ON TABLE public.product_groups TO service_role;
GRANT SELECT ON TABLE public.product_groups TO authenticated;


--
-- Name: TABLE product_holiday_calendars; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_holiday_calendars TO anon;
GRANT ALL ON TABLE public.product_holiday_calendars TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_holiday_calendars TO authenticated;


--
-- Name: TABLE product_images; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_images TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_images TO service_role;


--
-- Name: TABLE product_marketing_consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_marketing_consents TO anon;
GRANT SELECT ON TABLE public.product_marketing_consents TO authenticated;
GRANT ALL ON TABLE public.product_marketing_consents TO service_role;


--
-- Name: TABLE product_prices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_prices TO anon;
GRANT ALL ON TABLE public.product_prices TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_prices TO authenticated;


--
-- Name: TABLE product_required_consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_required_consents TO anon;
GRANT SELECT ON TABLE public.product_required_consents TO authenticated;
GRANT ALL ON TABLE public.product_required_consents TO service_role;


--
-- Name: TABLE product_seat_counts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_seat_counts TO service_role;
GRANT SELECT ON TABLE public.product_seat_counts TO anon;
GRANT SELECT ON TABLE public.product_seat_counts TO authenticated;


--
-- Name: TABLE product_staff_details; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_staff_details TO authenticated;
GRANT ALL ON TABLE public.product_staff_details TO service_role;


--
-- Name: TABLE product_subscription_prices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_subscription_prices TO anon;
GRANT ALL ON TABLE public.product_subscription_prices TO service_role;


--
-- Name: TABLE product_translations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_translations TO anon;
GRANT ALL ON TABLE public.product_translations TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_translations TO authenticated;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.products TO authenticated;


--
-- Name: TABLE roblox_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.roblox_accounts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.roblox_accounts TO authenticated;


--
-- Name: TABLE schedule_slots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.schedule_slots TO anon;
GRANT ALL ON TABLE public.schedule_slots TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.schedule_slots TO authenticated;


--
-- Name: TABLE session_attendance; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.session_attendance TO service_role;


--
-- Name: TABLE site_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_details TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.site_details TO authenticated;


--
-- Name: TABLE site_staff_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_staff_details TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.site_staff_details TO authenticated;


--
-- Name: TABLE user_search_index; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.user_search_index TO authenticated;
GRANT SELECT ON TABLE public.user_search_index TO service_role;


--
-- Name: TABLE verification_email_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.verification_email_requests TO service_role;


--
-- Name: TABLE voice_private_zone_occupants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.voice_private_zone_occupants TO authenticated;
GRANT SELECT,INSERT,DELETE ON TABLE public.voice_private_zone_occupants TO service_role;


--
-- Name: TABLE voice_zones; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.voice_zones TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.voice_zones TO service_role;


--
-- Name: TABLE whatsapp_contacts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.whatsapp_contacts TO anon;
GRANT ALL ON TABLE public.whatsapp_contacts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.whatsapp_contacts TO authenticated;


--
-- Name: TABLE whatsapp_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.whatsapp_messages TO anon;
GRANT ALL ON TABLE public.whatsapp_messages TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--


