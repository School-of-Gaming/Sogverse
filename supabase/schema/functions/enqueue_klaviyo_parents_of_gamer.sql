--
-- Name: enqueue_klaviyo_parents_of_gamer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_klaviyo_parents_of_gamer(p_gamer_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.enqueue_klaviyo_profiles(ARRAY(
    SELECT pg.parent_id FROM public.parent_gamer pg WHERE pg.gamer_id = p_gamer_id
  ));
$$;


--
-- Name: FUNCTION enqueue_klaviyo_parents_of_gamer(p_gamer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enqueue_klaviyo_parents_of_gamer(p_gamer_id uuid) IS 'Files every parent of a gamer in the Klaviyo profile outbox, because a parent''s Klaviyo profile describes their gamers. Granted to nobody.';


--
-- Name: FUNCTION enqueue_klaviyo_parents_of_gamer(p_gamer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_parents_of_gamer(p_gamer_id uuid) FROM PUBLIC;


