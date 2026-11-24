--
-- Name: group_session_access_ends_at(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_session_access_ends_at(p_group_id uuid, p_session_date date) RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           -- 24 hours after the report was mailed…
           (SELECT gs.report_emailed_at + interval '24 hours'
              FROM public.group_sessions gs
             WHERE gs.group_id     = p_group_id
               AND gs.session_date = p_session_date),
           -- …or, if it never was (or the session row was never materialized),
           -- product-local midnight fifteen days after the session date, so a
           -- club in Helsinki and one in Los Angeles both get fifteen of their
           -- own days.
           (SELECT (p_session_date + 15)::timestamp AT TIME ZONE p.timezone
              FROM public.product_groups g
              JOIN public.products p ON p.id = g.product_id
             WHERE g.id = p_group_id)
         );
$$;


--
-- Name: FUNCTION group_session_access_ends_at(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_session_access_ends_at(p_group_id uuid, p_session_date date) IS 'Internal: when a temporary seat''s reach into a session''s group ends — 24 hours after the session''s report was mailed, or product-local midnight 15 days after the session date if it never was. The single definition of that window''s END. Not granted to `authenticated`.';


--
-- Name: FUNCTION group_session_access_ends_at(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_session_access_ends_at(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_access_ends_at(p_group_id uuid, p_session_date date) TO service_role;


