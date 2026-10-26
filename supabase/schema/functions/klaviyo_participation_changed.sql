--
-- Name: klaviyo_participation_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_participation_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_old_status public.participation_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[OLD.customer_id]);
    RETURN NULL;
  END IF;

  PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);

  IF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
  END IF;

  -- Each event is a status the participation ARRIVES at, so a write that
  -- leaves the status where it was is not one.
  IF NEW.status = 'active'::public.participation_status
     AND v_old_status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_klaviyo_event(
      'enrolled'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      CASE WHEN TG_OP = 'INSERT' THEN NEW.signed_up_at ELSE now() END,
      jsonb_build_object('status', NEW.status, 'participant_id', NEW.participant_id)
    );
  END IF;

  IF NEW.status = 'waitlisted'::public.participation_status
     AND v_old_status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_klaviyo_event(
      'waitlisted'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      COALESCE(NEW.waitlisted_at, now()),
      jsonb_build_object('status', NEW.status, 'participant_id', NEW.participant_id)
    );
  END IF;

  IF NEW.seat_offer_sent_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.seat_offer_sent_at IS NULL) THEN
    PERFORM public.enqueue_klaviyo_event(
      'seat_offered'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      NEW.seat_offer_sent_at,
      jsonb_build_object('status', NEW.status, 'participant_id', NEW.participant_id)
    );
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_participation_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_participation_changed() IS 'Trigger on participations, after an insert, a delete, or an update of status, product_id or seat_offer_sent_at that changes it: files the participation''s parent in the Klaviyo profile outbox, and files the events it shows — enrolled when it arrives at active (by insert or from the waitlist), waitlisted when it arrives at waitlisted, seat_offered when a seat offer is first stamped on it. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_participation_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_participation_changed() FROM PUBLIC;


