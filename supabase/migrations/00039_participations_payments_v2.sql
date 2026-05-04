-- Participations, payments, refunds, family subscriptions, session credits.
--
-- This migration lays down the customer-purchase half of the products_v2 system.
-- Admin product creation and the parent browse pages are already live (00030–00038);
-- this is what makes those products actually buyable.
--
-- See docs/products-redesign.md §§ 4.5, 4.5b, 4.6, 4.6a, 5.1a, 5.5, 5.7, 5.7a,
-- 5.8, 6.1, 6.3 — and docs/plans/v2-stripe-participations-plan.md for the
-- implementation handoff.
--
-- All RPCs are SECURITY DEFINER, start private (REVOKE EXECUTE FROM
-- authenticated/anon/public), and acquire a per-product row lock (the gate)
-- before any seat-count read. None of these RPCs are intentionally browser-
-- callable; API routes invoke them via createAdminClient().

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE participation_status_v2 AS ENUM (
  'reserving',
  'active',
  'waitlisted',
  'completed'
);

CREATE TYPE subscription_frequency_v2 AS ENUM (
  'monthly',
  'quarterly',
  'yearly'
);

CREATE TYPE payment_purpose_v2 AS ENUM (
  'bundle',
  'subscription_invoice',
  'single_payment'
);

CREATE TYPE refund_reason_v2 AS ENUM (
  'session_cancelled_in_window',
  'admin_refund',
  'product_cancelled',
  'subscription_item_removed',
  'subscription_period_proration',
  'lost_seat_after_payment'
);

-- effective_status_v2 returns the same shape as the TS effective-status helper,
-- which adds 'expired' to ProductStatusV2. Storing as a separate enum keeps
-- product_status_v2 clean (admin-driven facts only — see §4.11).
CREATE TYPE effective_product_status_v2 AS ENUM (
  'draft',
  'pending',
  'running',
  'completed',
  'cancelled',
  'expired'
);

-- =============================================================================
-- participations_v2
-- =============================================================================

CREATE TABLE participations_v2 (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID NOT NULL REFERENCES products_v2(id) ON DELETE CASCADE,
  group_id           UUID REFERENCES product_groups(id) ON DELETE SET NULL,
  gamer_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status             participation_status_v2 NOT NULL,
  reserved_until     TIMESTAMPTZ,
  waitlist_position  INTEGER,
  credits_remaining  INTEGER NOT NULL DEFAULT 0,
  signed_up_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_participations_v2_credits_non_negative
    CHECK (credits_remaining >= 0),

  CONSTRAINT chk_participations_v2_reserving_has_until
    CHECK (status <> 'reserving' OR reserved_until IS NOT NULL),

  CONSTRAINT chk_participations_v2_waitlisted_has_position
    CHECK (status <> 'waitlisted' OR waitlist_position IS NOT NULL),

  -- Reserving rows aren't unique yet — a parent who clicked, abandoned,
  -- and clicked again may have multiple reserving rows for the same
  -- (product, gamer) until expiry. The non-reserving uniqueness lives in
  -- a partial UNIQUE INDEX below so re-signup-after-leave still works.
  CONSTRAINT chk_participations_v2_no_self_signup
    CHECK (gamer_id <> customer_id)
);

-- One non-reserving row per (product, gamer). Lets a parent re-sign-up after
-- cancellation, and lets a reserving row coexist with an active row briefly
-- during a webhook flip. The seat-count math reconciles via the gate lock.
CREATE UNIQUE INDEX uq_participations_v2_active_or_waitlisted
  ON participations_v2(product_id, gamer_id)
  WHERE status IN ('active', 'waitlisted', 'completed');

-- Partial indexes feeding count_seats_taken_v2 / count_active_seats_v2.
CREATE INDEX idx_participations_v2_active
  ON participations_v2(product_id)
  WHERE status = 'active';

CREATE INDEX idx_participations_v2_waitlisted
  ON participations_v2(product_id, waitlist_position)
  WHERE status = 'waitlisted';

CREATE INDEX idx_participations_v2_reserving_live
  ON participations_v2(product_id, reserved_until)
  WHERE status = 'reserving';

CREATE INDEX idx_participations_v2_customer
  ON participations_v2(customer_id);

CREATE INDEX idx_participations_v2_gamer
  ON participations_v2(gamer_id);

CREATE INDEX idx_participations_v2_group
  ON participations_v2(group_id)
  WHERE group_id IS NOT NULL;

-- group_id (if set) must reference a group on the same product.
CREATE OR REPLACE FUNCTION validate_participations_v2_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
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

REVOKE EXECUTE ON FUNCTION validate_participations_v2_group() FROM authenticated, anon, public;

CREATE TRIGGER trg_validate_participations_v2_group
  BEFORE INSERT OR UPDATE OF group_id, product_id ON participations_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_participations_v2_group();

