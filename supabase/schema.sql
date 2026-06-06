--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.2

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
    'minecraft',
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
-- Name: refund_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.refund_reason AS ENUM (
    'session_cancelled_in_window',
    'admin_refund',
    'product_cancelled',
    'subscription_item_removed',
    'subscription_period_proration',
    'duplicate_payment'
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
-- Name: _list_rpc_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_rpc_access() RETURNS TABLE(function_name text, authenticated_access boolean, anon_access boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    p.proname::text AS function_name,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_access,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_access
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prorettype != 'pg_catalog.trigger'::pg_catalog.regtype;
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
-- Name: _list_table_grants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_table_grants() RETURNS TABLE(table_name text, privilege_type text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT table_name::text, privilege_type::text
  FROM information_schema.table_privileges
  WHERE grantee = 'authenticated'
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
  IF (SELECT get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

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
-- Name: can_read_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_product(p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    -- admin sees everything (mirrors admin_full_access_* FOR ALL)
    (SELECT get_user_role()) = 'admin'
    -- public: published and visible
    OR EXISTS (
      SELECT 1 FROM products pr
      WHERE pr.id = p_product_id
        AND pr.status IN ('pending', 'running')
        AND pr.is_visible = true
    )
    -- enrolled gamer (child's own login) OR purchaser (parent), active/waitlisted
    OR EXISTS (
      SELECT 1 FROM participations p
      WHERE p.product_id = p_product_id
        AND (p.gamer_id = (SELECT auth.uid()) OR p.customer_id = (SELECT auth.uid()))
        AND p.status IN ('active', 'waitlisted')
    )
    -- assigned gedu
    OR EXISTS (
      SELECT 1 FROM gedu_group_assignments a
      WHERE a.product_id = p_product_id
        AND a.gedu_id = (SELECT auth.uid())
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
-- Name: confirm_reservation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_reservation(p_reservation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id   UUID;
  v_gamer_id     UUID;
  v_customer_id  UUID;
  v_status       public.participation_status;
  v_conflict_id  UUID;
BEGIN
  SELECT product_id, gamer_id, customer_id, status
    INTO v_product_id, v_gamer_id, v_customer_id, v_status
    FROM public.participations
    WHERE id = p_reservation_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'orphan');
  END IF;

  -- Idempotent replay of the same reservation's webhook.
  IF v_status = 'active' THEN
    RETURN jsonb_build_object(
      'kind', 'confirmed',
      'participation_id', p_reservation_id,
      'product_id', v_product_id,
      'gamer_id', v_gamer_id,
      'customer_id', v_customer_id,
      'idempotent', TRUE
    );
  END IF;

  IF v_status <> 'reserving' THEN
    RETURN jsonb_build_object('kind', 'orphan');
  END IF;

  -- Pre-check the partial UNIQUE: is there another non-reserving row for
  -- this (product, gamer)? If so, the parent already has a confirmed seat
  -- (or waitlist position) from a different reservation, and this Stripe
  -- payment is a duplicate. Return early so the route layer can refund.
  SELECT id
    INTO v_conflict_id
    FROM public.participations
    WHERE product_id = v_product_id
      AND gamer_id   = v_gamer_id
      AND id        <> p_reservation_id
      AND status    IN ('active', 'waitlisted', 'completed')
    LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'kind', 'duplicate_payment',
      'reservation_id', p_reservation_id,
      'existing_participation_id', v_conflict_id,
      'product_id', v_product_id,
      'gamer_id', v_gamer_id,
      'customer_id', v_customer_id
    );
  END IF;

  UPDATE public.participations
     SET status = 'active',
         reserved_until = NULL
   WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'kind', 'confirmed',
    'participation_id', p_reservation_id,
    'product_id', v_product_id,
    'gamer_id', v_gamer_id,
    'customer_id', v_customer_id,
    'idempotent', FALSE
  );
END;
$$;


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
-- Name: count_seats_taken(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_seats_taken(p_product_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COUNT(*)::INTEGER
    FROM public.participations
    WHERE product_id = p_product_id
      AND status IN ('active', 'reserving');
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
  v_reserved_until        TIMESTAMPTZ;
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
    'subscription_monthly', 'single_payment', 'free'
  ) THEN
    RAISE EXCEPTION 'unsupported purchase shape: %', p_purchase_shape
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
      AND status IN ('active', 'waitlisted')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a % participation on this product', p_gamer_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Seat-count gate. Sits above the free branch so an explicit cap on a
  -- free product (the schema permits it) is honored — earlier versions
  -- only checked the cap on paid signups, so a free product with
  -- seat_count=20 silently accepted the 21st signup.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_seats_taken(p_product_id);
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

  v_reserved_until := NOW() + INTERVAL '30 minutes';
  INSERT INTO public.participations (
    product_id, gamer_id, customer_id, status, reserved_until
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'reserving', v_reserved_until
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'kind', 'reserving',
    'participation_id', v_participation_id,
    'reserved_until', v_reserved_until
  );
END;
$$;


--
-- Name: create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, integer, integer, text, boolean, text, timestamp with time zone, public.product_status, boolean, boolean, text, text, uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status DEFAULT 'draft'::public.product_status, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_image_path text DEFAULT NULL::text, p_padlet_url text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_refund_policy_days integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[]) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id    UUID;
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
BEGIN
  IF (SELECT public.get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can create products'
      USING ERRCODE = '42501';
  END IF;

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
    refund_policy_days, is_visible, created_by
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path, p_padlet_url,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_refund_policy_days, p_is_visible, auth.uid()
  )
  RETURNING id INTO v_product_id;

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, description
    )
    VALUES (
      v_product_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'description', '')
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
-- Name: expire_reservation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_reservation(p_reservation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id UUID;
  v_status     public.participation_status;
BEGIN
  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations WHERE id = p_reservation_id;

  IF NOT FOUND OR v_status <> 'reserving' THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  DELETE FROM public.participations WHERE id = p_reservation_id AND status = 'reserving';

  RETURN jsonb_build_object('kind', 'expired');
END;
$$;


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
  IF (SELECT get_user_role()) <> 'gedu' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

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
                 'description', pt.description
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
-- Name: get_my_assigned_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(product_id uuid, group_id uuid, timezone text, start_date date, end_date date, padlet_url text, is_remote boolean, product_type public.product_type, product_translations jsonb, schedule_slots jsonb, group_count integer, gamer_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_gedu_id UUID := (SELECT auth.uid());
BEGIN
  IF (SELECT get_user_role()) <> 'gedu' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

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
                 'description', pt.description
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
    email text,
    username text,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    currency text,
    phone text,
    spoken_languages text[] DEFAULT '{}'::text[] NOT NULL,
    locale text,
    first_name text NOT NULL,
    last_name text,
    CONSTRAINT auth_identifier_check CHECK ((((role = 'gamer'::public.user_role) AND (username IS NOT NULL)) OR ((role <> 'gamer'::public.user_role) AND (email IS NOT NULL)))),
    CONSTRAINT profiles_first_name_len CHECK (((char_length(first_name) >= 2) AND (char_length(first_name) <= 32))),
    CONSTRAINT profiles_last_name_len CHECK (((last_name IS NULL) OR (char_length(last_name) <= 32))),
    CONSTRAINT profiles_phone_e164 CHECK ((phone ~ '^\d{7,15}$'::text))
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase auth.users with role-based access';


--
-- Name: COLUMN profiles.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.email IS 'Email address (NULL for gamer accounts)';


--
-- Name: COLUMN profiles.username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.username IS 'Username (required for gamers, optional for others)';


--
-- Name: COLUMN profiles.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.role IS 'User role determining access permissions';


--
-- Name: COLUMN profiles.spoken_languages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.spoken_languages IS 'Human languages the user speaks (codes from public.spoken_languages). Used for matching gamers/gedus to clubs. Distinct from locale, which controls UI translation.';


--
-- Name: COLUMN profiles.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.locale IS 'BCP-47-style UI locale code (en, fi, sv, ...). Null = auto-detect from cookie/Accept-Language. Distinct from spoken_languages, which is the user''s human-language fluency.';


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
-- Name: get_my_payment_problem_participations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_payment_problem_participations() RETURNS TABLE(participation_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT fs.participation_id
  FROM public.family_subscriptions fs
  JOIN public.participations p ON p.id = fs.participation_id
  WHERE fs.status = 'past_due'
    AND (
      p.customer_id = (SELECT auth.uid())
      OR p.gamer_id = (SELECT auth.uid())
    );
$$;


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
BEGIN
  IF (SELECT get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',          gp.id,
                     'first_name',  gp.first_name,
                     'email',       gp.email,
                     'assigned_at', ga.created_at
                   )
                   ORDER BY gp.id
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
                     'signed_up_at',             p.signed_up_at,
                     'updated_at',               p.updated_at
                   )
                   ORDER BY p.id
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
             'signed_up_at',             p.signed_up_at,
             'updated_at',               p.updated_at
           )
           ORDER BY p.id
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

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned
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
  RETURN (
    SELECT role FROM public.profiles WHERE id = auth.uid()
  );
END;
$$;


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
-- Name: join_waitlist(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product           public.products;
  v_existing_id       UUID;
  v_existing_pos      INTEGER;
  v_existing_status   public.participation_status;
  v_next_position     INTEGER;
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
  SELECT id, waitlist_position, status
    INTO v_existing_id, v_existing_pos, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
      AND status IN ('waitlisted', 'reserving', 'active')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'participation_id', v_existing_id,
      'waitlist_position', v_existing_pos,
      'status', v_existing_status::text
    );
  END IF;

  -- Compute next waitlist position.
  SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted';

  INSERT INTO public.participations (
    product_id, gamer_id, customer_id, status, waitlist_position
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'waitlisted', v_next_position
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_next_position,
    'status', 'waitlisted'
  );
END;
$$;


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
-- Name: promote_from_waitlist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promote_from_waitlist(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id           UUID;
  v_gamer_id     UUID;
  v_customer_id  UUID;
  v_position     INTEGER;
BEGIN
  -- Caller is expected to hold the gate lock; we don't re-take it.
  SELECT id, gamer_id, customer_id, waitlist_position
    INTO v_id, v_gamer_id, v_customer_id, v_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted'
    ORDER BY waitlist_position ASC
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'empty_waitlist');
  END IF;

  RETURN jsonb_build_object(
    'kind', 'promoted',
    'participation_id', v_id,
    'gamer_id', v_gamer_id,
    'customer_id', v_customer_id,
    'waitlist_position', v_position
  );
END;
$$;


--
-- Name: refresh_product_seat_counts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_product_seat_counts(p_product_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_active     INTEGER;
  v_reserving  INTEGER;
  v_waitlist   INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'active'),
    COUNT(*) FILTER (WHERE status = 'reserving' AND reserved_until > NOW()),
    COUNT(*) FILTER (WHERE status = 'waitlisted')
    INTO v_active, v_reserving, v_waitlist
    FROM public.participations
    WHERE product_id = p_product_id;

  INSERT INTO public.product_seat_counts (
    product_id, active_count, reserving_count, waitlist_count, updated_at
  )
  VALUES (p_product_id, v_active, v_reserving, v_waitlist, NOW())
  ON CONFLICT (product_id) DO UPDATE SET
    active_count    = EXCLUDED.active_count,
    reserving_count = EXCLUDED.reserving_count,
    waitlist_count  = EXCLUDED.waitlist_count,
    updated_at      = EXCLUDED.updated_at;
END;
$$;


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
-- Name: submit_feedback(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_feedback(p_user_id uuid, p_message text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
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
    product_id, active_count, reserving_count, waitlist_count
  ) VALUES (NEW.id, 0, 0, 0)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: update_product(uuid, public.billing_mode, jsonb, public.product_topic, integer, integer, text, boolean, text, timestamp with time zone, boolean, boolean, text, text, uuid, integer, date, date, integer, integer, jsonb, jsonb, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_image_path text DEFAULT NULL::text, p_padlet_url text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_refund_policy_days integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[]) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_locales       TEXT[];
BEGIN
  IF (SELECT public.get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can update products'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_id) THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.products SET
    billing_mode          = p_billing_mode,
    topic                 = p_topic,
    min_age               = p_min_age,
    max_age               = p_max_age,
    spoken_language_code  = p_spoken_language_code,
    image_path            = p_image_path,
    padlet_url            = p_padlet_url,
    location_id           = p_location_id,
    is_remote             = p_is_remote,
    signup_threshold      = p_signup_threshold,
    start_date            = p_start_date,
    end_date              = p_end_date,
    timezone              = p_timezone,
    seat_count            = p_seat_count,
    waitlist_enabled      = p_waitlist_enabled,
    registration_opens_at = p_registration_opens_at,
    refund_policy_days    = p_refund_policy_days,
    is_visible            = p_is_visible
  WHERE id = p_id;

  -- product_translations — UPSERT new set, then DELETE leftovers (the
  -- "≥1 row remains" trigger passes because the new rows are already in
  -- place before any delete fires).
  v_locales := ARRAY[]::TEXT[];

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, description
    )
    VALUES (
      p_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'description', '')
    )
    ON CONFLICT (product_id, locale) DO UPDATE SET
      name        = EXCLUDED.name,
      description = EXCLUDED.description,
      updated_at  = NOW();

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
    CONSTRAINT locations_no_self_parent CHECK ((parent_id IS DISTINCT FROM id))
);


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
-- Name: TABLE parent_gamer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.parent_gamer IS 'Junction table linking parent (customer) accounts to child (gamer) accounts';


--
-- Name: COLUMN parent_gamer.relationship; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parent_gamer.relationship IS 'Relationship type (parent, guardian, etc.)';


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
    reserved_until timestamp with time zone,
    waitlist_position integer,
    signed_up_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_participations_no_self_signup CHECK ((gamer_id <> customer_id)),
    CONSTRAINT chk_participations_reserving_has_until CHECK (((status <> 'reserving'::public.participation_status) OR (reserved_until IS NOT NULL))),
    CONSTRAINT chk_participations_waitlisted_has_position CHECK (((status <> 'waitlisted'::public.participation_status) OR (waitlist_position IS NOT NULL)))
);


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
    CONSTRAINT chk_product_groups_name_not_blank CHECK ((length(btrim(name)) > 0))
);


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
    reserving_count integer DEFAULT 0 NOT NULL,
    waitlist_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_seat_counts_active_count_check CHECK ((active_count >= 0)),
    CONSTRAINT product_seat_counts_reserving_count_check CHECK ((reserving_count >= 0)),
    CONSTRAINT product_seat_counts_waitlist_count_check CHECK ((waitlist_count >= 0))
);


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
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
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
    CONSTRAINT chk_products_age_range CHECK ((max_age >= min_age)),
    CONSTRAINT chk_products_date_range CHECK (((start_date IS NULL) OR (end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT chk_products_draft_implies_hidden CHECK (((status <> 'draft'::public.product_status) OR (is_visible = false))),
    CONSTRAINT chk_products_event_single_date CHECK (((product_type <> 'event'::public.product_type) OR (NOT (end_date IS DISTINCT FROM start_date)))),
    CONSTRAINT chk_products_external_contract_muni CHECK (((billing_mode <> 'external_contract'::public.billing_mode) OR (product_type = 'municipality_club'::public.product_type))),
    CONSTRAINT chk_products_in_person_has_location CHECK (((is_remote = true) OR (location_id IS NOT NULL))),
    CONSTRAINT chk_products_non_consumer_has_end_date CHECK (((product_type = 'consumer_club'::public.product_type) OR (status = 'draft'::public.product_status) OR (end_date IS NOT NULL))),
    CONSTRAINT chk_products_online_muni_has_location CHECK (((NOT ((is_remote = true) AND (product_type = 'municipality_club'::public.product_type))) OR (location_id IS NOT NULL))),
    CONSTRAINT chk_products_online_non_muni_no_location CHECK (((NOT ((is_remote = true) AND (product_type <> 'municipality_club'::public.product_type))) OR (location_id IS NULL))),
    CONSTRAINT chk_products_refund_policy_only_for_single_payment CHECK (((refund_policy_days IS NULL) OR (product_type = ANY (ARRAY['camp'::public.product_type, 'event'::public.product_type])))),
    CONSTRAINT chk_products_running_has_start_date CHECK (((status <> 'running'::public.product_status) OR (start_date IS NOT NULL))),
    CONSTRAINT chk_products_threshold_within_seat_count CHECK (((signup_threshold IS NULL) OR (seat_count IS NULL) OR (signup_threshold <= seat_count))),
    CONSTRAINT products_max_age_check CHECK ((max_age >= 0)),
    CONSTRAINT products_min_age_check CHECK ((min_age >= 0)),
    CONSTRAINT products_refund_policy_days_check CHECK (((refund_policy_days IS NULL) OR (refund_policy_days >= 0))),
    CONSTRAINT products_seat_count_check CHECK (((seat_count IS NULL) OR (seat_count >= 1))),
    CONSTRAINT products_signup_threshold_check CHECK (((signup_threshold IS NULL) OR (signup_threshold >= 1)))
);


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    amount_cents integer NOT NULL,
    reason public.refund_reason NOT NULL,
    stripe_refund_id text NOT NULL,
    stripe_event_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT refunds_amount_cents_check CHECK ((amount_cents >= 0))
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
-- Name: minecraft_accounts minecraft_accounts_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.minecraft_accounts
    ADD CONSTRAINT minecraft_accounts_uuid_unique UNIQUE (minecraft_uuid);


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
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_stripe_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_stripe_event_id_key UNIQUE (stripe_event_id);


--
-- Name: refunds refunds_stripe_refund_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_stripe_refund_id_key UNIQUE (stripe_refund_id);


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
-- Name: idx_participations_reserving_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_reserving_live ON public.participations USING btree (product_id, reserved_until) WHERE (status = 'reserving'::public.participation_status);


--
-- Name: idx_participations_waitlisted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_waitlisted ON public.participations USING btree (product_id, waitlist_position) WHERE (status = 'waitlisted'::public.participation_status);


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
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_profiles_username; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_profiles_username ON public.profiles USING btree (username) WHERE (username IS NOT NULL);


--
-- Name: idx_refunds_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_payment ON public.refunds USING btree (payment_id);


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
-- Name: uq_participations_active_or_waitlisted; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_participations_active_or_waitlisted ON public.participations USING btree (product_id, gamer_id) WHERE (status = ANY (ARRAY['active'::public.participation_status, 'waitlisted'::public.participation_status, 'completed'::public.participation_status]));


--
-- Name: family_subscriptions family_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_subscriptions_updated_at BEFORE UPDATE ON public.family_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


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

CREATE TRIGGER trg_participations_refresh_counts_upd AFTER UPDATE OF status, reserved_until, product_id ON public.participations FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_product_seat_counts();


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
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE RESTRICT;


--
-- Name: schedule_slots schedule_slots_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_slots
    ADD CONSTRAINT schedule_slots_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


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
-- Name: whatsapp_messages whatsapp_messages_phone_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_phone_fkey FOREIGN KEY (phone) REFERENCES public.whatsapp_contacts(phone);


--
-- Name: customer_profiles Admins can do everything on customer_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do everything on customer_profiles" ON public.customer_profiles TO authenticated USING (public.is_admin());


--
-- Name: gamer_profiles Admins can do everything on gamer_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do everything on gamer_profiles" ON public.gamer_profiles TO authenticated USING (public.is_admin());


--
-- Name: whatsapp_contacts Admins can insert whatsapp_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert whatsapp_contacts" ON public.whatsapp_contacts FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: whatsapp_messages Admins can insert whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert whatsapp_messages" ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))) AND (direction = 'outbound'::text)));


