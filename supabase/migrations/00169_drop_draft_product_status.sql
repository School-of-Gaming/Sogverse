-- 00169: `draft` leaves the product status vocabulary. Both enums are rebuilt
-- without it, the two functions that carry them in their signature are dropped
-- and recreated against the new types, and the constraint that existed only to
-- police the value goes with it.
--
-- WHY. `draft` was reserved, never used. The admin form has always created
-- products as `pending` — it exposes visibility as its only "should parents see
-- this?" knob — and the save-incomplete flow the value was held for was never
-- built. Nothing writes it, nothing branches on it in anger, and both hosted
-- databases were checked before this migration was written: zero rows in
-- production, zero in staging. So it is dead code, and it is dropped rather
-- than left standing as a state the type system keeps asking every reader about.
--
-- It also stopped being harmless the moment 00168 landed. `draft` used to imply
-- hidden (there was a CHECK saying so), and hidden used to mean unreadable —
-- that pair was the closest thing we had to "unfinished, nobody may see it".
-- 00168 made unlisted readable by design, so the pair no longer means anything:
-- a draft product would be as readable as any other pending one, and keeping
-- the value would only promise a privacy it cannot deliver. If a genuine
-- save-incomplete flow is ever built, add the state back then, with the
-- machinery that makes it mean something.
--
-- WHY IT IS THIS MUCH WORK. PostgreSQL cannot remove a value from an enum in
-- place. The type has to be rebuilt and everything that references it moved
-- across: the column (with its default and the CHECK constraints that name the
-- type), and every function whose *signature* carries either enum — a function
-- body's local variable declaration re-resolves by name at execution time and
-- needs nothing, but an argument or return type is a hard catalog dependency.
-- pg_proc was queried for exactly that set and it is two functions:
--
--   create_product(…, p_status public.product_status, …) RETURNS uuid
--   effective_status(uuid) RETURNS public.effective_product_status
--
-- Both are dropped and recreated verbatim from their current bodies, with two
-- deliberate edits: create_product's `p_status` default becomes 'pending' (it
-- was 'draft', which no caller ever relied on — the form passes the status
-- explicitly), and effective_status loses its draft passthrough. Recreating
-- means new OIDs, so both ACLs are restated in full.
--
-- The safety rail is the assertion at the top: if any row anywhere carries
-- 'draft', this migration raises and stops. Silently folding such a row into
-- 'pending' would publish someone's unfinished product, which is precisely the
-- failure a "just convert it" version of this migration would produce.

-- ---------------------------------------------------------------------------
-- 0. Refuse to run if the value is actually in use.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_drafts INTEGER;
BEGIN
  SELECT count(*) INTO v_drafts
    FROM public.products
    WHERE status = 'draft'::public.product_status;

  IF v_drafts > 0 THEN
    RAISE EXCEPTION
      '% product(s) still carry status=draft; decide what each should become before dropping the value', v_drafts;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Constraints naming the type. A CHECK expression binds to the type's OID,
--    so all three have to come off before the column can be retyped. Two come
--    back below; chk_products_draft_implies_hidden does not — it says nothing
--    once the value is gone, and what it used to say ("a draft is never
--    visible") is not a rule 00168 leaves standing anyway.
-- ---------------------------------------------------------------------------

ALTER TABLE public.products DROP CONSTRAINT chk_products_draft_implies_hidden;
ALTER TABLE public.products DROP CONSTRAINT chk_products_non_consumer_has_end_date;
ALTER TABLE public.products DROP CONSTRAINT chk_products_running_has_start_date;

-- ---------------------------------------------------------------------------
-- 2. The two functions whose signatures carry the enums. Dropped here so the
--    old types are dependency-free by step 5; recreated in step 4.
-- ---------------------------------------------------------------------------

DROP FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, uuid, integer, date, date,
  integer, jsonb, jsonb, uuid[], integer, integer, integer, text
);

DROP FUNCTION public.effective_status(uuid);

