--
-- Name: confirm_paid_participation(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_conflict_id      UUID;
  v_conflict_session TEXT;
  v_conflict_status  public.participation_status;
  v_participation_id UUID;
BEGIN
  PERFORM 1 FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Pre-check the partial UNIQUE on (product_id, participant_id): under the gate lock
  -- this decides the outcome, and the index itself is left as the backstop.
  SELECT id, status, stripe_checkout_session_id
    INTO v_conflict_id, v_conflict_status, v_conflict_session
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status    IN ('active', 'waitlisted', 'completed')
    LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    IF v_conflict_session IS NOT NULL
       AND v_conflict_session = p_checkout_session_id THEN
      RETURN jsonb_build_object(
        'kind', 'confirmed',
        'participation_id', v_conflict_id,
        'idempotent', TRUE
      );
    END IF;

    RETURN jsonb_build_object(
      'kind', 'duplicate_payment',
      'existing_participation_id', v_conflict_id,
      'existing_status', v_conflict_status::text
    );
  END IF;

  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, stripe_checkout_session_id
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'active', p_checkout_session_id
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'kind', 'confirmed',
    'participation_id', v_participation_id,
    'idempotent', FALSE
  );
END;
$$;


--
-- Name: FUNCTION confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text) IS 'Creates the active participation for a paid signup once Stripe confirms payment. service_role only — the arguments come from Checkout Session metadata we wrote. Deliberately audience-ungated: validation happened before the money, and this after-money recorder refusing would strand a charge with no seat. Returns kind=confirmed with participation_id (idempotent=true when this same session already bought the seat), or kind=duplicate_payment with existing_participation_id when a different payment already put this participant on this product.';


--
-- Name: FUNCTION confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text) TO service_role;