CREATE TRIGGER participations_v2_updated_at
  BEFORE UPDATE ON participations_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE participations_v2 ENABLE ROW LEVEL SECURITY;

-- Admin: full access.
CREATE POLICY "admin_full_access_participations_v2"
  ON participations_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Customer: SELECT own rows. No INSERT/UPDATE/DELETE — all writes via RPCs.
CREATE POLICY "customer_select_own_participations_v2"
  ON participations_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND customer_id = (SELECT auth.uid())
  );

-- Gamer: SELECT own rows.
CREATE POLICY "gamer_select_own_participations_v2"
  ON participations_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'gamer'
    AND gamer_id = (SELECT auth.uid())
  );

-- =============================================================================
-- payments_v2
-- =============================================================================

CREATE TABLE payments_v2 (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  amount_cents              INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency                  TEXT NOT NULL CHECK (currency IN ('eur', 'gbp', 'usd')),
  purpose                   payment_purpose_v2 NOT NULL,
  stripe_payment_intent_id  TEXT,
  stripe_invoice_id         TEXT,
  stripe_event_id           TEXT NOT NULL UNIQUE,
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_v2_customer ON payments_v2(customer_id);
CREATE INDEX idx_payments_v2_invoice ON payments_v2(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX idx_payments_v2_payment_intent ON payments_v2(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE payments_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_payments_v2"
  ON payments_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "customer_select_own_payments_v2"
  ON payments_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND customer_id = (SELECT auth.uid())
  );

-- =============================================================================
-- refunds_v2
-- =============================================================================

CREATE TABLE refunds_v2 (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        UUID NOT NULL REFERENCES payments_v2(id) ON DELETE RESTRICT,
  amount_cents      INTEGER NOT NULL CHECK (amount_cents >= 0),
  reason            refund_reason_v2 NOT NULL,
  stripe_refund_id  TEXT NOT NULL UNIQUE,
  stripe_event_id   TEXT NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refunds_v2_payment ON refunds_v2(payment_id);

ALTER TABLE refunds_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_refunds_v2"
  ON refunds_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "customer_select_own_refunds_v2"
  ON refunds_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND EXISTS (
      SELECT 1 FROM payments_v2 p
      WHERE p.id = refunds_v2.payment_id
        AND p.customer_id = (SELECT auth.uid())
    )
  );

-- =============================================================================
-- family_subscriptions_v2 + family_subscription_items_v2
-- =============================================================================

CREATE TABLE family_subscriptions_v2 (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  stripe_subscription_id   TEXT NOT NULL UNIQUE,
  stripe_customer_id       TEXT NOT NULL,
  frequency                subscription_frequency_v2 NOT NULL,
  currency                 TEXT NOT NULL CHECK (currency IN ('eur', 'gbp', 'usd')),
  status                   TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'cancelled', 'incomplete', 'canceling')),
  current_period_end       TIMESTAMPTZ,
  discount_coupon_id       TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, frequency, currency)
);

CREATE INDEX idx_family_subscriptions_v2_customer ON family_subscriptions_v2(customer_id);

CREATE TRIGGER family_subscriptions_v2_updated_at
  BEFORE UPDATE ON family_subscriptions_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE family_subscriptions_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_family_subscriptions_v2"
  ON family_subscriptions_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "customer_select_own_family_subscriptions_v2"
  ON family_subscriptions_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND customer_id = (SELECT auth.uid())
  );

CREATE TABLE family_subscription_items_v2 (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_subscription_id        UUID NOT NULL REFERENCES family_subscriptions_v2(id) ON DELETE CASCADE,
  participation_id              UUID NOT NULL REFERENCES participations_v2(id) ON DELETE CASCADE,
  stripe_subscription_item_id   TEXT NOT NULL UNIQUE,
  stripe_price_id               TEXT NOT NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_subscription_id, participation_id)
);

CREATE INDEX idx_family_subscription_items_v2_participation ON family_subscription_items_v2(participation_id);

ALTER TABLE family_subscription_items_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_family_subscription_items_v2"
  ON family_subscription_items_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "customer_select_own_family_subscription_items_v2"
  ON family_subscription_items_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND EXISTS (
      SELECT 1 FROM family_subscriptions_v2 fs
      WHERE fs.id = family_subscription_items_v2.family_subscription_id
        AND fs.customer_id = (SELECT auth.uid())
    )
  );

-- =============================================================================
-- product_subscription_prices_v2 — Stripe Price IDs, lazy-populated (§5.1a)
-- =============================================================================

CREATE TABLE product_subscription_prices_v2 (
  product_id          UUID NOT NULL REFERENCES products_v2(id) ON DELETE CASCADE,
  frequency           subscription_frequency_v2 NOT NULL,
  currency            TEXT NOT NULL CHECK (currency IN ('eur', 'gbp', 'usd')),
  stripe_price_id     TEXT NOT NULL,
  unit_amount_cents   INTEGER NOT NULL CHECK (unit_amount_cents >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, frequency, currency)
);

