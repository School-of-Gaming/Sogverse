-- Phase 3 of the DB authorization refactor (docs/db-authorization-architecture.md
-- §5 Phase 3), batch 1 of 3: the "grant-plus-guard" shape.
--
-- Two routes drove a participation/feedback write through the service-role
-- client purely because the RPC behind them was granted to service_role only.
-- Both are things the signed-in user is themselves authorized to do, so the
-- indirection bought nothing but a wider blast radius.
--
-- WHY THIS ADDS FUNCTIONS INSTEAD OF GUARDING THE EXISTING ONES
--
-- The obvious move — put a guard primitive at the top of join_waitlist /
-- submit_feedback and grant them to `authenticated` — cannot be made safely in
-- this migration. Migrations reach the shared staging database the moment they
-- are pushed, but the code deployed against that database only changes when this
-- refactor's PR stack merges. Through that window, staging's CURRENTLY deployed
-- routes still call both functions through the service-role client, which has no
-- auth.uid() and therefore no role: a guard added today refuses them and breaks
-- staging until the merge lands.
--
-- The alternative fix — an `auth.uid() IS NULL` escape hatch inside the guard —
-- reopens exactly the roleless-caller hole 00121 closed, and does so in the one
-- place that is shared by every guarded function. So instead this migration is
-- purely ADDITIVE: new, guarded, `authenticated`-facing entry points that the
-- converted routes call, with the old service_role-only functions left untouched
-- as the engine underneath. Old code keeps working, new code is guarded, and
-- nothing is weakened for even one request. Retiring the now-redundant
-- three-argument join_waitlist and two-argument submit_feedback signatures is an
-- inherited Phase 4 item, safe to do once this stack has been deployed.
--
-- Naming note: these are the names the entry points would carry anyway. The
-- caller's own identity is no longer a parameter — it is read from auth.uid()
-- inside the function — so the signatures genuinely differ from the engines they
-- delegate to, rather than being transitional aliases for them.

-- ---------------------------------------------------------------------------
-- join_product_waitlist — role-gated (customer)
-- ---------------------------------------------------------------------------
-- The route previously passed the caller's own id as p_customer_id. Deriving it
-- from auth.uid() here removes the parameter a compromised route handler could
-- get wrong: a customer can now only ever waitlist AS THEMSELVES, and the
-- parent-of-gamer check inside join_waitlist remains the target half of the
-- authorization (the caller must be the gamer's parent).

CREATE OR REPLACE FUNCTION public.join_product_waitlist(
  p_product_id uuid,
  p_gamer_id   uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
BEGIN
  PERFORM public.assert_role('customer');

  -- Everything else — product lock, parent-of-gamer check, waitlist_enabled
  -- gate, idempotency, the clock_timestamp() ordering stamp — is unchanged and
  -- lives in the engine. This function's whole job is authorization plus
  -- pinning the actor to the session.
  RETURN public.join_waitlist(p_product_id, p_gamer_id, (SELECT auth.uid()));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_product_waitlist(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_product_waitlist(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.join_product_waitlist(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.join_product_waitlist(uuid, uuid) IS
  'Guarded, authenticated-facing entry point for joining a product waitlist. The customer is auth.uid(); the parent-of-gamer check lives in join_waitlist.';

-- ---------------------------------------------------------------------------
-- submit_my_feedback — self-scoping
-- ---------------------------------------------------------------------------
-- No role gate by design: every role may send feedback, and the row it writes is
-- keyed to auth.uid() with no way to name another user. That makes it a
-- self-scoping function under §3.4, classified and scope-tested as one.
--
-- The length bounds move in here alongside the rate limit. They used to live
-- only in the route's zod schema, which was sufficient while the RPC was
-- unreachable from a browser; now that `authenticated` can call it directly,
-- validation the route enforces has to be enforced here too or it is decoration.

CREATE OR REPLACE FUNCTION public.submit_my_feedback(p_message text)
RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  -- Not reachable through PostgREST as `authenticated` (that role's JWT always
  -- carries a subject), but an unattributable feedback row is worse than a
  -- refused one, so this fails closed rather than inserting NULL.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_message IS NULL OR length(p_message) < 10 OR length(p_message) > 2000 THEN
    RAISE EXCEPTION 'feedback message must be between 10 and 2000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Returns false (not an error) when the per-hour rate limit is hit; the route
  -- maps that to 429.
  RETURN public.submit_feedback(v_user_id, p_message);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_my_feedback(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_my_feedback(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_my_feedback(text) TO service_role;

COMMENT ON FUNCTION public.submit_my_feedback(text) IS
  'Self-scoping feedback submission: writes a feedback_submissions row for auth.uid(), rate-limited and length-bounded. Returns false when rate-limited.';