--
-- Name: whatsapp_contacts Admins can read whatsapp_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read whatsapp_contacts" ON public.whatsapp_contacts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: whatsapp_messages Admins can read whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read whatsapp_messages" ON public.whatsapp_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: whatsapp_contacts Admins can update whatsapp_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update whatsapp_contacts" ON public.whatsapp_contacts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: customer_profiles Customers can read own customer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can read own customer_profile" ON public.customer_profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: gamer_profiles Gamers can read own gamer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gamers can read own gamer_profile" ON public.gamer_profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: gamer_profiles Gamers can update own gamer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gamers can update own gamer_profile" ON public.gamer_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: gamer_profiles Parents can read linked gamer profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can read linked gamer profiles" ON public.gamer_profiles FOR SELECT TO authenticated USING (public.is_parent_of(user_id));


--
-- Name: calendar_holidays admin_full_access_calendar_holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_calendar_holidays ON public.calendar_holidays TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: family_subscriptions admin_full_access_family_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_family_subscriptions ON public.family_subscriptions TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: feedback_submissions admin_full_access_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_feedback ON public.feedback_submissions TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: gedu_group_assignments admin_full_access_gedu_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_gedu_assignments ON public.gedu_group_assignments TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: holiday_calendars admin_full_access_holiday_calendars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_holiday_calendars ON public.holiday_calendars TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: minecraft_accounts admin_full_access_minecraft_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_minecraft_accounts ON public.minecraft_accounts TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: parent_gamer admin_full_access_parent_gamer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_parent_gamer ON public.parent_gamer TO authenticated USING ((public.get_user_role() = 'admin'::public.user_role)) WITH CHECK ((public.get_user_role() = 'admin'::public.user_role));


