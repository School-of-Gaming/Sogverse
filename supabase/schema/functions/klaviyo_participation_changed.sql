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
  -- leaves the status where it was is not one. Only a seat on a paid product
  -- is a purchase: a free seat and a municipality's contracted one are not.
  IF NEW.status = 'active'::public.participation_status
     AND v_old_status IS DISTINCT FROM NEW.status
     AND EXISTS (
           SELECT 1
             FROM public.products pr
            WHERE pr.id = NEW.product_id
              AND pr.billing_mode = 'paid'::public.billing_mode
         ) THEN
    PERFORM public.enqueue_klaviyo_event(
      'purchase'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      CASE WHEN TG_OP = 'INSERT' THEN NEW.signed_up_at ELSE now() END,
      jsonb_build_object(
        -- Of the seats the parent holds now: a cancelled seat is deleted, so a
        -- family that left and came back buys a first seat again.
        'first_purchase', NOT EXISTS (
          SELECT 1
            FROM public.participations other
            JOIN public.products pr ON pr.id = other.product_id
           WHERE other.customer_id = NEW.customer_id
             AND other.id <> NEW.id
             AND other.status IN ('active'::public.participation_status,
                                  'completed'::public.participation_status)
             AND pr.billing_mode = 'paid'::public.billing_mode
        )
      )
    );
  END IF;

  IF NEW.status = 'waitlisted'::public.participation_status
     AND v_old_status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_klaviyo_event(
      'waitlisted'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      COALESCE(NEW.waitlisted_at, now())
    );
  END IF;

  IF NEW.seat_offer_sent_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.seat_offer_sent_at IS NULL) THEN
    PERFORM public.enqueue_klaviyo_event(
      'seat_offered'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      NEW.seat_offer_sent_at
    );
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_participation_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_participation_changed() IS 'Trigger on participations, after an insert, a delete, or an update of status, product_id or seat_offer_sent_at that changes it: files the participation''s parent in the Klaviyo profile outbox, and files the events it shows — purchase when it arrives at active (by insert or from the waitlist) on a product whose billing_mode is paid, with first_purchase saying whether the parent then held no other active or completed seat on a paid product; waitlisted when it arrives at waitlisted; seat_offered when a seat offer is first stamped on it. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_participation_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_participation_changed() FROM PUBLIC;


