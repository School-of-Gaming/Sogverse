--
-- Name: claim_klaviyo_profile_jobs(integer, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_klaviyo_profile_jobs(p_limit integer, p_customer_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(customer_id uuid, seq bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH due AS (
    SELECT o.customer_id
      FROM public.klaviyo_profile_outbox o
     WHERE o.next_attempt_at <= now()
       AND (o.leased_until IS NULL OR o.leased_until <= now())
       AND (p_customer_ids IS NULL OR o.customer_id = ANY (p_customer_ids))
     ORDER BY o.next_attempt_at, o.customer_id
     LIMIT greatest(p_limit, 0)
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.klaviyo_profile_outbox o
     SET leased_until = now() + interval '2 minutes',
         attempts     = o.attempts + 1
    FROM due
   WHERE o.customer_id = due.customer_id
  RETURNING o.customer_id, o.seq;
$$;


--
-- Name: FUNCTION claim_klaviyo_profile_jobs(p_limit integer, p_customer_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_klaviyo_profile_jobs(p_limit integer, p_customer_ids uuid[]) IS 'Leases up to p_limit due rows of the Klaviyo profile outbox for two minutes and returns each parent id with the seq the sync must finish against. Due means next_attempt_at has come and no live lease is held; SKIP LOCKED lets two syncs claim at once without waiting on each other. p_customer_ids narrows the claim to named parents. Each claim counts one attempt. Service role only.';


--
-- Name: FUNCTION claim_klaviyo_profile_jobs(p_limit integer, p_customer_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_klaviyo_profile_jobs(p_limit integer, p_customer_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_klaviyo_profile_jobs(p_limit integer, p_customer_ids uuid[]) TO service_role;


