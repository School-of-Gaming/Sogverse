-- Three fixes for the v2 participations system, bundled because they all
-- close gaps the new DB tests surface:
--
-- 1. apply_credit_motion_v2: v_inserted was declared BOOLEAN but assigned
--    via GET DIAGNOSTICS ... = ROW_COUNT, which returns INTEGER. PostgreSQL
--    has no implicit INT→BOOLEAN cast, so every non-underflow call to this
--    function raised at the diagnostics line — silently swallowed by the
--    outer EXCEPTION WHEN OTHERS in process_session_credits_v2. Net effect:
--    the cron has been a no-op for every motion except the underflow branch
--    (which short-circuits before the diagnostics call). Fix is a one-line
--    type change.
--
-- 2. product_seat_counts_v2 was seeded only for products that existed at
--    migration 00039 time. New products created via the admin UI never got
--    a rollup row, so the parent product page's realtime subscription had
--    nothing to bind to until the first participation landed. Add an
--    AFTER INSERT trigger on products_v2 to backfill the rollup row at
--    creation — cheap, idempotent (ON CONFLICT DO NOTHING).
--
-- 3. Schedule the hourly cron for process_session_credits_v2(). The function
--    has been deployed since 00039 but never wired to pg_cron, so the
--    four-rule motion table never actually runs in production.

-- 1. apply_credit_motion_v2 — v_inserted INTEGER (was BOOLEAN)
-- ----------------------------------------------------------------------------
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
  v_inserted    INTEGER := 0;
BEGIN
  IF p_delta NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'invalid delta: %', p_delta USING ERRCODE = 'check_violation';
  END IF;

  SELECT gamer_id, product_id, credits_remaining
    INTO v_gamer_id, v_product_id, v_balance
    FROM public.participations_v2
    WHERE id = p_participation_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

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

-- 2. AFTER INSERT trigger on products_v2 → seed product_seat_counts_v2 row
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_seed_product_seat_counts_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.product_seat_counts_v2 (
    product_id, active_count, reserving_count, waitlist_count
  ) VALUES (NEW.id, 0, 0, 0)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION trg_seed_product_seat_counts_v2() FROM authenticated, anon, public;

CREATE TRIGGER trg_products_v2_seed_seat_counts
  AFTER INSERT ON products_v2
  FOR EACH ROW
  EXECUTE FUNCTION trg_seed_product_seat_counts_v2();

-- 3. Schedule the hourly session-credits cron
-- ----------------------------------------------------------------------------
-- Same shape as 00008_cron.sql: hourly at :00, calls the SECURITY DEFINER
-- entry point. The function returns a JSONB summary row to cron.job_run_details.
SELECT cron.schedule(
  'process-session-credits-v2',
  '0 * * * *',
  $$SELECT process_session_credits_v2()$$
);
