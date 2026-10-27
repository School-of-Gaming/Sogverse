--
-- Name: klaviyo_payment_recorded(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_payment_recorded() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_payment_recorded(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_payment_recorded() IS 'Trigger on payments, after every insert: files the parent in the Klaviyo profile outbox, whose snapshot carries their first and last payment and their totals. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_payment_recorded(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_payment_recorded() FROM PUBLIC;


