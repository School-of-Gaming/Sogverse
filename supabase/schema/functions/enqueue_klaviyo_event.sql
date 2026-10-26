--
-- Name: enqueue_klaviyo_event(public.klaviyo_event_kind, uuid, uuid, uuid, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_klaviyo_event(p_kind public.klaviyo_event_kind, p_source_id uuid, p_customer_id uuid, p_product_id uuid, p_occurred_at timestamp with time zone, p_facts jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- Only a parent's events: a seat a gamer holds is its parent's
  -- (participations.customer_id), and every other source names the parent
  -- directly.
  IF NOT EXISTS (
       SELECT 1
         FROM public.profiles p
        WHERE p.id = p_customer_id
          AND p.role = 'customer'::public.user_role
     ) THEN
    RETURN;
  END IF;

  INSERT INTO public.klaviyo_event_outbox (
    kind, source_id, customer_id, product_id, occurred_at, facts
  )
  VALUES (
    p_kind, p_source_id, p_customer_id, p_product_id, p_occurred_at,
    COALESCE(p_facts, '{}'::jsonb)
  )
  ON CONFLICT (kind, source_id) DO NOTHING;

  IF FOUND THEN
    PERFORM public.kick_klaviyo_sync_once();
  END IF;
END;
$$;


--
-- Name: FUNCTION enqueue_klaviyo_event(p_kind public.klaviyo_event_kind, p_source_id uuid, p_customer_id uuid, p_product_id uuid, p_occurred_at timestamp with time zone, p_facts jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enqueue_klaviyo_event(p_kind public.klaviyo_event_kind, p_source_id uuid, p_customer_id uuid, p_product_id uuid, p_occurred_at timestamp with time zone, p_facts jsonb) IS 'Files one event in the Klaviyo event outbox — unless the parent is not a customer, or the same (kind, source) is already waiting — and then, once per transaction, the kick. Called by the triggers that see an event happen. Granted to nobody.';


--
-- Name: FUNCTION enqueue_klaviyo_event(p_kind public.klaviyo_event_kind, p_source_id uuid, p_customer_id uuid, p_product_id uuid, p_occurred_at timestamp with time zone, p_facts jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_event(p_kind public.klaviyo_event_kind, p_source_id uuid, p_customer_id uuid, p_product_id uuid, p_occurred_at timestamp with time zone, p_facts jsonb) FROM PUBLIC;


