--
-- Name: enqueue_klaviyo_parents_of_location(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_klaviyo_parents_of_location(p_location_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.enqueue_klaviyo_profiles(ARRAY(
    SELECT p.id
      FROM public.profiles p
     WHERE p.home_location_id = p_location_id
       AND p.registration_completed_at IS NOT NULL
  ));
$$;


--
-- Name: FUNCTION enqueue_klaviyo_parents_of_location(p_location_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enqueue_klaviyo_parents_of_location(p_location_id uuid) IS 'Files every registered parent whose home location this is in the Klaviyo profile outbox, because a parent''s Klaviyo profile carries their home location''s name and country. A fan-out over one location''s parents. Granted to nobody.';


--
-- Name: FUNCTION enqueue_klaviyo_parents_of_location(p_location_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_parents_of_location(p_location_id uuid) FROM PUBLIC;