-- ---------------------------------------------------------------------------
-- 3. Rebuild both enums.
-- ---------------------------------------------------------------------------

ALTER TABLE public.products ALTER COLUMN status DROP DEFAULT;

ALTER TYPE public.product_status RENAME TO product_status_old;

CREATE TYPE public.product_status AS ENUM (
  'pending',
  'running',
  'completed',
  'cancelled'
);

ALTER TABLE public.products
  ALTER COLUMN status TYPE public.product_status
  USING status::text::public.product_status;

-- The column default was 'draft' — the one place the value was actually
-- written by omission. 'pending' is what every caller has always passed.
ALTER TABLE public.products
  ALTER COLUMN status SET DEFAULT 'pending'::public.product_status;

ALTER TYPE public.effective_product_status RENAME TO effective_product_status_old;

CREATE TYPE public.effective_product_status AS ENUM (
  'pending',
  'running',
  'completed',
  'cancelled',
  'expired'
);

COMMENT ON TYPE public.product_status IS
  'The admin-stored lifecycle of a product: pending → running → completed, '
  'with cancelled as the admin kill. ''draft'' was removed in 00169 — nothing '
  'ever wrote it and the save-incomplete flow it was reserved for was never '
  'built. Visibility is a separate axis and means listing, not access.';

COMMENT ON TYPE public.effective_product_status IS
  'The lifecycle as a reader sees it: product_status plus ''expired'', the '
  'derived state of a pending product whose end date passed without its start '
  'conditions ever being met. Computed at read time, never stored.';

-- ---------------------------------------------------------------------------
-- 4. The functions, recreated against the new types. Bodies are the live ones,
--    with the two edits named in the header.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.create_product(
  p_product_type public.product_type,
  p_billing_mode public.billing_mode,
  p_translations jsonb,
  p_topic public.product_topic,
  p_min_age integer,
  p_max_age integer,
  p_spoken_language_code text,
  p_is_remote boolean,
  p_timezone text,
  p_registration_opens_at timestamp with time zone,
  p_status public.product_status DEFAULT 'pending'::public.product_status,
  p_is_visible boolean DEFAULT false,
  p_waitlist_enabled boolean DEFAULT true,
  p_image_path text DEFAULT NULL::text,
  p_location_id uuid DEFAULT NULL::uuid,
  p_signup_threshold integer DEFAULT NULL::integer,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date,
  p_seat_count integer DEFAULT NULL::integer,
  p_schedule_slots jsonb DEFAULT NULL::jsonb,
  p_prices jsonb DEFAULT NULL::jsonb,
  p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[],
  p_primary_gedu_fee_cents integer DEFAULT NULL::integer,
  p_assistant_gedu_fee_cents integer DEFAULT NULL::integer,
  p_municipality_fee_cents integer DEFAULT NULL::integer,
  p_material_url text DEFAULT NULL::text
) RETURNS uuid
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
    min_age, max_age, spoken_language_code, image_path,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_is_visible, auth.uid(),
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

CREATE FUNCTION public.effective_status(p_product_id uuid)
RETURNS public.effective_product_status
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

