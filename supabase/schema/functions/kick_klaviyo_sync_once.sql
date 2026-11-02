--
-- Name: kick_klaviyo_sync_once(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kick_klaviyo_sync_once() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- One kick per transaction, however many rows it files into either outbox:
  -- the setting is transaction-local, so it is gone again at commit or
  -- rollback.
  IF current_setting('sogverse.klaviyo_sync_kicked', true) IS DISTINCT FROM 'on' THEN
    PERFORM set_config('sogverse.klaviyo_sync_kicked', 'on', true);
    PERFORM public.kick_klaviyo_sync();
  END IF;
END;
$$;


--
-- Name: FUNCTION kick_klaviyo_sync_once(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kick_klaviyo_sync_once() IS 'kick_klaviyo_sync, at most once per transaction (the transaction-local setting sogverse.klaviyo_sync_kicked), whichever outbox the transaction filed into. Granted to nobody.';


--
-- Name: FUNCTION kick_klaviyo_sync_once(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.kick_klaviyo_sync_once() FROM PUBLIC;


