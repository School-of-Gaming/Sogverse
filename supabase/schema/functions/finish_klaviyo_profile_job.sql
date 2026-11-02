--
-- Name: finish_klaviyo_profile_job(uuid, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_klaviyo_profile_job(p_customer_id uuid, p_seq bigint, p_error text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_error IS NULL THEN
    DELETE FROM public.klaviyo_profile_outbox o
     WHERE o.customer_id = p_customer_id
       AND o.seq         = p_seq;
    IF FOUND THEN
      RETURN false;
    END IF;

    -- The parent changed while the sync ran: hand the row back, due now, and
    -- tell the caller to run it again. No row at all means another sync
    -- already finished it, and there is nothing left to tell.
    UPDATE public.klaviyo_profile_outbox o
       SET leased_until = NULL
     WHERE o.customer_id = p_customer_id;
    RETURN FOUND;
  END IF;

  -- Backoff of 2^attempts minutes, capped at an hour; after 12 attempts the
  -- row stops being scheduled, and stays until the parent changes again.
  UPDATE public.klaviyo_profile_outbox o
     SET leased_until    = NULL,
         last_error      = left(p_error, 2000),
         next_attempt_at = CASE
                             WHEN o.attempts >= 12 THEN 'infinity'::timestamp with time zone
                             ELSE now() + make_interval(mins => least(power(2, o.attempts), 60)::integer)
                           END
   WHERE o.customer_id = p_customer_id;
  RETURN false;
END;
$$;


--
-- Name: FUNCTION finish_klaviyo_profile_job(p_customer_id uuid, p_seq bigint, p_error text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.finish_klaviyo_profile_job(p_customer_id uuid, p_seq bigint, p_error text) IS 'Ends a sync of one claimed Klaviyo profile outbox row, and answers whether to run it again. Success (p_error null) deletes the row when its seq is still p_seq and answers false; when the seq moved — the parent changed while the sync ran — it releases the lease, leaving the row due, and answers true. Failure releases the lease, records p_error (cut to 2000 characters) and pushes next_attempt_at out by 2^attempts minutes, capped at an hour; once the row has been claimed 12 times it is pushed to infinity and stays until the next enqueue resets it. Failure answers false. Service role only.';


--
-- Name: FUNCTION finish_klaviyo_profile_job(p_customer_id uuid, p_seq bigint, p_error text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finish_klaviyo_profile_job(p_customer_id uuid, p_seq bigint, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_klaviyo_profile_job(p_customer_id uuid, p_seq bigint, p_error text) TO service_role;


