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
    'draft',
    'pending',
    'running',
    'completed',
    'cancelled',
    'expired'
);


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
    'draft',
    'pending',
    'running',
    'completed',
    'cancelled'
);


--
-- Name: product_topic; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_topic AS ENUM (
    'minecraft_java',
    'minecraft_education',
    'minecraft_bedrock',
    'fortnite',
    'webinar'
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
-- Name: admin_enroll_gamer(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_enroll_gamer(p_product_id uuid, p_gamer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type     public.product_type;
  v_customer_id      uuid;
  v_participation_id uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_type INTO v_product_type
    FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_product_type = 'consumer_club' THEN
    RAISE EXCEPTION 'admin enrollment is not supported for consumer clubs'
      USING ERRCODE = 'check_violation';
  END IF;

  -- One parent per gamer is the current model; where a gamer somehow has
  -- several links, the oldest wins so the choice is deterministic rather than
  -- whatever the planner returned. Multi-parent reckoning is future work.
  SELECT parent_id INTO v_customer_id
    FROM public.parent_gamer
    WHERE gamer_id = p_gamer_id
    ORDER BY created_at ASC
    LIMIT 1;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'gamer % has no linked parent', p_gamer_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- The partial unique index on (product_id, gamer_id) for non-reserving
  -- statuses is the source of truth for "already enrolled"; it raises 23505 and
  -- the route maps that to 409. Re-checking it here would be a race, not a
  -- safeguard.
  INSERT INTO public.participations (product_id, gamer_id, customer_id, status)
  VALUES (p_product_id, p_gamer_id, v_customer_id, 'active')
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'customer_id', v_customer_id
  );
END;
$$;


--
-- Name: FUNCTION admin_enroll_gamer(p_product_id uuid, p_gamer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_enroll_gamer(p_product_id uuid, p_gamer_id uuid) IS 'Admin-gated comp-enrollment: drops a gamer onto a non-consumer_club product with status=active, bypassing payment, seat caps and registration windows by design.';


--
-- Name: admin_remove_participation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row_product_id uuid;
  v_product_type   public.product_type;
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

  SELECT product_type INTO v_product_type
    FROM public.products WHERE id = p_product_id;
  IF v_product_type = 'consumer_club' THEN
    RAISE EXCEPTION 'admin removal is not supported for consumer clubs'
      USING ERRCODE = 'check_violation';
  END IF;

  -- family_subscriptions.participation_id is UNIQUE and stripe_subscription_id
  -- is NOT NULL, so the mere existence of a row means a live Stripe sub is
  -- linked to this participation.
  SELECT stripe_subscription_id INTO v_live_sub
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id;
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

COMMENT ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) IS 'Admin-gated un-enrollment. Refuses a participation that is not on the named product, a consumer_club product, or a participation with a live Stripe subscription; otherwise delegates to cancel_participation.';


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
    -- public: published and visible
    OR EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = p_product_id
        AND pr.status IN ('pending'::public.product_status, 'running'::public.product_status)
        AND pr.is_visible = true
    )
    -- enrolled gamer (child's own login) OR purchaser (parent), active/waitlisted
    OR EXISTS (
      SELECT 1 FROM public.participations p
      WHERE p.product_id = p_product_id
        AND (p.gamer_id = (SELECT auth.uid()) OR p.customer_id = (SELECT auth.uid()))
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
-- Name: confirm_paid_participation(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_paid_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_checkout_session_id text) RETURNS jsonb
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

  -- Pre-check the partial UNIQUE on (product_id, gamer_id): under the gate lock
  -- this decides the outcome, and the index itself is left as the backstop.
  SELECT id, status, stripe_checkout_session_id
    INTO v_conflict_id, v_conflict_status, v_conflict_session
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id   = p_gamer_id
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
    product_id, gamer_id, customer_id, status, stripe_checkout_session_id
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'active', p_checkout_session_id
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
-- Name: FUNCTION confirm_paid_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_checkout_session_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_checkout_session_id text) IS 'Creates the active participation for a paid signup once Stripe confirms payment. service_role only — the arguments come from Checkout Session metadata we wrote. Returns kind=confirmed with participation_id (idempotent=true when this same session already bought the seat), or kind=duplicate_payment with existing_participation_id when a different payment already put this gamer on this product.';


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
-- Name: create_gamer(uuid, uuid, text, text, date, public.gender_type, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type DEFAULT NULL::public.gender_type, p_minecraft_username text DEFAULT NULL::text, p_minecraft_uuid text DEFAULT NULL::text) RETURNS void
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

  -- Link to the parent. The validate_parent_gamer_on_insert trigger re-checks
  -- both roles, so this must run after the promote above.
  insert into public.parent_gamer (parent_id, gamer_id)
  values (p_parent_id, p_gamer_id);
end;
$$;


--
-- Name: create_participation(uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) RETURNS jsonb
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
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_gamer_id
      USING ERRCODE = 'check_violation';
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
      AND gamer_id = p_gamer_id
      AND status IN ('active', 'waitlisted', 'completed')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a participation on this product (status: %)', p_gamer_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Seat-count gate. Sits above the free / external branches so an explicit cap
  -- on a no-charge product (the schema permits it, incl. municipality clubs) is
  -- honored — earlier versions only checked the cap on paid signups, so a free
  -- product with seat_count=20 silently accepted the 21st signup.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_active_seats(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations (
      product_id, gamer_id, customer_id, status
    ) VALUES (
      p_product_id, p_gamer_id, p_customer_id, 'active'
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
      product_id, gamer_id, customer_id, status
    ) VALUES (
      p_product_id, p_gamer_id, p_customer_id, 'active'
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
-- Name: create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, integer, integer, text, boolean, text, timestamp with time zone, public.product_status, boolean, boolean, text, text, uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[], integer, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status DEFAULT 'draft'::public.product_status, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_image_path text DEFAULT NULL::text, p_padlet_url text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_refund_policy_days integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text) RETURNS uuid
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

  INSERT INTO public.products (
    product_type, billing_mode, topic,
    min_age, max_age, spoken_language_code, image_path, padlet_url,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    refund_policy_days, is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path, p_padlet_url,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_refund_policy_days, p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents
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
      NULLIF(v_translation->'long_description', 'null'::jsonb)
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

  RETURN v_product_id;
END;
$$;


--
-- Name: demote_to_waitlist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demote_to_waitlist(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id   UUID;
  v_product_type public.product_type;
  v_status       public.participation_status;
  v_now          TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- Same product-gate lock as before, now also reading the type it needs one
  -- statement later rather than issuing a second query for it.
  SELECT product_type INTO v_product_type
    FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Refused for the operation, not for the row's current state — so this
  -- precedes the idempotent noop below, the way both siblings refuse a consumer
  -- club before looking at anything else. There is no demotion of a consumer
  -- club that is correct to perform, retried or otherwise.
  IF v_product_type = 'consumer_club' THEN
    RAISE EXCEPTION 'demotion to the waitlist is not supported for consumer clubs'
      USING ERRCODE = 'check_violation';
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

COMMENT ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) IS 'Admin-gated demotion of an active participation to the back of the product waitlist, under the product gate lock. Refuses consumer clubs: those are the only subscription-billed type, and a waitlisted row carrying a live Stripe subscription could be deleted by the parent via leave_my_waitlist_spot, cascading family_subscriptions and orphaning the subscription.';


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

  IF v_status = 'draft' THEN     RETURN 'draft'; END IF;
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
    'padlet_url',   p.padlet_url,
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
        'gamer_count',   (
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
                         'gamer_id',           part.gamer_id,
                         'first_name',         gmp.first_name,
                         'date_of_birth',      gprof.date_of_birth,
                         'gender',             gprof.gender,
                         'minecraft_username', mca.minecraft_username,
                         'minecraft_uuid',     mca.minecraft_uuid,
                         'parent_email',       (
                           SELECT pp.email
                             FROM parent_gamer pgm
                             JOIN profiles pp ON pp.id = pgm.parent_id
                            WHERE pgm.gamer_id = part.gamer_id
                            ORDER BY pgm.created_at ASC NULLS LAST,
                                     pgm.id           ASC
                            LIMIT 1
                         )
                       )
                       ORDER BY gmp.first_name
                     )
                FROM participations part
                JOIN profiles gmp              ON gmp.id        = part.gamer_id
                LEFT JOIN gamer_profiles gprof  ON gprof.user_id = part.gamer_id
                LEFT JOIN minecraft_accounts mca ON mca.user_id  = part.gamer_id
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
  PERFORM public.assert_role('gedu');

  -- v1 shows a gedu only their OWN group's feed. Peer-group feeds are not a
  -- schema restriction — relaxing this to "any group on a product the caller is
  -- assigned to" is a change to this predicate alone, and nothing downstream
  -- assumes the caller teaches the group they are reading.
  IF NOT public.gedu_teaches_group(p_group_id) THEN
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
    -- Gedu-only, and now stored somewhere only this function and an admin can
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
  -- so the client can tell a child who joined last week from one who has been
  -- here all term.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'gamer_id',           part.gamer_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so this is non-null in practice and the wire contract says so.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.gamer_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        )
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.gamer_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.gamer_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.gamer_id
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
        'did_not_run',      s.did_not_run,
        'needs_substitute', s.needs_substitute,
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- Sparse map keyed by gamer id. A roster member absent from this object
        -- is UNMARKED, which is a different claim from 'absent'.
        'attendance', COALESCE((
          SELECT jsonb_object_agg(a.gamer_id, a.status)
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

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS 'One round trip for a gedu group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map. Contains no schedule expansion — the client owns the calendar math.';


--
-- Name: get_my_assigned_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(product_id uuid, group_id uuid, timezone text, start_date date, end_date date, padlet_url text, is_remote boolean, product_type public.product_type, product_translations jsonb, schedule_slots jsonb, group_count integer, gamer_count integer)
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
    p.padlet_url    AS padlet_url,
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
    ) AS gamer_count
  FROM gedu_group_assignments a
  JOIN products p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id;
END;
$$;


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
    spoken_languages text[] DEFAULT '{}'::text[] NOT NULL,
    locale text,
    first_name text NOT NULL,
    last_name text DEFAULT ''::text NOT NULL,
    home_location_id uuid,
    CONSTRAINT profiles_first_name_len CHECK (((char_length(first_name) >= 2) AND (char_length(first_name) <= 32))),
    CONSTRAINT profiles_last_name_len CHECK ((char_length(last_name) <= 32)),
    CONSTRAINT profiles_phone_e164 CHECK ((phone ~ '^\d{7,15}$'::text))
);


--
-- Name: COLUMN profiles.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.email IS 'Email address (NOT NULL for every role). Gamer accounts carry a generated synthetic <token>@gamer.sogverse.internal address until/unless replaced by a real one.';


--
-- Name: COLUMN profiles.spoken_languages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.spoken_languages IS 'Human languages the user speaks (codes from public.spoken_languages). Used for matching gamers/gedus to clubs. Distinct from locale, which controls UI translation.';


--
-- Name: COLUMN profiles.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.locale IS 'BCP-47-style UI locale code (en, fi, sv, ...). Null = auto-detect from cookie/Accept-Language. Distinct from spoken_languages, which is the user''s human-language fluency.';


--
-- Name: COLUMN profiles.home_location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.home_location_id IS 'Optional municipality-level locations row: where this parent''s family lives. ON DELETE SET NULL by choice — a merged or retired reference row empties this reference rather than blocking its removal, at the cost of silently clearing the parent''s pick. Acceptable only because the field is optional and carries no entitlement.';


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
               'product_id',         a.product_id,
               'group_id',           a.group_id,
               'group_name',         g.name,
               'group_gamer_count',  roster.roster_size,
               'site_name',          site.name,
               'attention_count',    COALESCE(owed.owed_count, 0)
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
            -- why the write validator below has no epoch floor of its own.
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
           -- "Needs attention" means exactly this: some of the CURRENT roster
           -- has no answer yet. Measured against the current roster, never
           -- against the stored map's keys — which is why a child joining a
           -- long-running group reopens previously-complete sessions. That is
           -- the honest reading and it is chosen with eyes open.
           AND (
             SELECT COUNT(*)
               FROM public.session_attendance att
               JOIN public.group_sessions gs2 ON gs2.id = att.session_id
               JOIN public.participations part2
                 ON part2.gamer_id = att.gamer_id
                AND part2.group_id = g.id
                AND part2.status   = 'active'::public.participation_status
              WHERE gs2.group_id     = g.id
                AND gs2.session_date = occurrence.session_date
           ) < roster.roster_size
      ) AS owed ON true

     WHERE a.gedu_id = v_uid
  ), '[]'::jsonb);