--
-- Name: participations admin_full_access_participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_participations ON public.participations TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: payments admin_full_access_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_payments ON public.payments TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: product_groups admin_full_access_product_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_groups ON public.product_groups TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: product_holiday_calendars admin_full_access_product_holiday_calendars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_holiday_calendars ON public.product_holiday_calendars TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: product_prices admin_full_access_product_prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_prices ON public.product_prices TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: product_subscription_prices admin_full_access_product_subscription_prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_subscription_prices ON public.product_subscription_prices TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: product_translations admin_full_access_product_translations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_translations ON public.product_translations TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: products admin_full_access_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_products ON public.products TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: profiles admin_full_access_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_profiles ON public.profiles TO authenticated USING ((public.get_user_role() = 'admin'::public.user_role)) WITH CHECK ((public.get_user_role() = 'admin'::public.user_role));


--
-- Name: refunds admin_full_access_refunds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_refunds ON public.refunds TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: schedule_slots admin_full_access_schedule_slots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_schedule_slots ON public.schedule_slots TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: site_details admin_full_access_site_details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_site_details ON public.site_details TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: site_staff_details admin_full_access_site_staff_details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_site_staff_details ON public.site_staff_details TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: gedu_locations admin_manage_gedu_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_gedu_locations ON public.gedu_locations TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: locations admin_manage_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_locations ON public.locations TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = 'admin'::public.user_role));


