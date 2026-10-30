--
-- Name: enqueue_klaviyo_parents_of_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_klaviyo_parents_of_product(p_product_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.enqueue_klaviyo_profiles(ARRAY(
    SELECT DISTINCT part.customer_id
      FROM public.participations part
     WHERE part.product_id = p_product_id
  ));
$$;


--
-- Name: FUNCTION enqueue_klaviyo_parents_of_product(p_product_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enqueue_klaviyo_parents_of_product(p_product_id uuid) IS 'Files every parent holding any participation in a product in the Klaviyo profile outbox, because a parent''s Klaviyo profile lists their products by name, topic, type and dates. A fan-out over one product''s participations. Granted to nobody.';


--
-- Name: FUNCTION enqueue_klaviyo_parents_of_product(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_parents_of_product(p_product_id uuid) FROM PUBLIC;


