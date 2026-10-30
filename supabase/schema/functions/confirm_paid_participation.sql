--
-- Name: confirm_paid_participation(uuid, uuid, uuid, text, text, text, text, text, text, boolean, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean, p_purchase_shape text DEFAULT NULL::text, p_currency text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_booking_id UUID;
BEGIN
  -- legacy-checkout-session: a Session created before bookings has none, so one
  -- is made here from its metadata, and the seat takes the one confirm path. A
  -- redelivery finds the booking this call or the backfill wrote.
  PERFORM 1 FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.bookings (
    product_id, participant_id, customer_id, purchase_shape, currency,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    school_of_gaming_marketing_opt_in, stripe_checkout_session_id
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, p_purchase_shape, p_currency,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_school_of_gaming_marketing_opt_in, p_checkout_session_id
  )
  ON CONFLICT (stripe_checkout_session_id) DO NOTHING;

  SELECT id INTO v_booking_id
    FROM public.bookings
    WHERE stripe_checkout_session_id = p_checkout_session_id;

  RETURN public.confirm_booking(v_booking_id, p_checkout_session_id);
END;
$$;


--
-- Name: FUNCTION confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean, p_purchase_shape text, p_currency text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean, p_purchase_shape text, p_currency text) IS 'legacy-checkout-session: exists only until no Checkout Session created before bookings can still be redelivered. service_role only: the arguments come from that Session''s metadata. Writes a booking from them, or reuses the one holding this session id, and returns what confirm_booking returns.';


--
-- Name: FUNCTION confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean, p_purchase_shape text, p_currency text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean, p_purchase_shape text, p_currency text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean, p_purchase_shape text, p_currency text) TO service_role;


