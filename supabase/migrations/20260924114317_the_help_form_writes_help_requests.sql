-- The help form writes help requests.
--
-- WHAT THIS CHANGES
--
-- The free-text form parents, gamers and gedus send to help@sog.gg is a help
-- system, and "feedback" now means only the post-session gamer feedback in
-- session_feedback. So its table and functions take the help name:
--
-- 1. Table feedback_submissions becomes help_requests, renamed in place so the
--    rows already sent survive, with its primary key, foreign key, index and
--    both policies renamed to match.
-- 2. submit_feedback becomes submit_help_request and submit_my_feedback becomes
--    submit_my_help_request. Each is renamed, which keeps its owner and grants,
--    and then replaced, because its body names the old table or the old
--    function. The check_violation for a message of the wrong length now names
--    a help request.
-- 3. session_feedback's table comment, which tells the two apart, names
--    help_requests.
--
-- The old function names are gone, not aliased: the route switches to
-- submit_my_help_request in the same release, and the form refusing during the
-- minute between this migration and that deploy is accepted for a form this
-- quiet.
--
-- WHAT DID NOT CHANGE
--
-- The columns, the rows, RLS, the table's grants (the SELECT grant to anon
-- included), both functions' signatures, SECURITY DEFINER, search_path, the
-- six-per-hour rate limit under its per-user advisory lock, the 10-2000
-- character bound, and the function grants, restated below.

ALTER TABLE public.feedback_submissions RENAME TO help_requests;
ALTER TABLE public.help_requests RENAME CONSTRAINT feedback_submissions_pkey TO help_requests_pkey;
ALTER TABLE public.help_requests RENAME CONSTRAINT feedback_submissions_user_id_fkey TO help_requests_user_id_fkey;
ALTER INDEX public.idx_feedback_user_created RENAME TO idx_help_requests_user_created;
ALTER POLICY admin_full_access_feedback ON public.help_requests RENAME TO admin_full_access_help_requests;
ALTER POLICY users_read_own_feedback ON public.help_requests RENAME TO users_read_own_help_requests;

ALTER FUNCTION public.submit_feedback(p_user_id uuid, p_message text) RENAME TO submit_help_request;
ALTER FUNCTION public.submit_my_feedback(p_message text) RENAME TO submit_my_help_request;

CREATE OR REPLACE FUNCTION public.submit_help_request(p_user_id uuid, p_message text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  -- Advisory lock keyed to user prevents concurrent rate-limit bypass
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT count(*) INTO v_count
  FROM help_requests
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 hour';

  IF v_count >= 6 THEN
    RETURN false;
  END IF;

  INSERT INTO help_requests (user_id, message)
  VALUES (p_user_id, p_message);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_help_request(p_user_id uuid, p_message text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.submit_my_help_request(p_message text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  -- Not reachable through PostgREST as `authenticated` (that role's JWT always
  -- carries a subject), but an unattributable help request is worse than a
  -- refused one, so this fails closed rather than inserting NULL.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_message IS NULL OR length(p_message) < 10 OR length(p_message) > 2000 THEN
    RAISE EXCEPTION 'help request message must be between 10 and 2000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Returns false (not an error) when the per-hour rate limit is hit; the route
  -- maps that to 429.
  RETURN public.submit_help_request(v_user_id, p_message);
END;
$$;

COMMENT ON FUNCTION public.submit_my_help_request(p_message text) IS 'Self-scoping help request: writes a help_requests row for auth.uid(), rate-limited and length-bounded. Returns false when rate-limited.';

REVOKE ALL ON FUNCTION public.submit_my_help_request(p_message text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_my_help_request(p_message text) TO authenticated;
GRANT ALL ON FUNCTION public.submit_my_help_request(p_message text) TO service_role;

COMMENT ON TABLE public.session_feedback IS 'What ONE CHILD answered on the way out of ONE online session — the five-ish statements of the leave/ended feedback screen plus an optional note. NOT `help_requests`, which is the help card''s free-text box anybody may send from anywhere about anything; this is the one keyed to a session. One row per (group, participant, session window), written and read by the child themselves through RLS — no function, no route. THE LAST DONE WINS: a child who drops out, rejoins and leaves again updates the row they already have, including emptying it, which is an update with an empty object and an empty note and never a delete. A first-time Done with nothing on screen writes no row at all, because the response rate''s denominator is the sessions themselves. Both foreign keys CASCADE, so a family closing its account takes its child''s feedback with it, which is what the privacy page promises about retention.';
