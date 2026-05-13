-- Drop the Sorg token system end-to-end.
--
-- Background: Products v2 replaces the Sorg token / weekly-charge model with
-- direct Stripe payments per participation. The token tables, the legacy
-- enroll/unenroll RPCs, and products.token_cost are all dead. The legacy
-- group/voice-room infrastructure (product_groups, group_enrollments,
-- voice_rooms, get_my_groups, commit_group_changes) stays — it still backs the
-- group-detail and voice-chat UIs and is retired separately at v2 cutover
-- (see docs/products-redesign.md §10.2).
--
-- The frontend code that called enroll_gamer_in_group / unenroll_gamer was
-- removed in the same PR, so dropping those RPCs is safe.

-- =============================================================================
-- 1. Drop token-dependent enrollment RPCs (00006)
-- =============================================================================

DROP FUNCTION IF EXISTS enroll_gamer_in_group(UUID, UUID, UUID, DATE);
DROP FUNCTION IF EXISTS unenroll_gamer(UUID, UUID, BOOLEAN);

-- =============================================================================
-- 2. Drop enrollment_charges (FK to token_transactions blocks dropping the
--    token tables until this table is gone)
-- =============================================================================

DROP TABLE IF EXISTS enrollment_charges;

-- =============================================================================
-- 3. Drop adjust_token_balance, token_transactions, and the enum
-- =============================================================================

DROP FUNCTION IF EXISTS adjust_token_balance(UUID, INTEGER, token_transaction_type, TEXT, TEXT, TEXT, UUID, TEXT);
DROP TABLE IF EXISTS token_transactions;
DROP TYPE IF EXISTS token_transaction_type;

-- =============================================================================
-- 4. Trim customer_profiles to the columns v2 still uses.
--
-- KEEP   stripe_customer_id — v2 caches the Stripe Customer here (see
--        src/lib/stripe/participation-prices.ts getOrCreateStripeCustomer and
--        src/app/api/parent/payment-method/route.ts).
-- DROP   stripe_subscription_id — was the Sorg subscription id; v2 stores its
--        subscription ids on family_subscriptions_v2.stripe_subscription_id.
-- DROP   token_balance / subscription_status / subscription_tier — Sorg-only.
-- =============================================================================

ALTER TABLE customer_profiles
  DROP COLUMN IF EXISTS token_balance,
  DROP COLUMN IF EXISTS stripe_subscription_id,
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS subscription_tier;

-- =============================================================================
-- 5. Drop products.token_cost. The product is still used (it backs the legacy
--    /admin/products UI and the group/voice-room flow) but nothing reads or
--    writes this column now that the enrollment RPCs and the form field are
--    gone.
-- =============================================================================

ALTER TABLE products
  DROP COLUMN IF EXISTS token_cost;

-- =============================================================================
-- 6. Recreate get_my_groups without product_token_cost and last_charge_session_date.
--
--    Last defined in 00053. The function signature changes (return-table
--    columns are removed), so we DROP and recreate rather than CREATE OR REPLACE.
--    Re-issue the grant — DROP wipes it.
-- =============================================================================

DROP FUNCTION IF EXISTS get_my_groups();

CREATE FUNCTION get_my_groups()
RETURNS TABLE (
  group_id UUID,
  product_id UUID,
  product_name TEXT,
  product_description TEXT,
  product_image_path TEXT,
  product_padlet_url TEXT,
  product_min_age INTEGER,
  product_max_age INTEGER,
  game_id UUID,
  game_name TEXT,
  day_of_week SMALLINT,
  start_time TIME,
  timezone TEXT,
  duration_minutes INTEGER,
  display_order INTEGER,
  gedu_id UUID,
  gedu_first_name TEXT,
  voice_room_id UUID,
  gamer_id UUID,
  gamer_first_name TEXT,
  gamer_date_of_birth DATE,
  gamer_gender TEXT,
  enrollment_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role TEXT := get_user_role();
BEGIN
  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_path AS product_image_path,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
        gamer_gp.date_of_birth AS gamer_date_of_birth,
        gamer_gp.gender::TEXT AS gamer_gender,
        ge.id AS enrollment_id
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN voice_rooms vr ON vr.group_id = pg.id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      LEFT JOIN gamer_profiles gamer_gp ON gamer_gp.user_id = ge.gamer_id
      ORDER BY p.name, pg.display_order, gamer_prof.first_name;

  ELSIF v_role = 'gedu' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_path AS product_image_path,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
        gamer_gp.date_of_birth AS gamer_date_of_birth,
        gamer_gp.gender::TEXT AS gamer_gender,
        ge.id AS enrollment_id
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN voice_rooms vr ON vr.group_id = pg.id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      LEFT JOIN gamer_profiles gamer_gp ON gamer_gp.user_id = ge.gamer_id
      WHERE pg.gedu_id = auth.uid()
      ORDER BY p.name, pg.display_order, gamer_prof.first_name;

  ELSIF v_role = 'gamer' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_path AS product_image_path,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
        NULL::DATE AS gamer_date_of_birth,
        NULL::TEXT AS gamer_gender,
        ge.id AS enrollment_id
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN voice_rooms vr ON vr.group_id = pg.id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      WHERE pg.id IN (
        SELECT my_ge.group_id FROM group_enrollments my_ge
        WHERE my_ge.gamer_id = auth.uid() AND my_ge.status = 'active'
      )
      ORDER BY p.name, pg.display_order, gamer_prof.first_name;

  ELSIF v_role = 'customer' THEN
    RETURN QUERY
      SELECT
        pg.id AS group_id,
        pg.product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.image_path AS product_image_path,
        p.padlet_url AS product_padlet_url,
        p.min_age AS product_min_age,
        p.max_age AS product_max_age,
        g.id AS game_id,
        g.name AS game_name,
        p.day_of_week,
        p.start_time,
        p.timezone,
        p.duration_minutes,
        pg.display_order,
        pg.gedu_id,
        gedu_prof.first_name AS gedu_first_name,
        vr.id AS voice_room_id,
        ge.gamer_id,
        gamer_prof.first_name AS gamer_first_name,
        CASE WHEN ge.enrolled_by = auth.uid() THEN gamer_gp.date_of_birth ELSE NULL END AS gamer_date_of_birth,
        CASE WHEN ge.enrolled_by = auth.uid() THEN gamer_gp.gender::TEXT ELSE NULL END AS gamer_gender,
        ge.id AS enrollment_id
      FROM product_groups pg
      JOIN products p ON p.id = pg.product_id
      JOIN games g ON g.id = p.game_id
      JOIN profiles gedu_prof ON gedu_prof.id = pg.gedu_id
      LEFT JOIN voice_rooms vr ON vr.group_id = pg.id
      LEFT JOIN group_enrollments ge ON ge.group_id = pg.id AND ge.status = 'active'
      LEFT JOIN profiles gamer_prof ON gamer_prof.id = ge.gamer_id
      LEFT JOIN gamer_profiles gamer_gp ON gamer_gp.user_id = ge.gamer_id
      WHERE pg.id IN (
        SELECT my_ge.group_id FROM group_enrollments my_ge
        WHERE my_ge.enrolled_by = auth.uid() AND my_ge.status = 'active'
      )
      ORDER BY p.name, pg.display_order, gamer_prof.first_name;

  ELSE
    RAISE EXCEPTION 'Role % cannot access groups', v_role
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_my_groups() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_my_groups() TO authenticated;
