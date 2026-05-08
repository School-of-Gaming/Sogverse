-- Drop the Sorg-token-based enrollment charge cron and its helper functions.
--
-- Replaced by the v2 session-credits cron (process_session_credits_v2,
-- scheduled in 00042_session_credits_cron_and_fixes.sql).
--
-- Token tables, adjust_token_balance(), and enrollment_charges remain for now —
-- they are dropped in a later migration once Sorg subscriptions and balances
-- have been fully retired (see docs/sorg-token-removal.md Step 6).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-enrollment-charges') THEN
    PERFORM cron.unschedule('process-enrollment-charges');
  END IF;
END
$$;

DROP FUNCTION IF EXISTS process_enrollment_charges();
DROP FUNCTION IF EXISTS compute_next_session(SMALLINT, TIME, TEXT);
