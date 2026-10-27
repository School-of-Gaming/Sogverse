--
-- Name: kick_klaviyo_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kick_klaviyo_sync() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  -- A Klaviyo problem must never fail the write that caused it — a payment, a
  -- seat, a registration — so nothing here may raise.
  BEGIN
    SELECT s.decrypted_secret INTO v_url
      FROM vault.decrypted_secrets s
     WHERE s.name = 'klaviyo_sync_url';
    SELECT s.decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets s
     WHERE s.name = 'klaviyo_sync_secret';

    -- Only a hosted project carries the two secrets. Without them — a local
    -- stack, CI — the outboxes fill and nothing is sent.
    IF v_url IS NULL OR v_secret IS NULL THEN
      RETURN;
    END IF;

    -- Queued, not sent: pg_net sends after this transaction commits, and never
    -- if it rolls back, so the route always finds the change committed.
    PERFORM net.http_post(
      url                  := v_url,
      body                 := '{}'::jsonb,
      headers              := jsonb_build_object(
                                'Authorization', 'Bearer ' || v_secret,
                                'Content-Type',  'application/json'
                              ),
      timeout_milliseconds := 3000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'kick_klaviyo_sync: % (%)', SQLERRM, SQLSTATE;
  END;
END;
$$;


--
-- Name: FUNCTION kick_klaviyo_sync(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kick_klaviyo_sync() IS 'Asks the app to drain the Klaviyo outboxes: queues a pg_net POST to the URL in the Vault secret klaviyo_sync_url, bearing the Vault secret klaviyo_sync_secret. pg_net sends it after the transaction commits and never if it rolls back. A no-op when either secret is missing — every local stack and CI — and it never raises: any failure is a WARNING, because a Klaviyo problem must never fail the write that caused it; the row stays due, and the next write''s kick drains it with everything else due. Granted to nobody.';


--
-- Name: FUNCTION kick_klaviyo_sync(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.kick_klaviyo_sync() FROM PUBLIC;


