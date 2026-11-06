--
-- Name: klaviyo_family_subscription_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_family_subscription_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[OLD.customer_id]);
  ELSE
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_family_subscription_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_family_subscription_changed() IS 'Trigger on family_subscriptions, after an insert, a delete, or an update of status or current_period_end that changes it: files the parent in the Klaviyo profile outbox. It files no event: the seat ending is the event, filed by klaviyo_participation_changed. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_family_subscription_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_family_subscription_changed() FROM PUBLIC;


