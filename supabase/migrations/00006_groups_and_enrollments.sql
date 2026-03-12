-- Product groups, enrollments, charges, and related RPCs

-- =============================================================================
-- product_groups table
-- =============================================================================

CREATE TABLE product_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  gedu_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(product_id, gedu_id)
);

CREATE INDEX idx_product_groups_product ON product_groups(product_id);
CREATE INDEX idx_product_groups_gedu ON product_groups(gedu_id);

ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- group_enrollments table
-- =============================================================================

CREATE TABLE group_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES product_groups(id) ON DELETE RESTRICT,
  gamer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_by UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'active',
  last_charged_at TIMESTAMPTZ,
  unenrolled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT group_enrollments_status_check CHECK (status IN ('active', 'unenrolled'))
);

-- Partial unique index: only one active enrollment per group per gamer.
-- Not an absolute UNIQUE constraint — allows re-enrollment after unenroll.
CREATE UNIQUE INDEX idx_group_enrollments_unique_active
  ON group_enrollments(group_id, gamer_id) WHERE status = 'active';

CREATE INDEX idx_group_enrollments_group ON group_enrollments(group_id);
CREATE INDEX idx_group_enrollments_gamer ON group_enrollments(gamer_id);
CREATE INDEX idx_group_enrollments_active ON group_enrollments(status) WHERE status = 'active';

ALTER TABLE group_enrollments ENABLE ROW LEVEL SECURITY;

-- Cross-table trigger: prevent a gamer from enrolling in multiple groups for the same product
CREATE OR REPLACE FUNCTION check_unique_gamer_per_product()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id UUID;
BEGIN
  SELECT product_id INTO v_product_id
    FROM product_groups
   WHERE id = NEW.group_id;

  IF EXISTS (
    SELECT 1
      FROM group_enrollments ge
      JOIN product_groups pg ON pg.id = ge.group_id
     WHERE ge.gamer_id = NEW.gamer_id
       AND pg.product_id = v_product_id
       AND ge.group_id <> NEW.group_id
       AND ge.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Gamer is already enrolled in another group for this product'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_unique_gamer_per_product
  BEFORE INSERT ON group_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION check_unique_gamer_per_product();

-- =============================================================================
-- enrollment_charges table
-- =============================================================================

CREATE TABLE enrollment_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES group_enrollments(id) ON DELETE CASCADE,
  charged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount INTEGER NOT NULL,
  transaction_id UUID NOT NULL REFERENCES token_transactions(id),
  refunded_at TIMESTAMPTZ,
  refund_transaction_id UUID REFERENCES token_transactions(id),
  session_date DATE NOT NULL
);

-- Prevent double-charging for the same session
CREATE UNIQUE INDEX idx_enrollment_charges_unique_session
  ON enrollment_charges(enrollment_id, session_date);

CREATE INDEX idx_enrollment_charges_enrollment
  ON enrollment_charges(enrollment_id);

ALTER TABLE enrollment_charges ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RPCs: Group management (admin-only, gated internally)
-- =============================================================================

