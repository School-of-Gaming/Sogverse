--
-- Name: klaviyo_payment_recorded(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_payment_recorded() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
BEGIN
  PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);

  -- A duplicate payment is refunded by hand, so it was never spend.
  IF NEW.purpose = 'reservation_duplicate'::public.payment_purpose THEN
    RETURN NULL;
  END IF;

  v_product_id := public.klaviyo_payment_product(NEW.metadata);

  PERFORM public.enqueue_klaviyo_event(
    'payment'::public.klaviyo_event_kind,
    NEW.id, NEW.customer_id, v_product_id,
    NEW.created_at,
    jsonb_build_object(
      'amount_cents', NEW.amount_cents,
      'currency',     NEW.currency,
      'purpose',      NEW.purpose
    )
  );

  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_payment_recorded(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_payment_recorded() IS 'Trigger on payments, after every insert: files the parent in the Klaviyo profile outbox and, unless it is a refunded duplicate (reservation_duplicate), files the payment event with its amount, currency, purpose and product. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_payment_recorded(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_payment_recorded() FROM PUBLIC;


