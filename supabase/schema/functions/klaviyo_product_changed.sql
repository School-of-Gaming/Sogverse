--
-- Name: klaviyo_product_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_product_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    PERFORM public.enqueue_klaviyo_parents_of_product(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_parents_of_product(OLD.product_id);
  ELSE
    PERFORM public.enqueue_klaviyo_parents_of_product(NEW.product_id);
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_product_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_product_changed() IS 'Trigger on products (topic, type, dates, zone) and product_translations (a name written, changed or removed): files every parent holding a participation in the product in the Klaviyo profile outbox. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_product_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_product_changed() FROM PUBLIC;


