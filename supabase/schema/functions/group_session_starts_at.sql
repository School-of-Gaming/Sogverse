--
-- Name: group_session_starts_at(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_session_starts_at(p_group_id uuid, p_session_date date) RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           -- A stored session keeps the start it was written with.
           (SELECT gs.starts_at
              FROM public.group_sessions gs
             WHERE gs.group_id     = p_group_id
               AND gs.session_date = p_session_date),
           -- Otherwise the plan's start, a holiday-withdrawn date included: a
           -- request filed before its date became a holiday still names a
           -- session, and it is judged at the instant it would have started.
           (SELECT planned.starts_at
              FROM public.product_groups g
             CROSS JOIN LATERAL public.planned_session_dates(
                     g.product_id, p_session_date, p_session_date, true
                   ) AS planned
             WHERE g.id = p_group_id
             ORDER BY planned.starts_at
             LIMIT 1),
           -- A date the plan has no session on: product-local midnight.
           (SELECT p_session_date::timestamp AT TIME ZONE p.timezone
              FROM public.product_groups g
              JOIN public.products p ON p.id = g.product_id
             WHERE g.id = p_group_id)
         );
$$;


--
-- Name: FUNCTION group_session_starts_at(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_session_starts_at(p_group_id uuid, p_session_date date) IS 'Internal: the start instant of the session a (group, date) names — the one rule every reader that places a session in an assignment period applies. The stored group_sessions row''s starts_at when there is one; else the plan''s start from planned_session_dates, holiday-withdrawn dates included; else product-local midnight of the date. NULL only for a group that does not exist. Not granted to `authenticated`.';


--
-- Name: FUNCTION group_session_starts_at(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_session_starts_at(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_starts_at(p_group_id uuid, p_session_date date) TO service_role;