END;
$$;


--
-- Name: FUNCTION get_my_gedu_assignment_summaries(p_epoch_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS 'One row per gedu assignment for the dashboard cards: group name, that group''s gamer count, the venue name on in-person products, and how many past sessions still owe attendance. The enforcement epoch travels in as an argument because it is a code constant, not a column.';


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
      OR p.gamer_id = (SELECT auth.uid())
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
          OR mine.gamer_id = (SELECT auth.uid()));
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
                     'id',                       p.id,
                     'gamer_id',                 p.gamer_id,
                     'gamer_first_name',         gmp.first_name,
                     'gamer_date_of_birth',      gprof.date_of_birth,
                     'gamer_gender',             gprof.gender,
                     'gamer_minecraft_username', mca.minecraft_username,
                     'gamer_minecraft_uuid',     mca.minecraft_uuid,
                     'gamer_parent_first_name',  parent.first_name,
                     'gamer_parent_last_name',   parent.last_name,
                     'status',                   p.status,
                     'signed_up_at',             p.signed_up_at
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.gamer_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.gamer_id
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
             'id',                       p.id,
             'gamer_id',                 p.gamer_id,
             'gamer_first_name',         gmp.first_name,
             'gamer_date_of_birth',      gprof.date_of_birth,
             'gamer_gender',             gprof.gender,
             'gamer_minecraft_username', mca.minecraft_username,
             'gamer_minecraft_uuid',     mca.minecraft_uuid,
             'gamer_parent_first_name',  parent.first_name,
             'gamer_parent_last_name',   parent.last_name,
             'status',                   p.status,
             'signed_up_at',             p.signed_up_at
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.gamer_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.gamer_id
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
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                       p.id,
             'gamer_id',                 p.gamer_id,
             'gamer_first_name',         gmp.first_name,
             'gamer_date_of_birth',      gprof.date_of_birth,
             'gamer_gender',             gprof.gender,
             'gamer_minecraft_username', mca.minecraft_username,
             'gamer_minecraft_uuid',     mca.minecraft_uuid,
             'gamer_parent_first_name',  parent.first_name,
             'gamer_parent_last_name',   parent.last_name,
             'status',                   p.status,
             'signed_up_at',             p.signed_up_at
           )
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.gamer_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.gamer_id
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
  v_gamer_id       UUID;
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

  SELECT product_id, gamer_id, customer_id, status, waitlisted_at
    INTO v_product_id, v_gamer_id, v_customer_id, v_status, v_waitlisted_at
    FROM public.participations
    WHERE id = p_participation_id;

  -- Unknown row, not waitlisted, or caller doesn't own it -> no position.
  -- Owner = the purchasing parent (customer) or the gamer themselves. Returning
  -- NULL rather than raising avoids leaking whether the id exists.
  IF NOT FOUND
     OR v_status <> 'waitlisted'
     OR (v_uid <> v_customer_id AND v_uid <> v_gamer_id) THEN
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
    AS $$
