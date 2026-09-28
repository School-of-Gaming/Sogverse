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
     AND (
           public.group_session_date_is_scheduled(p_group_id, p_session_date)
           -- A kept record holds its cancellation whatever the schedule does
           -- next: without this arm, removing the slot or narrowing the term
           -- would hand a cancelled session's report back to the families and
           -- its date back to the invoice.
           OR EXISTS (
                SELECT 1
                  FROM public.group_sessions s
                 WHERE s.group_id     = p_group_id
                   AND s.session_date = p_session_date
              )
         );
$$;


--
-- Name: FUNCTION group_session_is_cancelled(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) IS 'THE test for whether a (group, date) is a cancelled session, asked by every reader and writer: a cancellation row exists AND either the current schedule projects the date or a group_sessions row is stored on it. A cancellation over a stored record therefore stays in effect through any later schedule or term edit. One on a date with neither a projection nor a row is inert and answers false here; it is kept, and applies again if the schedule moves back.';


--
-- Name: FUNCTION group_session_is_cancelled(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) TO service_role;