--
-- Name: spoken_languages admin_manage_spoken_languages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_spoken_languages ON public.spoken_languages TO authenticated USING ((public.get_user_role() = 'admin'::public.user_role)) WITH CHECK ((public.get_user_role() = 'admin'::public.user_role));


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
-- Name: refunds customer_select_own_refunds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_select_own_refunds ON public.refunds FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.payments p
  WHERE ((p.id = refunds.payment_id) AND (p.customer_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: parent_gamer customers_delete_own_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_delete_own_links ON public.parent_gamer FOR DELETE TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (parent_id = ( SELECT auth.uid() AS uid))));


--
-- Name: gedu_group_assignments customers_read_assignments_via_gamers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_assignments_via_gamers ON public.gedu_group_assignments FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (product_id IN ( SELECT participations.product_id
   FROM public.participations
  WHERE ((participations.customer_id = auth.uid()) AND (participations.status = 'active'::public.participation_status))))));


--
-- Name: product_groups customers_read_groups_via_gamers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_groups_via_gamers ON public.product_groups FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (id IN ( SELECT participations.group_id
   FROM public.participations
  WHERE ((participations.customer_id = auth.uid()) AND (participations.group_id IS NOT NULL) AND (participations.status = 'active'::public.participation_status))))));


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
-- Name: product_groups gamers_read_own_group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamers_read_own_group ON public.product_groups FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gamer'::public.user_role) AND (id IN ( SELECT participations.group_id
   FROM public.participations
  WHERE ((participations.gamer_id = auth.uid()) AND (participations.group_id IS NOT NULL) AND (participations.status = 'active'::public.participation_status))))));


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
-- Name: refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;

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
-- Name: feedback_submissions users_read_own_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_feedback ON public.feedback_submissions FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: minecraft_accounts users_read_own_minecraft_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_minecraft_account ON public.minecraft_accounts FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: profiles users_update_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_profile ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK (((id = ( SELECT auth.uid() AS uid)) AND (role = ( SELECT public.get_user_role() AS get_user_role))));


