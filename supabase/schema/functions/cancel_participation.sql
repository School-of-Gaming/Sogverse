--
-- Name: cancel_participation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id              UUID;
  v_status                  public.participation_status;
  v_stripe_subscription_id  TEXT;
BEGIN
  SELECT product_id, status
    INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Read the linked Stripe sub id before the delete (CASCADE removes the row).
  SELECT stripe_subscription_id
    INTO v_stripe_subscription_id
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id
    LIMIT 1;

  DELETE FROM public.participations WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'cancelled',
    'product_id', v_product_id,
    'previous_status', v_status::text,
    'stripe_subscription_id', v_stripe_subscription_id,
    'reason', p_reason
  );
END;
$$;


--
-- Name: FUNCTION cancel_participation(p_participation_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) TO service_role;


