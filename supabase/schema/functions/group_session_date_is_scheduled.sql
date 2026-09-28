--
-- Name: group_session_date_is_scheduled(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p_group_id IS NOT NULL
     AND p_session_date IS NOT NULL
     AND EXISTS (
           SELECT 1
             FROM public.product_groups g
             JOIN public.products p ON p.id = g.product_id
            WHERE g.id = p_group_id
              AND (p.start_date IS NULL OR p_session_date >= p.start_date)
              AND (p.end_date   IS NULL OR p_session_date <= p.end_date)
         )
     AND public.derive_group_session_window(p_group_id, p_session_date) IS NOT NULL;
$$;


--
-- Name: FUNCTION group_session_date_is_scheduled(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) IS 'Does the CURRENT schedule project a session on this date: inside the product''s start and end dates and on a weekday it has a slot for. The writable-date check minus its visible horizon — what a cancellation is validated against, and what decides whether a stored cancellation still applies.';


--
-- Name: FUNCTION group_session_date_is_scheduled(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) TO service_role;


