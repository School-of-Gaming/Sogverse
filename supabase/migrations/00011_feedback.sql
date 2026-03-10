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

-- Grants: read-only for authenticated (inserts go through admin client in API route)
REVOKE ALL ON feedback_submissions FROM authenticated;
GRANT SELECT ON feedback_submissions TO authenticated;
