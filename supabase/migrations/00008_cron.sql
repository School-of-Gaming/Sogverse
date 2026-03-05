-- Cron: weekly enrollment charge processing

-- =============================================================================
-- compute_next_session — mirrors getNextSessionStart() in src/lib/enrollment.ts
-- =============================================================================

-- Returns the next UTC occurrence of a recurring weekly session.
--
-- Day-of-week convention: Monday=0 ... Sunday=6 (same as DAYS_OF_WEEK in utils.ts).
-- PostgreSQL ISODOW: Monday=1 ... Sunday=7, so we convert with (ISODOW - 1).
--
-- Logic:
--   1. Get "now" in the product's timezone
--   2. Compute days until the target weekday (0 = today)
--   3. Build a wall-clock TIMESTAMP for that day + start_time, convert to UTC
--   4. If the result is in the past (today but session already happened), add 7 days
CREATE OR REPLACE FUNCTION compute_next_session(
  p_day_of_week SMALLINT,
  p_start_time TIME,
  p_timezone TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_local_now TIMESTAMP;
  v_today_dow INTEGER;   -- Monday=0..Sunday=6
  v_days_ahead INTEGER;
  v_candidate_date DATE;
  v_candidate_ts TIMESTAMPTZ;
BEGIN
  -- Current time in the product's timezone (wall-clock, no TZ offset)
  v_local_now := v_now AT TIME ZONE p_timezone;

  -- Today's day-of-week in our convention: (ISODOW - 1) -> Monday=0..Sunday=6
  v_today_dow := EXTRACT(ISODOW FROM v_local_now)::INTEGER - 1;

  -- Days from today to the target weekday (0 means "today")
  v_days_ahead := (p_day_of_week - v_today_dow + 7) % 7;

  -- Candidate date in the product's timezone
  v_candidate_date := v_local_now::DATE + v_days_ahead;

  -- Build a wall-clock timestamp and convert to UTC via AT TIME ZONE
  v_candidate_ts := (v_candidate_date + p_start_time) AT TIME ZONE p_timezone;

  -- If the candidate is now or in the past (same day, time already passed), skip to next week
  IF v_candidate_ts <= v_now THEN
    v_candidate_ts := (v_candidate_date + 7 + p_start_time) AT TIME ZONE p_timezone;
  END IF;

  RETURN v_candidate_ts;
END;
$$;

-- =============================================================================
-- process_enrollment_charges — hourly cron entry point
-- =============================================================================

-- Iterates all active enrollments. For each one whose next session falls within
-- the charge window (24 hours before session start), and which hasn't already
-- been charged for that session_date, deducts tokens via adjust_token_balance().
--
-- On check_violation (insufficient balance) the enrollment is auto-unenrolled.
-- Returns a JSONB summary: { charged, unenrolled, errors, processed_at }.
--
-- Hourly cron at :00. For a product with a 12:30 session, the charge window
-- opens at 12:30 the day before, and the first cron run inside that window
-- is at 13:00 the day before. Maximum charge latency: ~1 hour.
--
-- Monitor via: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- Unschedule via: SELECT cron.unschedule('process-enrollment-charges');
CREATE OR REPLACE FUNCTION process_enrollment_charges()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge_window_hours INTEGER := 24;
  v_rec RECORD;
  v_next_session TIMESTAMPTZ;
  v_session_date DATE;
  v_window_start TIMESTAMPTZ;
  v_new_balance INTEGER;
  v_tx_id UUID;
  v_charged INTEGER := 0;
  v_unenrolled INTEGER := 0;
  v_errors INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT
      ge.id AS enrollment_id,
      ge.enrolled_by AS customer_id,
      p.name AS product_name,
      p.day_of_week,
      p.start_time,
      p.timezone,
      p.token_cost
    FROM group_enrollments ge
    JOIN product_groups pg ON pg.id = ge.group_id
    JOIN products p ON p.id = pg.product_id
    WHERE ge.status = 'active'
  LOOP
    BEGIN
      -- Compute next session in UTC
      v_next_session := compute_next_session(
        v_rec.day_of_week,
        v_rec.start_time,
        v_rec.timezone
      );

      -- Session date in the product's wall-clock timezone (DATE, not TIMESTAMPTZ)
      v_session_date := (v_next_session AT TIME ZONE v_rec.timezone)::DATE;

      -- Check whether we're inside the charge window
      v_window_start := v_next_session - (v_charge_window_hours || ' hours')::INTERVAL;
      IF NOW() < v_window_start THEN
        CONTINUE;  -- Too early to charge
      END IF;

      -- Skip if already charged for this session (UNIQUE index is the safety net)
      IF EXISTS (
        SELECT 1 FROM enrollment_charges
         WHERE enrollment_id = v_rec.enrollment_id
           AND session_date = v_session_date
      ) THEN
        CONTINUE;
      END IF;

      -- Attempt to deduct tokens
      SELECT atb.new_balance, atb.transaction_id
        INTO v_new_balance, v_tx_id
        FROM adjust_token_balance(
          v_rec.customer_id,
          -v_rec.token_cost,
          'enrollment',
          'Weekly enrollment: ' || v_rec.product_name
        ) atb;

      -- Record the charge
      INSERT INTO enrollment_charges (enrollment_id, amount, transaction_id, session_date)
      VALUES (v_rec.enrollment_id, v_rec.token_cost, v_tx_id, v_session_date);

      -- Update last_charged_at
      UPDATE group_enrollments
         SET last_charged_at = NOW()
       WHERE id = v_rec.enrollment_id;

      v_charged := v_charged + 1;

    EXCEPTION
      WHEN check_violation THEN
        -- Insufficient balance: auto-unenroll
        UPDATE group_enrollments
           SET status = 'unenrolled',
               unenrolled_at = NOW()
         WHERE id = v_rec.enrollment_id;

        v_unenrolled := v_unenrolled + 1;

      WHEN OTHERS THEN
        v_errors := v_errors + 1;
        RAISE WARNING 'Failed to charge enrollment %: %', v_rec.enrollment_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'charged', v_charged,
    'unenrolled', v_unenrolled,
    'errors', v_errors,
    'processed_at', NOW()
  );
END;
$$;

-- =============================================================================
-- Schedule hourly cron job
-- =============================================================================

SELECT cron.schedule(
  'process-enrollment-charges',
  '0 * * * *',
  $$SELECT process_enrollment_charges()$$
);
