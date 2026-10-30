--
-- Name: klaviyo_family_subscription_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_family_subscription_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[OLD.customer_id]);
    RETURN NULL;
  END IF;

  PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);

  -- Into a cancelled state from outside one: `canceling` is the parent asking
  -- for it, `cancelled` is it ending, and whichever comes first is the event.
  IF NEW.status IN ('canceling', 'cancelled')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('canceling', 'cancelled')) THEN
    SELECT part.product_id INTO v_product_id
      FROM public.participations part
     WHERE part.id = NEW.participation_id;

    PERFORM public.enqueue_klaviyo_event(
      'subscription_cancelled'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, v_product_id,
      NEW.updated_at,
      jsonb_build_object(
        'status',             NEW.status,
        'current_period_end', NEW.current_period_end
      )
    );
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_family_subscription_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_family_subscription_changed() IS 'Trigger on family_subscriptions, after an insert, a delete, or an update of status or current_period_end that changes it: files the parent in the Klaviyo profile outbox, and files subscription_cancelled when the status first arrives at canceling or cancelled. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_family_subscription_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_family_subscription_changed() FROM PUBLIC;


