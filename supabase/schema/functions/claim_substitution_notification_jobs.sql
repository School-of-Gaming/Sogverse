--
-- Name: claim_substitution_notification_jobs(integer, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_substitution_notification_jobs(p_limit integer, p_request_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(request_id uuid, seq bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH due AS (
    SELECT o.request_id
      FROM public.substitution_notification_outbox o
     WHERE o.next_attempt_at <= now()
       AND (o.leased_until IS NULL OR o.leased_until <= now())
       AND (p_request_ids IS NULL OR o.request_id = ANY (p_request_ids))
     ORDER BY o.next_attempt_at, o.request_id
     LIMIT greatest(p_limit, 0)
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.substitution_notification_outbox o
     SET leased_until = now() + interval '2 minutes',
         attempts     = o.attempts + 1
    FROM due
   WHERE o.request_id = due.request_id
  RETURNING o.request_id, o.seq;
$$;


--
-- Name: FUNCTION claim_substitution_notification_jobs(p_limit integer, p_request_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_substitution_notification_jobs(p_limit integer, p_request_ids uuid[]) IS 'Leases up to p_limit due outbox rows for two minutes and returns each request id with the seq the sync must finish against. Due means next_attempt_at has come and no live lease is held; SKIP LOCKED lets two syncs claim at once without waiting on each other. p_request_ids narrows the claim to the requests a button press just changed, so the press can redraw its own message in-process. Each claim counts one attempt. Service role only.';


--
-- Name: FUNCTION claim_substitution_notification_jobs(p_limit integer, p_request_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_substitution_notification_jobs(p_limit integer, p_request_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_substitution_notification_jobs(p_limit integer, p_request_ids uuid[]) TO service_role;


