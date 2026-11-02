--
-- Name: confirm_paid_participation(uuid, uuid, uuid, text, text, text, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_purchase_shape TEXT;
  v_booking_id     UUID;
  v_result         JSONB;
BEGIN
  -- legacy-checkout-session: a Session created without a booking has none, so
  -- one is made here from its metadata, and the seat takes the one confirm path.
  -- A redelivery finds the booking this call or the backfill wrote. The shape
  -- comes from the product. The currency is an assumption: the old route's is
  -- not among these arguments, and nothing reads this booking's.
  SELECT CASE WHEN product_type = 'consumer_club'
              THEN 'subscription_monthly' ELSE 'single_payment' END
    INTO v_purchase_shape
    FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.bookings (
    product_id, participant_id, customer_id, purchase_shape, currency,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    school_of_gaming_marketing_opt_in, stripe_checkout_session_id
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, v_purchase_shape, 'eur',
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_school_of_gaming_marketing_opt_in, p_checkout_session_id
  )
  ON CONFLICT (stripe_checkout_session_id) DO NOTHING;

  SELECT id INTO v_booking_id
    FROM public.bookings
    WHERE stripe_checkout_session_id = p_checkout_session_id;

  v_result := public.confirm_booking(v_booking_id, p_checkout_session_id);

  -- The old webhook requires a seat id on both answers, and a redelivery whose
  -- seat has since gone has none to give. Refusing keeps a cancelled seat
  -- cancelled and stops that webhook before it writes a subscription for a seat
  -- that is not there: it answers 500, and Stripe's retries leave the failure
  -- in the logs.
  IF COALESCE(v_result->>'participation_id', v_result->>'existing_participation_id') IS NULL THEN
    RAISE EXCEPTION 'checkout session % has no seat to confirm: it has since been cancelled', p_checkout_session_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_result->>'kind' = 'settled' THEN
    -- The old confirmation page finds a paid seat by this column, and without it
    -- reads a parent's fresh purchase as a duplicate payment.
    IF NOT (v_result->>'idempotent')::boolean THEN
      UPDATE public.participations
         SET stripe_checkout_session_id = p_checkout_session_id
       WHERE id = (v_result->>'participation_id')::uuid;
    END IF;

    RETURN jsonb_build_object(
      'kind', 'confirmed',
      'participation_id', v_result->'participation_id',
      'idempotent', v_result->'idempotent'
    );
  END IF;

  RETURN jsonb_build_object(
    'kind', 'duplicate_payment',
    'existing_participation_id', v_result->'existing_participation_id',
    'existing_status', v_result->'existing_status'
  );
END;
$$;


--
-- Name: FUNCTION confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) IS 'legacy-checkout-session: kept for the deployment window and for redeliveries of Checkout Sessions created before bookings, and removed by the follow-up. service_role only: the arguments come from that Session''s metadata. Writes a booking from them, or reuses the one holding this session id, with subscription_monthly on a consumer_club and single_payment on anything else, so the seat counts as paid. Its currency of eur is an assumption on this path, because the Session''s currency is not among the arguments, and nothing reads it. Confirms it through confirm_booking, writes the session id onto a fresh seat because the old confirmation page finds the seat by it, and returns the shapes the old webhook expects: kind=confirmed with participation_id and idempotent, or kind=duplicate_payment with existing_participation_id and existing_status. A redelivery whose seat has since been cancelled raises check_violation instead: that webhook requires a seat id, and the seat must not come back.';


--
-- Name: FUNCTION confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) TO service_role;


