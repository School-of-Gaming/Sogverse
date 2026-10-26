--
-- Name: claim_klaviyo_event_jobs(integer, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_klaviyo_event_jobs(p_limit integer, p_customer_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(event_id uuid, kind public.klaviyo_event_kind, customer_id uuid)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH due AS (
    SELECT e.id
      FROM public.klaviyo_event_outbox e
     WHERE e.next_attempt_at <= now()
       AND (e.leased_until IS NULL OR e.leased_until <= now())
       AND (p_customer_ids IS NULL OR e.customer_id = ANY (p_customer_ids))
     ORDER BY e.next_attempt_at, e.occurred_at, e.id
     LIMIT greatest(p_limit, 0)
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.klaviyo_event_outbox e
     SET leased_until = now() + interval '2 minutes',
         attempts     = e.attempts + 1
    FROM due
   WHERE e.id = due.id
  RETURNING e.id, e.kind, e.customer_id;
$$;


--
-- Name: FUNCTION claim_klaviyo_event_jobs(p_limit integer, p_customer_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_klaviyo_event_jobs(p_limit integer, p_customer_ids uuid[]) IS 'Leases up to p_limit due rows of the Klaviyo event outbox for two minutes, oldest first, and returns each row''s id, kind and parent. p_customer_ids narrows the claim to named parents. Due, SKIP LOCKED and the attempt count work as claim_klaviyo_profile_jobs''s do. Service role only.';


--
-- Name: FUNCTION claim_klaviyo_event_jobs(p_limit integer, p_customer_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_klaviyo_event_jobs(p_limit integer, p_customer_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_klaviyo_event_jobs(p_limit integer, p_customer_ids uuid[]) TO service_role;


