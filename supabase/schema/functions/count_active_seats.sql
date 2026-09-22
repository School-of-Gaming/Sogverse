--
-- Name: count_active_seats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_active_seats(p_product_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COUNT(*)::INTEGER
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'active';
$$;


--
-- Name: FUNCTION count_active_seats(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_active_seats(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_active_seats(p_product_id uuid) TO service_role;


