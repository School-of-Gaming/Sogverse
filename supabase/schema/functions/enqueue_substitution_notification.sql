--
-- Name: enqueue_substitution_notification(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_substitution_notification(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- The EXISTS is for deletes: a request being deleted cascades to its offers,
  -- whose trigger lands here after the request is gone, and a row for it would
  -- break the delete on the foreign key.
  INSERT INTO public.substitution_notification_outbox AS o (request_id)
  SELECT p_request_id
   WHERE EXISTS (
           SELECT 1
             FROM public.session_substitution_requests r
            WHERE r.id = p_request_id
         )
  ON CONFLICT (request_id) DO UPDATE
     SET seq             = o.seq + 1,
         next_attempt_at = now(),
         attempts        = 0;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- One kick per transaction, however many rows it files: the setting is
  -- transaction-local, so it is gone again at commit or rollback.
  IF current_setting('sogverse.sub_sync_kicked', true) IS DISTINCT FROM 'on' THEN
    PERFORM set_config('sogverse.sub_sync_kicked', 'on', true);
    PERFORM public.kick_substitution_notification_sync();
  END IF;
END;
$$;


--
-- Name: FUNCTION enqueue_substitution_notification(p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enqueue_substitution_notification(p_request_id uuid) IS 'Files a substitution request in the notification outbox: a new row, or seq bumped, the row due now and its attempts reset. Then, once per transaction (the transaction-local setting sogverse.sub_sync_kicked), kick_substitution_notification_sync. A request that no longer exists — the case of an offer deleted by its request''s own delete — is skipped. Called by the triggers on session_substitution_requests, session_substitution_offers and session_cancellations, and by the daily close-out. Granted to nobody.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: FUNCTION enqueue_substitution_notification(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enqueue_substitution_notification(p_request_id uuid) FROM PUBLIC;