CREATE FUNCTION get_product_groups_with_details(p_product_id UUID)
RETURNS TABLE (
  group_id UUID,
  product_id UUID,
  gedu_id UUID,
  display_order INTEGER,
  gedu_display_name TEXT,
  gedu_email TEXT,
  gamer_id UUID,
  gamer_display_name TEXT,
  enrollment_id UUID,
  gamer_date_of_birth DATE,
  gamer_gender gender_type
) AS $$
BEGIN
  IF (SELECT get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pg.id AS group_id,
    pg.product_id,
    pg.gedu_id,
    pg.display_order,
    gp.display_name AS gedu_display_name,
    gp.email AS gedu_email,
    ge.gamer_id,
    gmp.display_name AS gamer_display_name,
    ge.id AS enrollment_id,
    gprof.date_of_birth AS gamer_date_of_birth,
    gprof.gender AS gamer_gender
  FROM product_groups pg
  JOIN profiles gp ON gp.id = pg.gedu_id
  LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
  LEFT JOIN profiles gmp ON gmp.id = ge.gamer_id
  LEFT JOIN gamer_profiles gprof ON gprof.user_id = ge.gamer_id
  WHERE pg.product_id = p_product_id
  ORDER BY pg.display_order, gmp.display_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION commit_group_changes(
  p_product_id UUID,
  p_added_groups JSONB DEFAULT '[]',
  p_updated_groups JSONB DEFAULT '[]',
  p_deleted_group_ids UUID[] DEFAULT '{}',
  p_enrollment_moves JSONB DEFAULT '[]'
)
RETURNS JSONB AS $$
DECLARE
  v_next_order INTEGER;
  v_group JSONB;
  v_move JSONB;
  v_new_id UUID;
  v_real_to_id UUID;
  v_group_count INTEGER;
  v_auto_hidden BOOLEAN := false;
  v_temp_map JSONB := '{}';
  v_product_name TEXT;
BEGIN
  IF (SELECT get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  SELECT name INTO v_product_name FROM products WHERE id = p_product_id;

  SELECT COALESCE(MAX(display_order), -1) + 1
    INTO v_next_order
    FROM product_groups
   WHERE product_id = p_product_id;

  -- Step 1: Insert new groups + linked voice rooms, building tempId -> realId map
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups (product_id, gedu_id, display_order)
    VALUES (p_product_id, (v_group->>'geduId')::UUID, v_next_order)
    RETURNING id INTO v_new_id;

    v_next_order := v_next_order + 1;
    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);

    -- Create linked voice room atomically with the group
    INSERT INTO voice_rooms (group_id, room_type, name, daily_room_name)
    VALUES (v_new_id, 'group', v_product_name, 'group-' || left(v_new_id::text, 8));
  END LOOP;

  -- Step 2: Update existing groups (change gedu assignment)
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_updated_groups) LOOP
    UPDATE product_groups
       SET gedu_id = (v_group->>'geduId')::UUID,
           updated_at = NOW()
     WHERE id = (v_group->>'groupId')::UUID;
  END LOOP;

  -- Step 3: Move enrollments via UPDATE (preserves enrollment_id and all metadata)
  FOR v_move IN SELECT * FROM jsonb_array_elements(p_enrollment_moves) LOOP
    IF v_temp_map ? (v_move->>'toGroupId') THEN
      v_real_to_id := (v_temp_map->> (v_move->>'toGroupId'))::UUID;
    ELSE
      v_real_to_id := (v_move->>'toGroupId')::UUID;
    END IF;

    UPDATE group_enrollments
       SET group_id = v_real_to_id
     WHERE group_id = (v_move->>'fromGroupId')::UUID
       AND gamer_id = (v_move->>'gamerId')::UUID;
  END LOOP;

  -- Step 4: Delete groups (clean up unenrolled enrollments first so the FK allows it)
  IF array_length(p_deleted_group_ids, 1) > 0 THEN
    DELETE FROM group_enrollments
     WHERE group_id = ANY(p_deleted_group_ids)
       AND status = 'unenrolled';

    DELETE FROM product_groups WHERE id = ANY(p_deleted_group_ids);
  END IF;

  -- Step 5: Auto-hide product if no groups remain
  SELECT COUNT(*) INTO v_group_count
    FROM product_groups
   WHERE product_id = p_product_id;

  IF v_group_count = 0 THEN
    UPDATE products
       SET is_visible = false
     WHERE id = p_product_id
       AND is_visible = true;

    IF FOUND THEN
      v_auto_hidden := true;
    END IF;
  END IF;

  RETURN jsonb_build_object('autoHidden', v_auto_hidden, 'tempMap', v_temp_map);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- RPCs: Enrollment (service-role only — called from API routes)
-- =============================================================================

