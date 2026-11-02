--
-- Name: klaviyo_location_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_location_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.enqueue_klaviyo_parents_of_location(NEW.id);
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_location_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_location_changed() IS 'Trigger on locations, after its name or country_code changes: files every registered parent whose home location it is, and every parent with a seat in a product there, in the Klaviyo profile outbox. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_location_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_location_changed() FROM PUBLIC;


