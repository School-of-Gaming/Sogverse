-- =============================================================================
-- Feedback submissions table + RLS + grants
-- =============================================================================

CREATE TABLE feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_user_created ON feedback_submissions(user_id, created_at DESC);

ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "admin_full_access_feedback"
  ON feedback_submissions FOR ALL TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Users: read own submissions only
CREATE POLICY "users_read_own_feedback"
  ON feedback_submissions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Grants: read-only for authenticated (inserts go through submit_feedback RPC)
REVOKE ALL ON feedback_submissions FROM authenticated;
GRANT SELECT ON feedback_submissions TO authenticated;

-- =============================================================================
-- Atomic submit_feedback RPC — rate-limits and inserts in one transaction
-- =============================================================================

CREATE OR REPLACE FUNCTION submit_feedback(p_user_id UUID, p_message TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Private: only callable via admin client (service role)
REVOKE EXECUTE ON FUNCTION submit_feedback(UUID, TEXT) FROM public, anon, authenticated;