-- Token cost is looked up from products internally — never trust the caller.
CREATE OR REPLACE FUNCTION enroll_gamer_in_group(
  p_customer_id UUID,
  p_gamer_id UUID,
  p_group_id UUID,
  p_session_date DATE
)
RETURNS TABLE(enrollment_id UUID, transaction_id UUID, new_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_product_name TEXT;
  v_token_cost INTEGER;
  v_enrollment_id UUID;
  v_transaction_id UUID;
  v_new_balance INTEGER;
BEGIN
  -- Verify caller identity: browser callers must be the customer themselves.
  -- auth.uid() IS NULL allows service-role (admin client) used by API routes.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_customer_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Verify group exists and get product info (including authoritative token cost)
  SELECT pg.product_id, p.name, p.token_cost
    INTO v_product_id, v_product_name, v_token_cost
    FROM product_groups pg
    JOIN products p ON p.id = pg.product_id
   WHERE pg.id = p_group_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Verify customer is parent of gamer
  IF NOT EXISTS (
    SELECT 1 FROM parent_gamer
     WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to enroll this gamer';
  END IF;

  -- Verify gamer not already actively enrolled in this product
  IF EXISTS (
    SELECT 1
      FROM group_enrollments ge
      JOIN product_groups pg ON pg.id = ge.group_id
     WHERE ge.gamer_id = p_gamer_id
       AND pg.product_id = v_product_id
       AND ge.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Gamer is already enrolled in this product'
      USING ERRCODE = '23505';
  END IF;

  -- Deduct tokens (CHECK constraint on customer_profiles prevents overdraft)
  SELECT atb.new_balance, atb.transaction_id
    INTO v_new_balance, v_transaction_id
    FROM adjust_token_balance(
      p_customer_id,
      -v_token_cost,
      'enrollment',
      'Enrollment: ' || v_product_name
    ) atb;

  -- Insert enrollment
  INSERT INTO group_enrollments (group_id, gamer_id, enrolled_by, status, last_charged_at)
  VALUES (p_group_id, p_gamer_id, p_customer_id, 'active', NOW())
  RETURNING id INTO v_enrollment_id;

  -- Insert first charge record
  INSERT INTO enrollment_charges (enrollment_id, amount, transaction_id, session_date)
  VALUES (v_enrollment_id, v_token_cost, v_transaction_id, p_session_date);

  RETURN QUERY SELECT v_enrollment_id, v_transaction_id, v_new_balance;
END;
$$;

-- Refund amount is looked up from products internally — caller only controls
-- *whether* to refund (boolean), not *how much*.
CREATE OR REPLACE FUNCTION unenroll_gamer(
  p_customer_id UUID,
  p_enrollment_id UUID,
  p_refund BOOLEAN
)
RETURNS TABLE(new_balance INTEGER, refund_transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrolled_by UUID;
  v_status TEXT;
  v_product_name TEXT;
  v_token_cost INTEGER;
  v_new_balance INTEGER;
  v_refund_tx_id UUID;
  v_latest_charge_id UUID;
BEGIN
  -- Verify caller identity: browser callers must be the customer themselves.
  -- auth.uid() IS NULL allows service-role (admin client) used by API routes.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_customer_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Verify enrollment exists and get details (including authoritative token cost)
  SELECT ge.enrolled_by, ge.status, p.name, p.token_cost
    INTO v_enrolled_by, v_status, v_product_name, v_token_cost
    FROM group_enrollments ge
    JOIN product_groups pg ON pg.id = ge.group_id
    JOIN products p ON p.id = pg.product_id
   WHERE ge.id = p_enrollment_id;

  IF v_enrolled_by IS NULL THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  IF v_enrolled_by <> p_customer_id THEN
    RAISE EXCEPTION 'Not authorized to unenroll this gamer';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Enrollment is not active';
  END IF;

  -- Mark as unenrolled
  UPDATE group_enrollments
     SET status = 'unenrolled',
         unenrolled_at = NOW()
   WHERE id = p_enrollment_id;

  -- Process refund if applicable
  IF p_refund THEN
    SELECT atb.new_balance, atb.transaction_id
      INTO v_new_balance, v_refund_tx_id
      FROM adjust_token_balance(
        p_customer_id,
        v_token_cost,
        'enrollment_refund',
        'Unenrollment refund: ' || v_product_name
      ) atb;

    -- Mark the latest charge as refunded
    SELECT id INTO v_latest_charge_id
      FROM enrollment_charges
     WHERE enrollment_id = p_enrollment_id
       AND refunded_at IS NULL
     ORDER BY session_date DESC
     LIMIT 1;

    IF v_latest_charge_id IS NOT NULL THEN
      UPDATE enrollment_charges
         SET refunded_at = NOW(),
             refund_transaction_id = v_refund_tx_id
       WHERE id = v_latest_charge_id;
    END IF;
  ELSE
    -- No refund — just return current balance
    SELECT cp.token_balance INTO v_new_balance
      FROM customer_profiles cp
     WHERE cp.user_id = p_customer_id;

    v_refund_tx_id := NULL;
  END IF;

  RETURN QUERY SELECT v_new_balance, v_refund_tx_id;
END;
$$;

-- =============================================================================
-- RPCs: Customer-facing queries
-- =============================================================================

CREATE OR REPLACE FUNCTION get_customer_enrollments(p_customer_id UUID)
RETURNS TABLE(
  enrollment_id UUID,
  group_id UUID,
  gamer_id UUID,
  gamer_display_name TEXT,
  status TEXT,
  enrolled_at TIMESTAMPTZ,
  last_charged_at TIMESTAMPTZ,
  unenrolled_at TIMESTAMPTZ,
  product_id UUID,
  product_name TEXT,
  product_image_url TEXT,
  product_token_cost INTEGER,
  product_day_of_week SMALLINT,
  product_start_time TIME,
  product_timezone TEXT,
  product_duration_minutes INTEGER,
  product_padlet_url TEXT,
  gedu_display_name TEXT,
  last_charge_session_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Verify caller identity: browser callers must be the customer themselves.
  -- auth.uid() IS NULL allows service-role (admin client) used by API routes.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_customer_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ge.id AS enrollment_id,
    ge.group_id,
    ge.gamer_id,
    gp.display_name AS gamer_display_name,
    ge.status,
    ge.created_at AS enrolled_at,
    ge.last_charged_at,
    ge.unenrolled_at,
    p.id AS product_id,
    p.name AS product_name,
    p.image_url AS product_image_url,
    p.token_cost AS product_token_cost,
    p.day_of_week AS product_day_of_week,
    p.start_time AS product_start_time,
    p.timezone AS product_timezone,
    p.duration_minutes AS product_duration_minutes,
    p.padlet_url AS product_padlet_url,
    gedu.display_name AS gedu_display_name,
    (SELECT ec.session_date
       FROM enrollment_charges ec
      WHERE ec.enrollment_id = ge.id
      ORDER BY ec.session_date DESC
      LIMIT 1
    ) AS last_charge_session_date
  FROM group_enrollments ge
  JOIN product_groups pg ON pg.id = ge.group_id
  JOIN products p ON p.id = pg.product_id
  JOIN profiles gp ON gp.id = ge.gamer_id
  JOIN profiles gedu ON gedu.id = pg.gedu_id
  WHERE ge.enrolled_by = p_customer_id
  ORDER BY
    CASE ge.status WHEN 'active' THEN 0 ELSE 1 END,
    ge.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_enrollment_groups(p_product_id UUID)
RETURNS TABLE(
  group_id UUID,
  gedu_display_name TEXT,
  gamer_count BIGINT,
  min_gamer_age INTEGER,
  max_gamer_age INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM products WHERE id = p_product_id AND is_visible = true
  ) THEN
    RAISE EXCEPTION 'Product not found or not visible';
  END IF;

  RETURN QUERY
  SELECT
    pg.id AS group_id,
    gedu.display_name AS gedu_display_name,
    COUNT(ge.id) AS gamer_count,
    MIN(EXTRACT(YEAR FROM AGE(gprof.date_of_birth))::INTEGER) AS min_gamer_age,
    MAX(EXTRACT(YEAR FROM AGE(gprof.date_of_birth))::INTEGER) AS max_gamer_age
  FROM product_groups pg
  JOIN profiles gedu ON gedu.id = pg.gedu_id
  LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
  LEFT JOIN gamer_profiles gprof ON gprof.user_id = ge.gamer_id
  WHERE pg.product_id = p_product_id
  GROUP BY pg.id, gedu.display_name, pg.display_order
  ORDER BY pg.display_order;
END;
$$;