DECLARE
  profile_first_name TEXT;
  profile_last_name  TEXT;
BEGIN
  profile_first_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    'New User'
  );

  profile_last_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    ''
  );

  INSERT INTO public.profiles (id, email, role, first_name, last_name)
  VALUES (NEW.id, NEW.email, 'customer', profile_first_name, profile_last_name);

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;


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
       AND (p.customer_id = (SELECT auth.uid()) OR p.gamer_id = (SELECT auth.uid()))
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
       AND (p.customer_id = (SELECT auth.uid()) OR p.gamer_id = (SELECT auth.uid()))
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
        and p.gamer_id = (select auth.uid())
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
-- Name: join_product_waitlist(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_product_waitlist(p_product_id uuid, p_gamer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('customer');

  -- Everything else — product lock, parent-of-gamer check, waitlist_enabled
  -- gate, idempotency, the clock_timestamp() ordering stamp — is unchanged and
  -- lives in the engine. This function's whole job is authorization plus
  -- pinning the actor to the session.
  RETURN public.join_waitlist(p_product_id, p_gamer_id, (SELECT auth.uid()));
END;
$$;


--
-- Name: FUNCTION join_product_waitlist(p_product_id uuid, p_gamer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_gamer_id uuid) IS 'Guarded, authenticated-facing entry point for joining a product waitlist. The customer is auth.uid(); the parent-of-gamer check lives in join_waitlist.';


--
-- Name: join_waitlist(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid) RETURNS jsonb
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

  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_gamer_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_product.waitlist_enabled THEN
    RAISE EXCEPTION 'waitlist is not enabled for this product'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency: existing waitlisted/reserving/active row → return it as-is.
  SELECT id, waitlisted_at, status
    INTO v_existing_id, v_existing_ts, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
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
      'status', v_existing_status::text
    );
  END IF;

  -- Stamp the join time; order is derived from it, never stored as a rank.
  -- clock_timestamp(), NOT now(): now() is transaction_timestamp() (frozen at
  -- transaction start), so concurrent joins serialized on the gate lock can
  -- carry equal/inverted stamps and both compute rank 1. clock_timestamp()
  -- reads the wall clock at this statement — which runs under the lock, after
  -- the prior joiner committed — so stamps are monotonic with real join order.
  v_now := clock_timestamp();
  INSERT INTO public.participations (
    product_id, gamer_id, customer_id, status, waitlisted_at
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'waitlisted', v_now
  )
  RETURNING id INTO v_participation_id;

  SELECT COUNT(*) INTO v_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted'
      AND (waitlisted_at < v_now
           OR (waitlisted_at = v_now AND id <= v_participation_id));

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_position,
    'status', 'waitlisted'
  );
