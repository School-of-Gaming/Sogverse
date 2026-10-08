--
-- Name: notify_session_cancellation_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_session_cancellation_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_group_id     uuid;
  v_session_date date;
  v_request_id   uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_group_id := OLD.group_id;
    v_session_date := OLD.session_date;
  ELSE
    v_group_id := NEW.group_id;
    v_session_date := NEW.session_date;
  END IF;

  -- A withdrawn request's notifications already say it is no longer needed,
  -- and the session being called off or restored changes nothing about that.
  FOR v_request_id IN
    SELECT r.id
      FROM public.session_substitution_requests r
     WHERE r.group_id     = v_group_id
       AND r.session_date = v_session_date
       AND r.status <> 'withdrawn'::public.substitution_request_status
     ORDER BY r.id
  LOOP
    PERFORM public.enqueue_substitution_notification(v_request_id);
  END LOOP;

  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_session_cancellation_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_session_cancellation_changed() IS 'Trigger on session_cancellations, after every insert and delete (a cancellation, a restore): files every non-withdrawn substitution request on that (group, date) in the notification outbox, because a cancelled session closes its request''s buttons and a restored one reopens them. A re-worded cancellation changes nothing a notification shows and fires nothing. Granted to nobody.';


--
-- Name: FUNCTION notify_session_cancellation_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_session_cancellation_changed() FROM PUBLIC;


