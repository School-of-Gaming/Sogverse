--
-- Name: klaviyo_payment_product(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_payment_product(p_metadata jsonb) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_product text;
  v_subscription text;
  v_product_id uuid;
BEGIN
  -- A first payment names its product in the metadata the webhook writes; a
  -- renewal names its subscription, whose seat names the product. Anything
  -- else names none.
  v_product := p_metadata->>'productId';
  IF v_product ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v_product::uuid;
  END IF;

  v_subscription := p_metadata->>'stripeSubscriptionId';
  IF v_subscription IS NOT NULL THEN
    SELECT part.product_id INTO v_product_id
      FROM public.family_subscriptions fs
      JOIN public.participations part ON part.id = fs.participation_id
     WHERE fs.stripe_subscription_id = v_subscription
     ORDER BY fs.created_at DESC
     LIMIT 1;
  END IF;

  RETURN v_product_id;
END;
$_$;


--
-- Name: FUNCTION klaviyo_payment_product(p_metadata jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_payment_product(p_metadata jsonb) IS 'The product a payment paid for, read from what the Stripe webhook records on it: the productId of a first payment, or the seat behind the stripeSubscriptionId of a renewal. NULL when it names neither. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_payment_product(p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_payment_product(p_metadata jsonb) FROM PUBLIC;