--
-- Name: profiles users_view_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_view_own_profile ON public.profiles FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));


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
-- Name: FUNCTION _list_cron_jobs(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_cron_jobs() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_cron_jobs() TO service_role;


--
-- Name: FUNCTION _list_rpc_access(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_rpc_access() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_rpc_access() TO service_role;


--
-- Name: FUNCTION _list_security_definer_without_search_path(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_security_definer_without_search_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_security_definer_without_search_path() TO service_role;


--
-- Name: FUNCTION _list_table_grants(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_table_grants() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_table_grants() TO service_role;


--
-- Name: FUNCTION _list_tables_without_rls(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_tables_without_rls() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_tables_without_rls() TO service_role;


--
-- Name: FUNCTION apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) TO service_role;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) TO authenticated;


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
-- Name: FUNCTION confirm_reservation(p_reservation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_reservation(p_reservation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_reservation(p_reservation_id uuid) TO service_role;


--
-- Name: FUNCTION count_active_seats(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_active_seats(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_active_seats(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION count_seats_taken(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_seats_taken(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_seats_taken(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) TO service_role;


--
-- Name: FUNCTION create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) TO service_role;


--
-- Name: FUNCTION effective_status(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.effective_status(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.effective_status(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION ensure_product_keeps_at_least_one_translation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_product_keeps_at_least_one_translation() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_product_keeps_at_least_one_translation() TO service_role;


--
-- Name: FUNCTION expire_reservation(p_reservation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.expire_reservation(p_reservation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.expire_reservation(p_reservation_id uuid) TO service_role;


--
-- Name: FUNCTION get_gedu_assigned_product(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) TO authenticated;


--
-- Name: FUNCTION get_my_assigned_products(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO service_role;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO authenticated;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: COLUMN profiles.phone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(phone) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.spoken_languages; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(spoken_languages) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.first_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(first_name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.last_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(last_name) ON TABLE public.profiles TO authenticated;


--
-- Name: FUNCTION get_my_gamers(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_gamers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_gamers() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_gamers() TO service_role;


--
-- Name: FUNCTION get_my_parents(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_parents() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_parents() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_parents() TO service_role;


--
-- Name: FUNCTION get_my_payment_problem_participations(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_payment_problem_participations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_payment_problem_participations() TO service_role;
GRANT ALL ON FUNCTION public.get_my_payment_problem_participations() TO authenticated;


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
-- Name: FUNCTION join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid) TO service_role;


--
-- Name: FUNCTION participation_state(p_status public.participation_status, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) TO service_role;


--
-- Name: FUNCTION pin_is_set(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pin_is_set() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pin_is_set() TO service_role;
GRANT ALL ON FUNCTION public.pin_is_set() TO authenticated;


--
-- Name: FUNCTION product_has_session(p_product_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.product_has_session(p_product_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.product_has_session(p_product_id uuid, p_session_date date) TO service_role;


--
-- Name: FUNCTION promote_from_waitlist(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.promote_from_waitlist(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.promote_from_waitlist(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION refresh_product_seat_counts(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_product_seat_counts(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_product_seat_counts(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION set_my_pin(p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_my_pin(p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_my_pin(p_pin text) TO service_role;
GRANT ALL ON FUNCTION public.set_my_pin(p_pin text) TO authenticated;


--
-- Name: FUNCTION set_pin_for_user(p_user_id uuid, p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_pin_for_user(p_user_id uuid, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_pin_for_user(p_user_id uuid, p_pin text) TO service_role;


--
-- Name: FUNCTION submit_feedback(p_user_id uuid, p_message text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_feedback(p_user_id uuid, p_message text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_feedback(p_user_id uuid, p_message text) TO service_role;


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
-- Name: FUNCTION update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) TO service_role;


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
GRANT ALL ON FUNCTION public.verify_my_pin(p_pin text) TO service_role;
GRANT ALL ON FUNCTION public.verify_my_pin(p_pin text) TO authenticated;


--
-- Name: TABLE calendar_holidays; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calendar_holidays TO anon;
GRANT ALL ON TABLE public.calendar_holidays TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.calendar_holidays TO authenticated;


--
-- Name: TABLE customer_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_profiles TO anon;
GRANT ALL ON TABLE public.customer_profiles TO authenticated;
GRANT ALL ON TABLE public.customer_profiles TO service_role;


--
-- Name: TABLE family_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.family_subscriptions TO anon;
GRANT ALL ON TABLE public.family_subscriptions TO service_role;
GRANT SELECT ON TABLE public.family_subscriptions TO authenticated;


--
-- Name: TABLE feedback_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.feedback_submissions TO anon;
GRANT ALL ON TABLE public.feedback_submissions TO service_role;
GRANT SELECT ON TABLE public.feedback_submissions TO authenticated;


--
-- Name: TABLE gamer_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gamer_profiles TO anon;
GRANT ALL ON TABLE public.gamer_profiles TO authenticated;
GRANT ALL ON TABLE public.gamer_profiles TO service_role;


--
-- Name: TABLE gedu_group_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gedu_group_assignments TO anon;
GRANT ALL ON TABLE public.gedu_group_assignments TO service_role;
GRANT SELECT ON TABLE public.gedu_group_assignments TO authenticated;


--
-- Name: TABLE gedu_locations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gedu_locations TO anon;
GRANT ALL ON TABLE public.gedu_locations TO service_role;
GRANT SELECT,INSERT,DELETE ON TABLE public.gedu_locations TO authenticated;


--
-- Name: TABLE holiday_calendars; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.holiday_calendars TO anon;
GRANT ALL ON TABLE public.holiday_calendars TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.holiday_calendars TO authenticated;


--
-- Name: TABLE locations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.locations TO anon;
GRANT ALL ON TABLE public.locations TO service_role;
GRANT SELECT,DELETE ON TABLE public.locations TO authenticated;


--
-- Name: TABLE minecraft_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.minecraft_accounts TO anon;
GRANT ALL ON TABLE public.minecraft_accounts TO service_role;
GRANT SELECT ON TABLE public.minecraft_accounts TO authenticated;


--
-- Name: TABLE parent_gamer; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.parent_gamer TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.parent_gamer TO authenticated;
GRANT ALL ON TABLE public.parent_gamer TO service_role;


--
-- Name: TABLE participations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.participations TO anon;
GRANT ALL ON TABLE public.participations TO service_role;
GRANT SELECT ON TABLE public.participations TO authenticated;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payments TO anon;
GRANT ALL ON TABLE public.payments TO service_role;
GRANT SELECT ON TABLE public.payments TO authenticated;


--
-- Name: TABLE product_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_groups TO anon;
GRANT ALL ON TABLE public.product_groups TO service_role;
GRANT SELECT ON TABLE public.product_groups TO authenticated;


--
-- Name: TABLE product_holiday_calendars; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_holiday_calendars TO anon;
GRANT ALL ON TABLE public.product_holiday_calendars TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_holiday_calendars TO authenticated;


--
-- Name: TABLE product_prices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_prices TO anon;
GRANT ALL ON TABLE public.product_prices TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_prices TO authenticated;


--
-- Name: TABLE product_seat_counts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_seat_counts TO service_role;
GRANT SELECT ON TABLE public.product_seat_counts TO anon;
GRANT SELECT ON TABLE public.product_seat_counts TO authenticated;


--
-- Name: TABLE product_subscription_prices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_subscription_prices TO anon;
GRANT ALL ON TABLE public.product_subscription_prices TO service_role;


--
-- Name: TABLE product_translations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_translations TO anon;
GRANT ALL ON TABLE public.product_translations TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_translations TO authenticated;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.products TO authenticated;


--
-- Name: TABLE refunds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.refunds TO anon;
GRANT ALL ON TABLE public.refunds TO service_role;
GRANT SELECT ON TABLE public.refunds TO authenticated;


--
-- Name: TABLE schedule_slots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schedule_slots TO anon;
GRANT ALL ON TABLE public.schedule_slots TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.schedule_slots TO authenticated;


--
-- Name: TABLE site_details; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.site_details TO anon;
GRANT ALL ON TABLE public.site_details TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.site_details TO authenticated;


--
-- Name: TABLE site_staff_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_staff_details TO anon;
GRANT ALL ON TABLE public.site_staff_details TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.site_staff_details TO authenticated;


--
-- Name: TABLE spoken_languages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.spoken_languages TO anon;
GRANT ALL ON TABLE public.spoken_languages TO service_role;
GRANT SELECT ON TABLE public.spoken_languages TO authenticated;


--
-- Name: TABLE whatsapp_contacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_contacts TO anon;
GRANT ALL ON TABLE public.whatsapp_contacts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.whatsapp_contacts TO authenticated;


--
-- Name: TABLE whatsapp_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_messages TO anon;
GRANT ALL ON TABLE public.whatsapp_messages TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


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
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


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
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


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