END;
$$;


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
  UPDATE public.participations
     SET status = 'active',
         group_id = p_group_id,
         waitlisted_at = NULL
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
-- Name: record_attendance(uuid, date, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_gamer_id uuid, p_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_starts_at  timestamptz;
  v_status     text := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_uid        uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  IF NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Authorize the TARGET as well as the actor: the child must actually be on
  -- this group's roster. Without this, an assigned gedu could aim a mark at any
  -- gamer id in the system.
  IF NOT EXISTS (
    SELECT 1
      FROM public.participations part
     WHERE part.group_id = p_group_id
       AND part.gamer_id = p_gamer_id
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
  -- because there is nothing yet to have attended.
  IF v_starts_at > now() THEN
    RAISE EXCEPTION 'Attendance can only be recorded once the session has started'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status IS NULL THEN
    DELETE FROM public.session_attendance
     WHERE session_id = v_session_id AND gamer_id = p_gamer_id;

    RETURN jsonb_build_object(
      'session_id', v_session_id,
      'gamer_id',   p_gamer_id,
      'status',     NULL
    );
  END IF;

  INSERT INTO public.session_attendance (
    session_id, gamer_id, status, recorded_by
  )
  VALUES (v_session_id, p_gamer_id, v_status, v_uid)
  ON CONFLICT (session_id, gamer_id) DO UPDATE
    SET status      = EXCLUDED.status,
        recorded_by = EXCLUDED.recorded_by,
        recorded_at = now();

  -- The session's audit trail follows the marks: recording attendance IS a
  -- write to the session, even when neither note changed.
  UPDATE public.group_sessions
     SET updated_by = v_uid, updated_at = now()
   WHERE id = v_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'gamer_id',   p_gamer_id,
    'status',     v_status
  );
END;
$$;


--
-- Name: FUNCTION record_attendance(p_group_id uuid, p_session_date date, p_gamer_id uuid, p_status text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_gamer_id uuid, p_status text) IS 'Record (or, with a NULL status, clear) ONE child''s attendance mark for one session. Per-mark so concurrent gedus cannot clobber each other; marks open at the session''s scheduled start (roll call during the session is the standard pattern) and never before; authorizes both the calling gedu and the target child.';


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
-- Name: register_gedu(uuid, text, text, text, text, text[], uuid[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages text[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text) RETURNS void
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
END;
$$;


--
-- Name: search_locations(text, public.location_type[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_locations(p_query text, p_types public.location_type[] DEFAULT NULL::public.location_type[], p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
WITH RECURSIVE
probe AS (
  SELECT
    folded.needle,
    -- LIKE metacharacters in the needle are escaped, not stripped: a user typing
    -- "%" should find nothing rather than everything.
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
  SELECT
    l.id, l.name, l.name_i18n, l.type, l.parent_id, l.country_code, l.external_code,
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
),
page AS (
  SELECT m.*
    FROM matched m
   -- A total order, so the page is stable: rank, then broadest level first,
   -- then name, then id to break the homonym ties France is full of.
   --
   -- Breadth is spelled out rather than taken from the enum's declared order,
   -- which sorts municipality before district and is therefore backwards for
   -- France, where a district IS the departement above the communes. Ordering
   -- by the enum buried all nine 'haute' departements behind 41 communes, past
   -- the default page of 20 — and search does not paginate, so they could not
   -- be reached at all.
   ORDER BY m.match_rank,
            CASE m.type
             WHEN 'country'      THEN 0
             WHEN 'region'       THEN 1
             WHEN 'district'     THEN 2
             WHEN 'municipality' THEN 3
             ELSE 4
           END,
            m.name, m.id
   LIMIT (SELECT cap FROM probe)
),
-- The chain of every hit on this page, at most `cap` rows walking at most a
-- handful of levels. Bounded by depth as well as by the parent FK in case a
-- hand-made row ever forms a cycle.
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
      ) ORDER BY p.match_rank,
                 CASE p.type
             WHEN 'country'      THEN 0
             WHEN 'region'       THEN 1
             WHEN 'district'     THEN 2
             WHEN 'municipality' THEN 3
             ELSE 4
           END,
                 p.name, p.id
    )
      FROM page p
      LEFT JOIN chains c ON c.anchor_id = p.id
  ), '[]'::jsonb)
);
$$;


--
-- Name: FUNCTION search_locations(p_query text, p_types public.location_type[], p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer) IS 'Cross-country location search: diacritic-insensitive both ways, matching canonical names, name_i18n alternates and official codes. Returns {total, results[]} where results carry each hit''s ancestor chain nearest-first, ranked exact > term-prefix > infix and capped server-side. SECURITY INVOKER, so the caller''s RLS on locations applies unchanged; needles shorter than two characters return an empty result without reading the table.';


--
-- Name: set_gedu_verified(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gedu_verified(p_gedu_id uuid, p_verified boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_verified: % is not a gedu', p_gedu_id;
  END IF;

  UPDATE public.gedu_profiles
  SET verified    = p_verified,
      verified_at = CASE WHEN p_verified THEN now() ELSE NULL END,
      verified_by = CASE WHEN p_verified THEN (SELECT auth.uid()) ELSE NULL END
  WHERE user_id = p_gedu_id;
END;
$$;


--
-- Name: set_group_member_minecraft(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_group_member_minecraft(p_gamer_id uuid, p_minecraft_username text, p_minecraft_uuid text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_uuid     text;
BEGIN
  PERFORM public.assert_role('gedu');

  -- Actor AND target: the child must be actively participating in a group the
  -- caller is assigned to. A gedu may fix a username for the children they
  -- teach and for nobody else.
  IF NOT EXISTS (
    SELECT 1
      FROM public.participations part
      JOIN public.gedu_group_assignments ga ON ga.group_id = part.group_id
     WHERE part.gamer_id = p_gamer_id
       AND part.status   = 'active'::public.participation_status
       AND ga.gedu_id    = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_username := NULLIF(btrim(COALESCE(p_minecraft_username, '')), '');
  -- Clearing the username clears the uuid with it: a uuid without a name is a
  -- verified link to nothing.
  v_uuid := CASE WHEN v_username IS NULL
                 THEN NULL
                 ELSE NULLIF(btrim(COALESCE(p_minecraft_uuid, '')), '')
            END;

  INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
  VALUES (p_gamer_id, v_username, v_uuid)
  ON CONFLICT (user_id) DO UPDATE
    SET minecraft_username = EXCLUDED.minecraft_username,
        minecraft_uuid     = EXCLUDED.minecraft_uuid;

  RETURN jsonb_build_object(
    'gamer_id',           p_gamer_id,
    'minecraft_username', v_username,
    'minecraft_uuid',     v_uuid
  );
END;
$$;


--
-- Name: FUNCTION set_group_member_minecraft(p_gamer_id uuid, p_minecraft_username text, p_minecraft_uuid text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_group_member_minecraft(p_gamer_id uuid, p_minecraft_username text, p_minecraft_uuid text) IS 'Set a group member''s Minecraft username + resolved UUID, scoped to gamers actively participating in a group the calling gedu teaches. The Mojang lookup happens in the calling route, so a successful edit lands verified.';


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
  PERFORM public.assert_role('gedu');

  IF NOT public.gedu_teaches_group(p_group_id) THEN
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

COMMENT ON FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) IS 'Write a group''s standing family-facing and gedu notes. Gedu-gated on the group assignment. Last-write-wins.';


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
  PERFORM public.assert_role('gedu');

  IF NOT public.gedu_teaches_group(p_group_id) THEN
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

COMMENT ON FUNCTION public.set_group_session_notes(p_group_id uuid, p_session_date date, p_report text, p_gedu_note text) IS 'Write the family-facing report and the gedu note for one session, materializing the row if needed. Gedu-gated on the group assignment. Last-write-wins.';


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
  PERFORM public.assert_role('gedu');

  IF NOT EXISTS (
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

COMMENT ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) IS 'Write a site''s shared family note and its gedu note. The venue ADDRESS is not a parameter and is never touched — it belongs to the location record and is an admin''s to edit. Authorized by the caller teaching a group on an in-person product at that site. Last-write-wins on the notes, across products.';


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
-- Name: update_product(uuid, public.billing_mode, jsonb, public.product_topic, integer, integer, text, boolean, text, timestamp with time zone, boolean, boolean, text, text, uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[], integer, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_image_path text DEFAULT NULL::text, p_padlet_url text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_refund_policy_days integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
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

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_id) THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.products SET
    billing_mode             = p_billing_mode,
    topic                    = p_topic,
    min_age                  = p_min_age,
    max_age                  = p_max_age,
    spoken_language_code     = p_spoken_language_code,
    image_path               = p_image_path,
    padlet_url               = p_padlet_url,
    location_id              = p_location_id,
    is_remote                = p_is_remote,
    signup_threshold         = p_signup_threshold,
    start_date               = p_start_date,
    end_date                 = p_end_date,
    timezone                 = p_timezone,
    seat_count               = p_seat_count,
    waitlist_enabled         = p_waitlist_enabled,
    registration_opens_at    = p_registration_opens_at,
    refund_policy_days       = p_refund_policy_days,
    is_visible               = p_is_visible,
    primary_gedu_fee_cents   = p_primary_gedu_fee_cents,
    assistant_gedu_fee_cents = p_assistant_gedu_fee_cents,
    municipality_fee_cents   = p_municipality_fee_cents
  WHERE id = p_id;

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
      NULLIF(v_translation->'long_description', 'null'::jsonb)
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

  RETURN p_id;
END;
$$;


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
    -- Reject codes not in the spoken_languages reference table
    IF NOT (NEW.spoken_languages <@ ARRAY(SELECT code FROM public.spoken_languages)) THEN
      RAISE EXCEPTION 'Invalid language code in spoken_languages array'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Reject duplicate codes
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
-- Name: gamer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamer_profiles (
    user_id uuid NOT NULL,
    date_of_birth date NOT NULL,
    gender public.gender_type,
    CONSTRAINT gamer_profiles_date_of_birth_check CHECK ((date_of_birth <= CURRENT_DATE))
);


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
    verified boolean DEFAULT false NOT NULL,
    verified_at timestamp with time zone,
    verified_by uuid
);


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
    did_not_run boolean DEFAULT false NOT NULL,
    needs_substitute boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_group_sessions_ends_after_starts CHECK ((ends_at > starts_at))
);


--
-- Name: TABLE group_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.group_sessions IS 'Lazily materialized session records: one row per (group, product-local date), written only when a report, a note or an attendance mark needs somewhere to live. starts_at/ends_at are a snapshot of the schedule at materialization and are never re-derived.';


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
    gamer_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    status public.participation_status NOT NULL,
    signed_up_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    waitlisted_at timestamp with time zone,
    stripe_checkout_session_id text,
    CONSTRAINT chk_participations_no_self_signup CHECK ((gamer_id <> customer_id)),
    CONSTRAINT chk_participations_waitlisted_has_timestamp CHECK (((status <> 'waitlisted'::public.participation_status) OR (waitlisted_at IS NOT NULL)))
);


--
-- Name: COLUMN participations.stripe_checkout_session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.stripe_checkout_session_id IS 'Stripe Checkout Session that paid for this seat. NULL for no-charge seats (free, municipality, admin enrollment, waitlist) and for rows predating the create-on-confirmation flow.';


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

COMMENT ON COLUMN public.product_staff_details.material_url IS 'Gedu/admin-only lesson-material link, surfaced in the gedu group workspace. Never rendered to parents or gamers. Distinct from products.padlet_url, which is the (legacy) family-facing link.';


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
    long_description jsonb,
    CONSTRAINT product_translations_long_description_check CHECK (((long_description IS NULL) OR (jsonb_typeof(long_description) = 'array'::text))),
    CONSTRAINT product_translations_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_type public.product_type NOT NULL,
    billing_mode public.billing_mode NOT NULL,
    min_age integer NOT NULL,
    max_age integer NOT NULL,
    spoken_language_code text NOT NULL,
    image_path text,
    padlet_url text,
    location_id uuid,
    is_remote boolean NOT NULL,
    status public.product_status DEFAULT 'draft'::public.product_status NOT NULL,
    signup_threshold integer,
    start_date date,
    end_date date,
    timezone text NOT NULL,
    seat_count integer,
    waitlist_enabled boolean DEFAULT true NOT NULL,
    registration_opens_at timestamp with time zone NOT NULL,
    refund_policy_days integer,
    is_visible boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    topic public.product_topic NOT NULL,
    primary_gedu_fee_cents integer,
    assistant_gedu_fee_cents integer,
    municipality_fee_cents integer,
    CONSTRAINT chk_products_age_range CHECK ((max_age >= min_age)),
    CONSTRAINT chk_products_date_range CHECK (((start_date IS NULL) OR (end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT chk_products_draft_implies_hidden CHECK (((status <> 'draft'::public.product_status) OR (is_visible = false))),
    CONSTRAINT chk_products_event_single_date CHECK (((product_type <> 'event'::public.product_type) OR (NOT (end_date IS DISTINCT FROM start_date)))),
    CONSTRAINT chk_products_external_contract_muni CHECK (((billing_mode <> 'external_contract'::public.billing_mode) OR (product_type = 'municipality_club'::public.product_type))),
    CONSTRAINT chk_products_in_person_has_location CHECK (((is_remote = true) OR (location_id IS NOT NULL))),
    CONSTRAINT chk_products_municipality_fee_only_for_muni CHECK (((municipality_fee_cents IS NULL) OR (product_type = 'municipality_club'::public.product_type))),
    CONSTRAINT chk_products_non_consumer_has_end_date CHECK (((product_type = 'consumer_club'::public.product_type) OR (status = 'draft'::public.product_status) OR (end_date IS NOT NULL))),
    CONSTRAINT chk_products_online_muni_has_location CHECK (((NOT ((is_remote = true) AND (product_type = 'municipality_club'::public.product_type))) OR (location_id IS NOT NULL))),
    CONSTRAINT chk_products_online_non_muni_no_location CHECK (((NOT ((is_remote = true) AND (product_type <> 'municipality_club'::public.product_type))) OR (location_id IS NULL))),
    CONSTRAINT chk_products_refund_policy_only_for_single_payment CHECK (((refund_policy_days IS NULL) OR (product_type = ANY (ARRAY['camp'::public.product_type, 'event'::public.product_type])))),
    CONSTRAINT chk_products_running_has_start_date CHECK (((status <> 'running'::public.product_status) OR (start_date IS NOT NULL))),
    CONSTRAINT chk_products_threshold_within_seat_count CHECK (((signup_threshold IS NULL) OR (seat_count IS NULL) OR (signup_threshold <= seat_count))),
    CONSTRAINT products_assistant_gedu_fee_cents_check CHECK (((assistant_gedu_fee_cents IS NULL) OR (assistant_gedu_fee_cents >= 0))),
    CONSTRAINT products_max_age_check CHECK ((max_age >= 0)),
    CONSTRAINT products_min_age_check CHECK ((min_age >= 0)),
    CONSTRAINT products_municipality_fee_cents_check CHECK (((municipality_fee_cents IS NULL) OR (municipality_fee_cents > 0))),
    CONSTRAINT products_primary_gedu_fee_cents_check CHECK (((primary_gedu_fee_cents IS NULL) OR (primary_gedu_fee_cents >= 0))),
    CONSTRAINT products_refund_policy_days_check CHECK (((refund_policy_days IS NULL) OR (refund_policy_days >= 0))),
    CONSTRAINT products_seat_count_check CHECK (((seat_count IS NULL) OR (seat_count >= 1))),
    CONSTRAINT products_signup_threshold_check CHECK (((signup_threshold IS NULL) OR (signup_threshold >= 1)))
);


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
    gamer_id uuid NOT NULL,
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
-- Name: spoken_languages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spoken_languages (
    code text NOT NULL,
    name text NOT NULL
);


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
-- Name: gamer_profiles gamer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_profiles
    ADD CONSTRAINT gamer_profiles_pkey PRIMARY KEY (user_id);


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
-- Name: spoken_languages languages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spoken_languages
    ADD CONSTRAINT languages_pkey PRIMARY KEY (code);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


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
-- Name: product_prices product_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_pkey PRIMARY KEY (product_id, currency);


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
-- Name: session_attendance session_attendance_session_gamer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_session_gamer_key UNIQUE (session_id, gamer_id);


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
-- Name: group_sessions_group_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_sessions_group_date_idx ON public.group_sessions USING btree (group_id, session_date DESC);


--
-- Name: idx_calendar_holidays_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_holidays_date ON public.calendar_holidays USING btree (date);


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
-- Name: idx_participations_gamer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_gamer ON public.participations USING btree (gamer_id);


--
-- Name: idx_participations_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_group ON public.participations USING btree (group_id) WHERE (group_id IS NOT NULL);


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
-- Name: session_attendance_gamer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_attendance_gamer_idx ON public.session_attendance USING btree (gamer_id);


--
-- Name: session_attendance_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_attendance_session_idx ON public.session_attendance USING btree (session_id);


--
-- Name: uq_locations_external_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_locations_external_code ON public.locations USING btree (country_code, type, external_code) WHERE (external_code IS NOT NULL);


--
-- Name: uq_participations_active_or_waitlisted; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_participations_active_or_waitlisted ON public.participations USING btree (product_id, gamer_id) WHERE (status = ANY (ARRAY['active'::public.participation_status, 'waitlisted'::public.participation_status, 'completed'::public.participation_status]));


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
-- Name: products trg_products_seed_seat_counts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_seed_seat_counts AFTER INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.trg_seed_product_seat_counts();


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
-- Name: gamer_profiles gamer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_profiles
    ADD CONSTRAINT gamer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


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
-- Name: gedu_profiles gedu_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_profiles
    ADD CONSTRAINT gedu_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gedu_profiles gedu_profiles_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_profiles
    ADD CONSTRAINT gedu_profiles_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


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
-- Name: participations participations_gamer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_gamer_id_fkey FOREIGN KEY (gamer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: participations participations_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE SET NULL;


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
-- Name: product_prices product_prices_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


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
-- Name: products products_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE RESTRICT;


--
-- Name: products products_spoken_language_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_spoken_language_code_fkey FOREIGN KEY (spoken_language_code) REFERENCES public.spoken_languages(code) ON DELETE RESTRICT;


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
-- Name: schedule_slots schedule_slots_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_slots
    ADD CONSTRAINT schedule_slots_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: session_attendance session_attendance_gamer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_gamer_id_fkey FOREIGN KEY (gamer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


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
-- Name: spoken_languages admin_manage_spoken_languages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_spoken_languages ON public.spoken_languages TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: locations anon_read_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_read_locations ON public.locations FOR SELECT TO anon USING (true);


--
-- Name: spoken_languages anyone_can_read_spoken_languages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anyone_can_read_spoken_languages ON public.spoken_languages FOR SELECT TO authenticated, anon USING (true);


--
-- Name: locations authenticated_read_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read_locations ON public.locations FOR SELECT TO authenticated USING (true);


--
-- Name: calendar_holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_holidays ENABLE ROW LEVEL SECURITY;

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
-- Name: customer_profiles customers_read_own_customer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_own_customer_profile ON public.customer_profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


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
-- Name: gamer_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gamer_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: participations gamer_select_own_participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamer_select_own_participations ON public.participations FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gamer'::public.user_role) AND (gamer_id = ( SELECT auth.uid() AS uid))));


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
-- Name: gedu_profiles gedus_read_own_gedu_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_own_gedu_profile ON public.gedu_profiles FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


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
-- Name: product_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: product_holiday_calendars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_holiday_calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: product_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

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
-- Name: product_holiday_calendars read_product_holiday_calendars_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_holiday_calendars_via_product ON public.product_holiday_calendars FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: product_prices read_product_prices_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_prices_via_product ON public.product_prices FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


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
-- Name: schedule_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: session_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: site_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_details ENABLE ROW LEVEL SECURITY;

--
-- Name: site_staff_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_staff_details ENABLE ROW LEVEL SECURITY;

--
-- Name: spoken_languages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.spoken_languages ENABLE ROW LEVEL SECURITY;

--
-- Name: minecraft_accounts users_insert_own_minecraft_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_minecraft_account ON public.minecraft_accounts FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: feedback_submissions users_read_own_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_feedback ON public.feedback_submissions FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: minecraft_accounts users_read_own_minecraft_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_minecraft_account ON public.minecraft_accounts FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: minecraft_accounts users_update_own_minecraft_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_minecraft_account ON public.minecraft_accounts FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: profiles users_update_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_profile ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK (((id = ( SELECT auth.uid() AS uid)) AND (role = ( SELECT public.get_user_role() AS get_user_role))));


--
-- Name: profiles users_view_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_view_own_profile ON public.profiles FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));


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
-- Name: FUNCTION admin_enroll_gamer(p_product_id uuid, p_gamer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_enroll_gamer(p_product_id uuid, p_gamer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_enroll_gamer(p_product_id uuid, p_gamer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_enroll_gamer(p_product_id uuid, p_gamer_id uuid) TO service_role;


--
-- Name: FUNCTION admin_remove_participation(p_product_id uuid, p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) TO service_role;


--
-- Name: FUNCTION apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) TO service_role;


--
-- Name: FUNCTION assert_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_admin() TO authenticated;
GRANT ALL ON FUNCTION public.assert_admin() TO service_role;


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
-- Name: FUNCTION confirm_paid_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_checkout_session_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_checkout_session_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_checkout_session_id text) TO service_role;


--
-- Name: FUNCTION count_active_seats(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_active_seats(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_active_seats(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text) TO service_role;


--
-- Name: FUNCTION create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) TO service_role;


--
-- Name: FUNCTION create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text) TO authenticated;
GRANT ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text) TO service_role;


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
-- Name: FUNCTION get_my_assigned_products(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO service_role;


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
-- Name: FUNCTION join_product_waitlist(p_product_id uuid, p_gamer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_gamer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_gamer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_gamer_id uuid) TO service_role;


--
-- Name: FUNCTION join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid) FROM PUBLIC;


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
-- Name: FUNCTION record_attendance(p_group_id uuid, p_session_date date, p_gamer_id uuid, p_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_gamer_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_gamer_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.record_attendance(p_group_id uuid, p_session_date date, p_gamer_id uuid, p_status text) TO service_role;


--
-- Name: FUNCTION refresh_product_seat_counts(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_product_seat_counts(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_product_seat_counts(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages text[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages text[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages text[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text) TO service_role;


--
-- Name: FUNCTION search_locations(p_query text, p_types public.location_type[], p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer) TO service_role;


--
-- Name: FUNCTION set_gedu_verified(p_gedu_id uuid, p_verified boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_gedu_verified(p_gedu_id uuid, p_verified boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_gedu_verified(p_gedu_id uuid, p_verified boolean) TO authenticated;


--
-- Name: FUNCTION set_group_member_minecraft(p_gamer_id uuid, p_minecraft_username text, p_minecraft_uuid text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_group_member_minecraft(p_gamer_id uuid, p_minecraft_username text, p_minecraft_uuid text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_member_minecraft(p_gamer_id uuid, p_minecraft_username text, p_minecraft_uuid text) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_member_minecraft(p_gamer_id uuid, p_minecraft_username text, p_minecraft_uuid text) TO service_role;


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
-- Name: FUNCTION set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) TO authenticated;
GRANT ALL ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) TO service_role;


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
-- Name: FUNCTION update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text) TO authenticated;
GRANT ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text) TO service_role;


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
-- Name: TABLE gamer_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gamer_profiles TO anon;
GRANT ALL ON TABLE public.gamer_profiles TO service_role;
GRANT SELECT,UPDATE ON TABLE public.gamer_profiles TO authenticated;


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
-- Name: TABLE product_prices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_prices TO anon;
GRANT ALL ON TABLE public.product_prices TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_prices TO authenticated;


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
-- Name: TABLE spoken_languages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.spoken_languages TO anon;
GRANT ALL ON TABLE public.spoken_languages TO service_role;
GRANT SELECT ON TABLE public.spoken_languages TO authenticated;


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


