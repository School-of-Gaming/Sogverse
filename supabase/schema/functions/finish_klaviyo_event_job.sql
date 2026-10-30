--
-- Name: finish_klaviyo_event_job(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_klaviyo_event_job(p_event_id uuid, p_error text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_error IS NULL THEN
    DELETE FROM public.klaviyo_event_outbox e WHERE e.id = p_event_id;
    RETURN;
  END IF;

  -- The profile outbox's backoff; a parked event stays parked, since nothing
  -- files an event again.
  UPDATE public.klaviyo_event_outbox e
     SET leased_until    = NULL,
         last_error      = left(p_error, 2000),
         next_attempt_at = CASE
                             WHEN e.attempts >= 12 THEN 'infinity'::timestamp with time zone
                             ELSE now() + make_interval(mins => least(power(2, e.attempts), 60)::integer)
                           END
   WHERE e.id = p_event_id;
END;
$$;


--
-- Name: FUNCTION finish_klaviyo_event_job(p_event_id uuid, p_error text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.finish_klaviyo_event_job(p_event_id uuid, p_error text) IS 'Ends a send of one claimed Klaviyo event. Success (p_error null) deletes the row — and so does the sync for an event get_klaviyo_events no longer returns, whose parent is gone. Failure releases the lease, records p_error (cut to 2000 characters) and backs off 2^attempts minutes, capped at an hour; after 12 claims the row is parked at infinity, where it stays: an event is never filed again. Service role only.';


--
-- Name: FUNCTION finish_klaviyo_event_job(p_event_id uuid, p_error text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finish_klaviyo_event_job(p_event_id uuid, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_klaviyo_event_job(p_event_id uuid, p_error text) TO service_role;


