--
-- Name: notify_substitution_request_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_substitution_request_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.enqueue_substitution_notification(NEW.id);
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_substitution_request_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_substitution_request_changed() IS 'Trigger on session_substitution_requests, after every insert and update: files the request in the notification outbox. Every state a request can take — filed, substituted, cleared back to open, withdrawn — is something its notifications may have to say. Granted to nobody.';


--
-- Name: FUNCTION notify_substitution_request_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_substitution_request_changed() FROM PUBLIC;


