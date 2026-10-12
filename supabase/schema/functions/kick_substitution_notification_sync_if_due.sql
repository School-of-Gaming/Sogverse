--
-- Name: kick_substitution_notification_sync_if_due(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kick_substitution_notification_sync_if_due() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
       SELECT 1
         FROM public.substitution_notification_outbox o
        WHERE o.next_attempt_at <= now()
          AND (o.leased_until IS NULL OR o.leased_until <= now())
     ) THEN
    PERFORM public.kick_substitution_notification_sync();
  END IF;
END;
$$;


--
-- Name: FUNCTION kick_substitution_notification_sync_if_due(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kick_substitution_notification_sync_if_due() IS 'The retry: kicks the sync when some outbox row is due and not leased — a kick that was lost, a sync that died holding its lease, or a failed sync whose backoff has run out. Run every minute by the pg_cron job substitution-notifications-retry. Granted to nobody.';


--
-- Name: FUNCTION kick_substitution_notification_sync_if_due(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.kick_substitution_notification_sync_if_due() FROM PUBLIC;


