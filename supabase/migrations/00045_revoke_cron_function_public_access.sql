-- Migration: Revoke public access to cron/internal functions
-- Fixes: Finding #6 (Cron Function Public Access)
--
-- process_enrollment_charges() is only called by pg_cron (hourly schedule).
-- compute_next_session() is only called internally by process_enrollment_charges().
-- Neither should be callable via the PostgREST API.
--
-- PostgreSQL grants EXECUTE to PUBLIC by default on new functions.
-- These revokes remove that default grant.

-- process_enrollment_charges: cron-only billing function
REVOKE EXECUTE ON FUNCTION process_enrollment_charges() FROM authenticated;
REVOKE EXECUTE ON FUNCTION process_enrollment_charges() FROM anon;
REVOKE EXECUTE ON FUNCTION process_enrollment_charges() FROM public;

-- compute_next_session: internal helper for the cron function
REVOKE EXECUTE ON FUNCTION compute_next_session(SMALLINT, TIME, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION compute_next_session(SMALLINT, TIME, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION compute_next_session(SMALLINT, TIME, TEXT) FROM public;