-- Recreated objects are new objects, and "no privileges of their own" is not
-- quite true: PostgreSQL grants EXECUTE on a new function to PUBLIC, so a
-- dropped-and-recreated function comes back MORE reachable than the one it
-- replaces. That is why the REVOKE below is load-bearing here even though the
-- same boilerplate is inert in migrations that only REPLACE a body — without
-- it, `effective_status` (SECURITY DEFINER, no guard, service-role-only by
-- design) would answer anon, and `create_product` would be anon-reachable and
-- rely on its admin guard alone. Both ACLs are then restated exactly as they
-- stood.
REVOKE ALL ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, uuid, integer, date, date,
  integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.effective_status(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, uuid, integer, date, date,
  integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product(
  public.product_type, public.billing_mode, jsonb, public.product_topic,
  integer, integer, text, boolean, text, timestamp with time zone,
  public.product_status, boolean, boolean, text, uuid, integer, date, date,
  integer, jsonb, jsonb, uuid[], integer, integer, integer, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.effective_status(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The old types, now dependency-free. A failure here means something still
--    references them that step 2 did not account for, which is exactly the
--    news this statement should deliver.
-- ---------------------------------------------------------------------------

DROP TYPE public.product_status_old;
DROP TYPE public.effective_product_status_old;

-- ---------------------------------------------------------------------------
-- 6. The two surviving constraints, re-added against the new type. The
--    end-date rule loses its draft escape hatch: with the value gone, "or it
--    is a draft" was the only reason a camp could sit there without an end
--    date, and no row relies on it (the assertion at the top proved that).
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD CONSTRAINT chk_products_non_consumer_has_end_date
  CHECK (
    product_type = 'consumer_club'::public.product_type
    OR end_date IS NOT NULL
  );

ALTER TABLE public.products
  ADD CONSTRAINT chk_products_running_has_start_date
  CHECK (
    status <> 'running'::public.product_status
    OR start_date IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 7. End state.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_values TEXT[];
  v_create_product TEXT :=
    'public.create_product(public.product_type, public.billing_mode, jsonb, '
    'public.product_topic, integer, integer, text, boolean, text, '
    'timestamp with time zone, public.product_status, boolean, boolean, text, '
    'uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, '
    'integer, integer, text)';
BEGIN
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO v_values
    FROM pg_catalog.pg_enum e
    WHERE e.enumtypid = 'public.product_status'::regtype;
  IF v_values <> ARRAY['pending', 'running', 'completed', 'cancelled'] THEN
    RAISE EXCEPTION 'product_status is %, not the four expected values', v_values;
  END IF;

  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO v_values
    FROM pg_catalog.pg_enum e
    WHERE e.enumtypid = 'public.effective_product_status'::regtype;
  IF v_values <> ARRAY['pending', 'running', 'completed', 'cancelled', 'expired'] THEN
    RAISE EXCEPTION 'effective_product_status is %, not the five expected values', v_values;
  END IF;

  -- The old types are gone, not merely unreferenced.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname IN ('product_status_old', 'effective_product_status_old')
  ) THEN
    RAISE EXCEPTION 'a renamed pre-00169 status type is still present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'chk_products_draft_implies_hidden'
  ) THEN
    RAISE EXCEPTION 'chk_products_draft_implies_hidden survived';
  END IF;

  -- The column kept its NOT NULL and gained the new default.
  IF (SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid)
        FROM pg_catalog.pg_attrdef d
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = d.adrelid AND a.attnum = d.adnum
       WHERE d.adrelid = 'public.products'::regclass
         AND a.attname = 'status') NOT LIKE '%pending%' THEN
    RAISE EXCEPTION 'products.status default is not pending';
  END IF;

  -- Both functions are live, against the new types, with their grants.
  IF (SELECT prosrc FROM pg_catalog.pg_proc
       WHERE oid = 'public.effective_status(uuid)'::regprocedure) LIKE '%draft%' THEN
    RAISE EXCEPTION 'effective_status still branches on draft';
  END IF;

  IF NOT pg_catalog.has_function_privilege('service_role', 'public.effective_status(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute effective_status';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated', 'public.effective_status(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'effective_status is reachable by authenticated';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.effective_status(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'effective_status is reachable by anon';
  END IF;

  IF (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = v_create_product::regprocedure)
     NOT LIKE '%PERFORM public.assert_admin();%' THEN
    RAISE EXCEPTION 'create_product lost its admin guard across the recreate';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', v_create_product, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute create_product';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', v_create_product, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute create_product';
  END IF;
  IF pg_catalog.has_function_privilege('anon', v_create_product, 'EXECUTE') THEN
    RAISE EXCEPTION 'create_product is reachable by anon';
  END IF;
END;
$$;
