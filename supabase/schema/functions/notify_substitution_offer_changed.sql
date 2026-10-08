--
-- Name: notify_substitution_offer_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_substitution_offer_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_substitution_notification(OLD.request_id);
  ELSE
    PERFORM public.enqueue_substitution_notification(NEW.request_id);
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_substitution_offer_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_substitution_offer_changed() IS 'Trigger on session_substitution_offers, after every insert, update and delete: files the answered request in the notification outbox, because a gedu''s answer shows on the Slack message and on that gedu''s own DM. Granted to nobody.';


--
-- Name: FUNCTION notify_substitution_offer_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_substitution_offer_changed() FROM PUBLIC;