ALTER TABLE product_subscription_prices_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_product_subscription_prices_v2"
  ON product_subscription_prices_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Stripe Price IDs are implementation detail — parents only ever see the
-- computed display price from product_prices_v2 + hardcoded constants.
-- No public read policy.

-- =============================================================================
-- session_cancellations_v2 — customer-initiated single-session cancels (§6.3)
-- =============================================================================
--
-- Ships in this PR even though the cancel-session UI does not. Lets the cron's
-- branch logic fire correctly the moment the UI lands as a follow-up.

CREATE TABLE session_cancellations_v2 (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id  UUID NOT NULL REFERENCES participations_v2(id) ON DELETE CASCADE,
  session_date      DATE NOT NULL,
  cancelled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participation_id, session_date)
);

CREATE INDEX idx_session_cancellations_v2_session_date ON session_cancellations_v2(session_date);

ALTER TABLE session_cancellations_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_session_cancellations_v2"
  ON session_cancellations_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "customer_select_own_session_cancellations_v2"
  ON session_cancellations_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND EXISTS (
      SELECT 1 FROM participations_v2 p
      WHERE p.id = session_cancellations_v2.participation_id
        AND p.customer_id = (SELECT auth.uid())
    )
  );

-- =============================================================================
-- credit_deductions_v2 — append-only audit ledger for cron motion (§6.3)
-- =============================================================================

CREATE TABLE credit_deductions_v2 (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id  UUID NOT NULL REFERENCES participations_v2(id) ON DELETE CASCADE,
  gamer_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products_v2(id) ON DELETE CASCADE,
  session_date      DATE NOT NULL,
  delta             INTEGER NOT NULL CHECK (delta IN (-1, 0, 1)),
  reason            TEXT NOT NULL,
  processed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participation_id, session_date)
);

CREATE INDEX idx_credit_deductions_v2_processed_at ON credit_deductions_v2(processed_at);

ALTER TABLE credit_deductions_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_credit_deductions_v2"
  ON credit_deductions_v2 FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

CREATE POLICY "customer_select_own_credit_deductions_v2"
  ON credit_deductions_v2 FOR SELECT TO authenticated
  USING (
    (SELECT get_user_role()) = 'customer'
    AND EXISTS (
      SELECT 1 FROM participations_v2 p
      WHERE p.id = credit_deductions_v2.participation_id
        AND p.customer_id = (SELECT auth.uid())
    )
  );

-- =============================================================================
-- product_seat_counts_v2 — public-readable rollup feeding the realtime counter
-- =============================================================================
--
-- Supabase Realtime respects RLS, and the participations_v2 policies hide other
-- customers' rows. Subscribing directly would only fire for the viewer's own
-- participations — useless for a seat counter. The rollup table has permissive
-- SELECT (no PII, just counts) so every viewer sees the same updates.

