--
-- Name: group_session_date_is_scheduled(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.derive_group_session_window(p_group_id, p_session_date) IS NOT NULL;
$$;


--
-- Name: FUNCTION group_session_date_is_scheduled(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) IS 'Does the CURRENT plan have a session on this date: inside the product''s term and on a weekday it has a slot for (planned_session_dates, through derive_group_session_window). The writable-date check minus its visible horizon — what a new cancellation is validated against, and one of the two ways a stored cancellation stays in effect (group_session_is_cancelled).';


--
-- Name: FUNCTION group_session_date_is_scheduled(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) TO service_role;


