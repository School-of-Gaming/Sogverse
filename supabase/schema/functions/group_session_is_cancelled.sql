--
-- Name: group_session_is_cancelled(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
           SELECT 1
             FROM public.session_cancellations c
            WHERE c.group_id     = p_group_id
              AND c.session_date = p_session_date
         )
     AND public.group_session_date_is_scheduled(p_group_id, p_session_date);
$$;


--
-- Name: FUNCTION group_session_is_cancelled(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) IS 'Is this (group, date) a cancelled session: a cancellation row exists AND the current schedule still projects the date. A cancellation on a date the schedule no longer projects is inert and answers false here.';


--
-- Name: FUNCTION group_session_is_cancelled(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) TO service_role;