CREATE TABLE product_seat_counts_v2 (
  product_id        UUID PRIMARY KEY REFERENCES products_v2(id) ON DELETE CASCADE,
  active_count      INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0),
  reserving_count   INTEGER NOT NULL DEFAULT 0 CHECK (reserving_count >= 0),
  waitlist_count    INTEGER NOT NULL DEFAULT 0 CHECK (waitlist_count >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE product_seat_counts_v2 ENABLE ROW LEVEL SECURITY;

-- Anyone can SELECT — counts only, no PII.
CREATE POLICY "public_read_product_seat_counts_v2"
  ON product_seat_counts_v2 FOR SELECT TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for any role — writes happen via the trigger
-- below, which is SECURITY DEFINER and bypasses RLS.

-- Trigger that recomputes counts for the affected product on any participations_v2
-- mutation. Idempotent — uses INSERT ... ON CONFLICT.
CREATE OR REPLACE FUNCTION refresh_product_seat_counts_v2(p_product_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    FROM public.participations_v2
    WHERE product_id = p_product_id;

  INSERT INTO public.product_seat_counts_v2 (
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

REVOKE EXECUTE ON FUNCTION refresh_product_seat_counts_v2(UUID) FROM authenticated, anon, public;

CREATE OR REPLACE FUNCTION trg_refresh_product_seat_counts_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_product_seat_counts_v2(OLD.product_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_product_seat_counts_v2(NEW.product_id);

  -- An UPDATE that moved a row to a different product needs the old product
  -- recomputed too (theoretical — product_id doesn't change in practice,
  -- but the trigger covers it anyway).
  IF TG_OP = 'UPDATE' AND OLD.product_id <> NEW.product_id THEN
    PERFORM public.refresh_product_seat_counts_v2(OLD.product_id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION trg_refresh_product_seat_counts_v2() FROM authenticated, anon, public;

CREATE TRIGGER trg_participations_v2_refresh_counts_ins
  AFTER INSERT ON participations_v2
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_product_seat_counts_v2();

CREATE TRIGGER trg_participations_v2_refresh_counts_upd
  AFTER UPDATE OF status, reserved_until, product_id ON participations_v2
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_product_seat_counts_v2();

CREATE TRIGGER trg_participations_v2_refresh_counts_del
  AFTER DELETE ON participations_v2
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_product_seat_counts_v2();

-- Seed the rollup for any existing products (none in practice — admin UI
-- only creates products; participations are net-new in this migration).
INSERT INTO product_seat_counts_v2 (product_id, active_count, reserving_count, waitlist_count)
SELECT id, 0, 0, 0 FROM products_v2
ON CONFLICT (product_id) DO NOTHING;

-- Add to the Supabase Realtime publication so clients can subscribe.
ALTER PUBLICATION supabase_realtime ADD TABLE product_seat_counts_v2;

-- =============================================================================
-- SQL helper functions
-- =============================================================================

-- Mirrors src/components/admin/products-v2/effective-status.ts. Reads start_date,
-- end_date, signup_threshold, status, projects now() into products_v2.timezone,
-- compares to date-only fields, plus active participation count.
CREATE OR REPLACE FUNCTION effective_status_v2(p_product_id UUID)
RETURNS effective_product_status_v2
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status            public.product_status_v2;
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
    FROM public.products_v2
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
      FROM public.participations_v2
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

REVOKE EXECUTE ON FUNCTION effective_status_v2(UUID) FROM authenticated, anon, public;

-- Counts of currently-active seats. Also exposed for browse seat math.
CREATE OR REPLACE FUNCTION count_active_seats_v2(p_product_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)::INTEGER
    FROM public.participations_v2
    WHERE product_id = p_product_id AND status = 'active';
$$;

REVOKE EXECUTE ON FUNCTION count_active_seats_v2(UUID) FROM authenticated, anon, public;

-- Active + non-expired-reserving rows (race-aware seat math for create_participation).
CREATE OR REPLACE FUNCTION count_seats_taken_v2(p_product_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)::INTEGER
    FROM public.participations_v2
    WHERE product_id = p_product_id
      AND (
        status = 'active'
        OR (status = 'reserving' AND reserved_until > NOW())
      );
$$;

REVOKE EXECUTE ON FUNCTION count_seats_taken_v2(UUID) FROM authenticated, anon, public;

-- ParticipationState helper — maps to TS `'waitlisted' | 'unassigned' | 'assigned'`.
CREATE OR REPLACE FUNCTION participation_state_v2(
  p_status   participation_status_v2,
  p_group_id UUID
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_status = 'waitlisted' THEN 'waitlisted'
    WHEN p_group_id IS NULL      THEN 'unassigned'
    ELSE 'assigned'
  END;
$$;

REVOKE EXECUTE ON FUNCTION participation_state_v2(participation_status_v2, UUID) FROM authenticated, anon, public;

-- =============================================================================
-- RPCs — participation lifecycle (§6.1)
-- =============================================================================

-- Reservation lifetime — matched to Stripe Checkout session lifetime (§4.6a).
-- 30 minutes. Mirrored in src/lib/constants/pricing-v2.ts.

-- create_participation_v2
--
-- Returns a JSONB payload with `kind` discriminator:
--   { "kind": "free_active",  "participation_id": uuid }
--   { "kind": "reserving",    "participation_id": uuid, "reserved_until": ts }
--   { "kind": "full" }
--
-- The route layer then either redirects to Stripe Checkout (reserving) or
-- flips the UI to the waitlist CTA (full).
CREATE OR REPLACE FUNCTION create_participation_v2(
  p_product_id      UUID,
  p_gamer_id        UUID,
  p_customer_id     UUID,
  p_purchase_shape  TEXT,
  p_currency        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product               public.products_v2;
  v_eff_status            public.effective_product_status_v2;
  v_seats_taken           INTEGER;
  v_existing_id           UUID;
  v_existing_status       public.participation_status_v2;
  v_participation_id      UUID;
  v_reserved_until        TIMESTAMPTZ;
  v_is_parent             BOOLEAN;
BEGIN
  -- Gate lock: serialize seat math on this product (§4.6).
  SELECT * INTO v_product FROM public.products_v2 WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Validate parent-gamer relationship.
  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_gamer_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validate effective status permits signup.
  v_eff_status := public.effective_status_v2(p_product_id);
  IF v_eff_status NOT IN ('pending', 'running') THEN
    RAISE EXCEPTION 'product is not accepting signups (effective status: %)', v_eff_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- registration_opens_at gate.
  IF v_product.registration_opens_at IS NOT NULL
     AND v_product.registration_opens_at > NOW() THEN
    RAISE EXCEPTION 'registration has not yet opened'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validate currency.
  IF p_currency NOT IN ('eur', 'gbp', 'usd') THEN
    RAISE EXCEPTION 'unsupported currency: %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validate purchase shape.
  IF p_purchase_shape NOT IN (
    'bundle_1', 'bundle_4', 'bundle_10',
    'subscription_monthly', 'subscription_quarterly',
    'single_payment', 'free'
  ) THEN
    RAISE EXCEPTION 'unsupported purchase shape: %', p_purchase_shape
      USING ERRCODE = 'check_violation';
  END IF;

  -- Already-signed-up check (active or waitlisted).
  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations_v2
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
      AND status IN ('active', 'waitlisted')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a % participation on this product', p_gamer_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Free path: no Stripe, immediate active.
  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations_v2 (
      product_id, gamer_id, customer_id, status, credits_remaining
    ) VALUES (
      p_product_id, p_gamer_id, p_customer_id, 'active', 0
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'free_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Seat-count check (race-aware).
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_seats_taken_v2(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  -- Insert reserving row.
  v_reserved_until := NOW() + INTERVAL '30 minutes';
  INSERT INTO public.participations_v2 (
    product_id, gamer_id, customer_id, status, reserved_until, credits_remaining
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'reserving', v_reserved_until, 0
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'kind', 'reserving',
    'participation_id', v_participation_id,
    'reserved_until', v_reserved_until
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_participation_v2(UUID, UUID, UUID, TEXT, TEXT) FROM authenticated, anon, public;

-- join_waitlist_v2
--
-- Idempotent: returns the existing waitlist row if the gamer is already on it.
-- No Stripe call ever made.
CREATE OR REPLACE FUNCTION join_waitlist_v2(
  p_product_id   UUID,
  p_gamer_id     UUID,
  p_customer_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product           public.products_v2;
  v_existing_id       UUID;
  v_existing_pos      INTEGER;
  v_existing_status   public.participation_status_v2;
  v_next_position     INTEGER;
  v_participation_id  UUID;
  v_is_parent         BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products_v2 WHERE id = p_product_id FOR UPDATE;
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
    FROM public.participations_v2
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
    FROM public.participations_v2
    WHERE product_id = p_product_id AND status = 'waitlisted';

  INSERT INTO public.participations_v2 (
    product_id, gamer_id, customer_id, status, waitlist_position, credits_remaining
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'waitlisted', v_next_position, 0
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_next_position,
    'status', 'waitlisted'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION join_waitlist_v2(UUID, UUID, UUID) FROM authenticated, anon, public;

-- confirm_reservation_v2
--
-- Webhook-only. Gate-locks the product; if the reservation is still live
-- (or expired but a seat is free), flips reserving → active and grants
-- p_credits_to_grant. Otherwise returns lost_seat (webhook refunds + waitlists).
CREATE OR REPLACE FUNCTION confirm_reservation_v2(
  p_reservation_id    UUID,
  p_credits_to_grant  INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id      UUID;
  v_gamer_id        UUID;
  v_customer_id     UUID;
  v_status          public.participation_status_v2;
  v_reserved_until  TIMESTAMPTZ;
  v_seat_count      INTEGER;
  v_seats_taken     INTEGER;
BEGIN
  -- Read the reservation row first so we know the product to gate-lock.
  SELECT product_id, gamer_id, customer_id, status, reserved_until
    INTO v_product_id, v_gamer_id, v_customer_id, v_status, v_reserved_until
    FROM public.participations_v2
    WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'lost_seat');
  END IF;

  -- Idempotency: already-confirmed reservation returns confirmed.
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
    RETURN jsonb_build_object('kind', 'lost_seat');
  END IF;

  -- Gate lock.
  PERFORM 1 FROM public.products_v2 WHERE id = v_product_id FOR UPDATE;

  SELECT seat_count INTO v_seat_count FROM public.products_v2 WHERE id = v_product_id;

  -- Reservation still live → confirm.
  IF v_reserved_until > NOW() THEN
    UPDATE public.participations_v2
       SET status = 'active',
           reserved_until = NULL,
           credits_remaining = p_credits_to_grant
     WHERE id = p_reservation_id;
    RETURN jsonb_build_object(
      'kind', 'confirmed',
      'participation_id', p_reservation_id,
      'product_id', v_product_id,
      'gamer_id', v_gamer_id,
      'customer_id', v_customer_id,
      'idempotent', FALSE
    );
  END IF;

  -- Reservation expired but a seat is still available → confirm anyway.
  IF v_seat_count IS NULL THEN
    UPDATE public.participations_v2
       SET status = 'active',
           reserved_until = NULL,
           credits_remaining = p_credits_to_grant
     WHERE id = p_reservation_id;
    RETURN jsonb_build_object(
      'kind', 'confirmed',
      'participation_id', p_reservation_id,
      'product_id', v_product_id,
      'gamer_id', v_gamer_id,
      'customer_id', v_customer_id,
      'idempotent', FALSE
    );
  END IF;

  -- Count active rows only — other expired-reserving rows don't take seats.
  SELECT COUNT(*) INTO v_seats_taken
    FROM public.participations_v2
    WHERE product_id = v_product_id AND status = 'active';

  IF v_seats_taken < v_seat_count THEN
    UPDATE public.participations_v2
       SET status = 'active',
           reserved_until = NULL,
           credits_remaining = p_credits_to_grant
     WHERE id = p_reservation_id;
    RETURN jsonb_build_object(
      'kind', 'confirmed',
      'participation_id', p_reservation_id,
      'product_id', v_product_id,
      'gamer_id', v_gamer_id,
      'customer_id', v_customer_id,
      'idempotent', FALSE
    );
  END IF;

  -- Lost the seat.
  RETURN jsonb_build_object(
    'kind', 'lost_seat',
    'participation_id', p_reservation_id,
    'product_id', v_product_id,
    'gamer_id', v_gamer_id,
    'customer_id', v_customer_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_reservation_v2(UUID, INTEGER) FROM authenticated, anon, public;

-- expire_reservation_v2 — webhook helper for checkout.session.expired.
CREATE OR REPLACE FUNCTION expire_reservation_v2(p_reservation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id UUID;
  v_status     public.participation_status_v2;
BEGIN
  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations_v2 WHERE id = p_reservation_id;

  IF NOT FOUND OR v_status <> 'reserving' THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  PERFORM 1 FROM public.products_v2 WHERE id = v_product_id FOR UPDATE;

  DELETE FROM public.participations_v2 WHERE id = p_reservation_id AND status = 'reserving';

  RETURN jsonb_build_object('kind', 'expired');
END;
$$;

REVOKE EXECUTE ON FUNCTION expire_reservation_v2(UUID) FROM authenticated, anon, public;

-- promote_from_waitlist_v2 — picks lowest-position waitlist row and returns it.
-- The route layer is responsible for the notification.
CREATE OR REPLACE FUNCTION promote_from_waitlist_v2(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    FROM public.participations_v2
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

REVOKE EXECUTE ON FUNCTION promote_from_waitlist_v2(UUID) FROM authenticated, anon, public;

-- cancel_participation_v2 — admin/internal. Hard-DELETE active row, return
-- linked stripe_subscription_item_id (if any) so the route layer can clean up
-- Stripe. Promotes from waitlist as a separate call.
CREATE OR REPLACE FUNCTION cancel_participation_v2(
  p_participation_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id                  UUID;
  v_status                      public.participation_status_v2;
  v_credits_remaining           INTEGER;
  v_stripe_subscription_item_id TEXT;
  v_family_subscription_id      UUID;
BEGIN
  SELECT product_id, status, credits_remaining
    INTO v_product_id, v_status, v_credits_remaining
    FROM public.participations_v2
    WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  PERFORM 1 FROM public.products_v2 WHERE id = v_product_id FOR UPDATE;

  -- Pull linked Stripe item before delete (CASCADE removes the row).
  SELECT stripe_subscription_item_id, family_subscription_id
    INTO v_stripe_subscription_item_id, v_family_subscription_id
    FROM public.family_subscription_items_v2
    WHERE participation_id = p_participation_id
    LIMIT 1;

  DELETE FROM public.participations_v2 WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'cancelled',
    'product_id', v_product_id,
    'previous_status', v_status::text,
    'forfeited_credits', v_credits_remaining,
    'stripe_subscription_item_id', v_stripe_subscription_item_id,
    'family_subscription_id', v_family_subscription_id,
    'reason', p_reason
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_participation_v2(UUID, TEXT) FROM authenticated, anon, public;

-- =============================================================================
-- Cron helpers (§6.3)
-- =============================================================================

-- apply_credit_motion_v2 — append-only with idempotency on (participation, date).
CREATE OR REPLACE FUNCTION apply_credit_motion_v2(
  p_participation_id  UUID,
  p_session_date      DATE,
  p_delta             INTEGER,
  p_reason            TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gamer_id    UUID;
  v_product_id  UUID;
  v_balance     INTEGER;
  v_inserted    BOOLEAN := FALSE;
BEGIN
  IF p_delta NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'invalid delta: %', p_delta USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the participation row to prevent concurrent motion.
  SELECT gamer_id, product_id, credits_remaining
    INTO v_gamer_id, v_product_id, v_balance
    FROM public.participations_v2
    WHERE id = p_participation_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Underflow guard: a bundle attempting to drop below 0 logs as a no-op
  -- (delta=0) with the reason annotated. Caller can detect via the row's reason.
  IF p_delta = -1 AND v_balance <= 0 THEN
    INSERT INTO public.credit_deductions_v2 (
      participation_id, gamer_id, product_id, session_date, delta, reason
    ) VALUES (
      p_participation_id, v_gamer_id, v_product_id, p_session_date, 0,
      p_reason || '_underflow_skipped'
    )
    ON CONFLICT (participation_id, session_date) DO NOTHING;
    RETURN FALSE;
  END IF;

  INSERT INTO public.credit_deductions_v2 (
    participation_id, gamer_id, product_id, session_date, delta, reason
  ) VALUES (
    p_participation_id, v_gamer_id, v_product_id, p_session_date, p_delta, p_reason
  )
  ON CONFLICT (participation_id, session_date) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    -- Already processed this (participation, date) — idempotent skip.
    RETURN FALSE;
  END IF;

  IF p_delta <> 0 THEN
    UPDATE public.participations_v2
       SET credits_remaining = credits_remaining + p_delta
     WHERE id = p_participation_id;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION apply_credit_motion_v2(UUID, DATE, INTEGER, TEXT) FROM authenticated, anon, public;

-- product_has_session_v2 — reusable helper used by the cron and (later) by
-- session_overrides_v2 / attendance triggers. Sessions exist iff the date has
-- a matching schedule slot AND no holiday calendar contains that date AND
-- (future) no session_overrides_v2 row sets cancelled=true. The override table
-- isn't shipped yet so the cron sees only schedule + holidays for now.
CREATE OR REPLACE FUNCTION product_has_session_v2(
  p_product_id    UUID,
  p_session_date  DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH p AS (
    SELECT timezone FROM public.products_v2 WHERE id = p_product_id
  )
  SELECT
    EXISTS (
      SELECT 1 FROM public.schedule_slots_v2 s
      WHERE s.product_id = p_product_id
        AND s.weekday = (EXTRACT(ISODOW FROM p_session_date)::INTEGER - 1)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_holiday_calendars_v2 phc
      JOIN public.calendar_holidays_v2 ch ON ch.calendar_id = phc.calendar_id
      WHERE phc.product_id = p_product_id
        AND ch.date = p_session_date
    );
$$;

REVOKE EXECUTE ON FUNCTION product_has_session_v2(UUID, DATE) FROM authenticated, anon, public;

-- process_session_credits_v2 — hourly cron entry point.
--
-- For each active participation on a paid consumer-club product, finds the
-- session-start instants that fell in the last hour, resolves coverage at that
-- moment, and applies the four-rule motion table (§4.5).
--
-- Idempotent via UNIQUE on credit_deductions_v2(participation_id, session_date).
CREATE OR REPLACE FUNCTION process_session_credits_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_granted   INTEGER := 0;
  v_deducted  INTEGER := 0;
  v_errors    INTEGER := 0;
  v_rec       RECORD;
  v_session_start  TIMESTAMPTZ;
  v_session_date   DATE;
  v_was_cancelled  BOOLEAN;
  v_cancelled_in_window BOOLEAN;
  v_charge_window_hours CONSTANT INTEGER := 24;
  v_is_sub_covered BOOLEAN;
  v_applied        BOOLEAN;
  v_window_start   TIMESTAMPTZ;
  v_window_end     TIMESTAMPTZ;
BEGIN
  -- The cron lookback window: sessions whose start fell in the last hour.
  v_window_start := NOW() - INTERVAL '1 hour';
  v_window_end   := NOW();

  FOR v_rec IN
    SELECT
      pa.id           AS participation_id,
      pa.product_id,
      pa.gamer_id,
      p.timezone,
      ss.weekday,
      ss.start_time
      FROM public.participations_v2 pa
      JOIN public.products_v2 p ON p.id = pa.product_id
      JOIN public.schedule_slots_v2 ss ON ss.product_id = p.id
      WHERE pa.status = 'active'
        AND p.product_type = 'consumer_club'
        AND p.billing_mode = 'paid'
  LOOP
    BEGIN
      -- Compute the session_start for this slot relative to the lookback
      -- window. Project the most-recent local date that matches this slot's
      -- weekday and start_time into UTC.
      DECLARE
        v_now_local        TIMESTAMP;
        v_today_local      DATE;
        v_today_dow        INTEGER;
        v_days_back        INTEGER;
        v_candidate_date   DATE;
        v_candidate_ts     TIMESTAMPTZ;
      BEGIN
        v_now_local   := NOW() AT TIME ZONE v_rec.timezone;
        v_today_local := v_now_local::DATE;
        v_today_dow   := EXTRACT(ISODOW FROM v_now_local)::INTEGER - 1;

        -- Most recent occurrence of the target weekday at-or-before today.
        v_days_back := (v_today_dow - v_rec.weekday + 7) % 7;
        v_candidate_date := v_today_local - v_days_back;
        v_candidate_ts := (v_candidate_date + v_rec.start_time) AT TIME ZONE v_rec.timezone;

        -- If today's slot hasn't fired yet, step back another week.
        IF v_candidate_ts > NOW() THEN
          v_candidate_date := v_candidate_date - 7;
          v_candidate_ts := (v_candidate_date + v_rec.start_time) AT TIME ZONE v_rec.timezone;
        END IF;

        v_session_start := v_candidate_ts;
        v_session_date  := v_candidate_date;
      END;

      -- Outside the cron lookback window — skip.
      IF v_session_start < v_window_start OR v_session_start > v_window_end THEN
        CONTINUE;
      END IF;

      -- Validate the session actually exists (schedule + no holiday).
      IF NOT public.product_has_session_v2(v_rec.product_id, v_session_date) THEN
        CONTINUE;
      END IF;

      -- Already processed?
      IF EXISTS (
        SELECT 1 FROM public.credit_deductions_v2
        WHERE participation_id = v_rec.participation_id
          AND session_date = v_session_date
      ) THEN
        CONTINUE;
      END IF;

      -- Was this session cancelled in time?
      SELECT EXISTS (
        SELECT 1 FROM public.session_cancellations_v2
        WHERE participation_id = v_rec.participation_id
          AND session_date = v_session_date
          AND cancelled_at <= v_session_start - (v_charge_window_hours || ' hours')::INTERVAL
      ) INTO v_cancelled_in_window;

      SELECT EXISTS (
        SELECT 1 FROM public.session_cancellations_v2
        WHERE participation_id = v_rec.participation_id
          AND session_date = v_session_date
      ) INTO v_was_cancelled;

      -- Resolve coverage at this moment.
      SELECT EXISTS (
        SELECT 1 FROM public.family_subscription_items_v2 i
        JOIN public.family_subscriptions_v2 fs ON fs.id = i.family_subscription_id
        WHERE i.participation_id = v_rec.participation_id
          AND fs.status IN ('active', 'past_due', 'canceling')
      ) INTO v_is_sub_covered;

      IF v_is_sub_covered AND v_cancelled_in_window THEN
        v_applied := public.apply_credit_motion_v2(
          v_rec.participation_id, v_session_date, 1, 'sub_cancel_credit'
        );
        IF v_applied THEN v_granted := v_granted + 1; v_processed := v_processed + 1; END IF;
      ELSIF v_is_sub_covered THEN
        v_applied := public.apply_credit_motion_v2(
          v_rec.participation_id, v_session_date, 0, 'sub_covered'
        );
        IF v_applied THEN v_processed := v_processed + 1; END IF;
      ELSIF v_was_cancelled AND v_cancelled_in_window THEN
        v_applied := public.apply_credit_motion_v2(
          v_rec.participation_id, v_session_date, 0, 'bundle_cancel_no_charge'
        );
        IF v_applied THEN v_processed := v_processed + 1; END IF;
      ELSE
        v_applied := public.apply_credit_motion_v2(
          v_rec.participation_id, v_session_date, -1, 'bundle_attended_or_no_show'
        );
        IF v_applied THEN v_deducted := v_deducted + 1; v_processed := v_processed + 1; END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'process_session_credits_v2 failed for participation %: %',
        v_rec.participation_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'granted',   v_granted,
    'deducted',  v_deducted,
    'errors',    v_errors,
    'processed_at', NOW()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION process_session_credits_v2() FROM authenticated, anon, public;

-- =============================================================================
-- Table grants
-- =============================================================================
--
-- All tables here are RPC-write-only. Authenticated users get SELECT (gated
-- by the policies above); writes happen through the SECURITY DEFINER RPCs
-- via createAdminClient().

REVOKE ALL ON participations_v2                  FROM authenticated;
REVOKE ALL ON payments_v2                        FROM authenticated;
REVOKE ALL ON refunds_v2                         FROM authenticated;
REVOKE ALL ON family_subscriptions_v2            FROM authenticated;
REVOKE ALL ON family_subscription_items_v2       FROM authenticated;
REVOKE ALL ON product_subscription_prices_v2     FROM authenticated;
REVOKE ALL ON session_cancellations_v2           FROM authenticated;
REVOKE ALL ON credit_deductions_v2               FROM authenticated;
REVOKE ALL ON product_seat_counts_v2             FROM authenticated;
REVOKE ALL ON product_seat_counts_v2             FROM anon;

GRANT SELECT ON participations_v2                  TO authenticated;
GRANT SELECT ON payments_v2                        TO authenticated;
GRANT SELECT ON refunds_v2                         TO authenticated;
GRANT SELECT ON family_subscriptions_v2            TO authenticated;
GRANT SELECT ON family_subscription_items_v2      TO authenticated;
GRANT SELECT ON session_cancellations_v2           TO authenticated;
GRANT SELECT ON credit_deductions_v2               TO authenticated;
GRANT SELECT ON product_seat_counts_v2             TO anon, authenticated;
-- product_subscription_prices_v2: admin-only (no public catalog).
