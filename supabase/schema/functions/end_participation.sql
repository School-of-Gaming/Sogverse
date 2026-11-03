--
-- Name: end_participation(uuid, public.participation_end_reason); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.end_participation(p_participation_id uuid, p_reason public.participation_end_reason) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id              uuid;
  v_status                  public.participation_status;
  v_stripe_subscription_id  text;
BEGIN
  SELECT product_id INTO v_product_id
    FROM public.participations
   WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  -- The product before the seat: the lock order every seat writer follows. The
  -- status is read again under it, so two concurrent ends see one another.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  SELECT status INTO v_status
    FROM public.participations
   WHERE id = p_participation_id;

  IF NOT FOUND OR v_status = 'ended' THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  SELECT stripe_subscription_id INTO v_stripe_subscription_id
    FROM public.family_subscriptions
   WHERE participation_id = p_participation_id;

  IF v_status = 'waitlisted' THEN
    -- A place in line never held a seat, so there is no history to keep.
    DELETE FROM public.participations WHERE id = p_participation_id;
  ELSE
    UPDATE public.participations
       SET status = 'ended',
           ended_at = now(),
           end_reason = p_reason
     WHERE id = p_participation_id;

    UPDATE public.family_subscriptions
       SET status = 'cancelled',
           ended_at = now()
     WHERE participation_id = p_participation_id;
  END IF;

  RETURN jsonb_build_object(
    'kind', 'cancelled',
    'product_id', v_product_id,
    'previous_status', v_status::text,
    'stripe_subscription_id', v_stripe_subscription_id,
    'reason', p_reason::text
  );
END;
$$;


--
-- Name: FUNCTION end_participation(p_participation_id uuid, p_reason public.participation_end_reason); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.end_participation(p_participation_id uuid, p_reason public.participation_end_reason) IS 'The one way a seat ends. Under the product lock: a seat that is held (active, or the retired reserving) becomes ended with ended_at now() and end_reason p_reason, keeping its group so the family reads the feed up to that day, and its family_subscriptions row becomes cancelled with ended_at now(), after which that row is terminal. A waitlisted row never held a seat and is deleted instead. A row already ended, or not there at all, answers kind=noop and writes nothing, so a redelivered Stripe deletion is harmless. Otherwise answers kind=cancelled with product_id, previous_status, the stripe_subscription_id the row carried (NULL when none) and reason. Touches only the database: whoever calls it has already dealt with Stripe, or Stripe is the one telling us. service_role only.';


--
-- Name: FUNCTION end_participation(p_participation_id uuid, p_reason public.participation_end_reason); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.end_participation(p_participation_id uuid, p_reason public.participation_end_reason) FROM PUBLIC;
GRANT ALL ON FUNCTION public.end_participation(p_participation_id uuid, p_reason public.participation_end_reason) TO service_role;


