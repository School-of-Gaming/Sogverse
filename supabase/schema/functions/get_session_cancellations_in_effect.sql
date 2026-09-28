--
-- Name: get_session_cancellations_in_effect(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_session_cancellations_in_effect(p_group_ids uuid[]) RETURNS TABLE(group_id uuid, session_date date)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT c.group_id, c.session_date
    FROM public.session_cancellations c
   WHERE c.group_id = ANY (p_group_ids)
     AND public.group_session_is_cancelled(c.group_id, c.session_date);
$$;


--
-- Name: FUNCTION get_session_cancellations_in_effect(p_group_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_session_cancellations_in_effect(p_group_ids uuid[]) IS 'Every cancelled (group, date) in effect among the given groups — group_session_is_cancelled holding — and no reason, stamp or author: the partner API needs only which of its recorded sessions did not happen. Service-role only: its caller has no Sogverse user, and no client role is granted the table behind it.';


--
-- Name: FUNCTION get_session_cancellations_in_effect(p_group_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_session_cancellations_in_effect(p_group_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_session_cancellations_in_effect(p_group_ids uuid[]) TO service_role;


