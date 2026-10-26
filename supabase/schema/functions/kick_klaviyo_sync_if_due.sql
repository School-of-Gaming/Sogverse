--
-- Name: kick_klaviyo_sync_if_due(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kick_klaviyo_sync_if_due() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
       SELECT 1
         FROM public.klaviyo_profile_outbox o
        WHERE o.next_attempt_at <= now()
          AND (o.leased_until IS NULL OR o.leased_until <= now())
     )
     OR EXISTS (
       SELECT 1
         FROM public.klaviyo_event_outbox e
        WHERE e.next_attempt_at <= now()
          AND (e.leased_until IS NULL OR e.leased_until <= now())
     ) THEN
    PERFORM public.kick_klaviyo_sync();
  END IF;
END;
$$;


--
-- Name: FUNCTION kick_klaviyo_sync_if_due(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kick_klaviyo_sync_if_due() IS 'Kicks the Klaviyo sync when a row in either outbox is due and not leased — a kick that was lost, a sync that died holding its lease, a failed sync whose backoff has run out, or the outboxes filled before the Vault secrets existed. Nothing runs it on a clock: it is for an observation point in the app to call. Granted to the service role.';


--
-- Name: FUNCTION kick_klaviyo_sync_if_due(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.kick_klaviyo_sync_if_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.kick_klaviyo_sync_if_due() TO service_role;


