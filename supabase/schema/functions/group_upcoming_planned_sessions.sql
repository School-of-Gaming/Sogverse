--
-- Name: group_upcoming_planned_sessions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_upcoming_planned_sessions(p_group_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'session_date', planned.session_date,
               'starts_at',    planned.starts_at,
               'ends_at',      planned.ends_at,
               'cancelled',    g.id = ANY (planned.cancelled_group_ids)
             )
             ORDER BY planned.session_date, planned.starts_at
           ),
           '[]'::jsonb
         )
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   CROSS JOIN LATERAL public.planned_group_sessions(
         p.id,
         -- The day before the product-local today, so a session still running
         -- past midnight is in.
         (now() AT TIME ZONE p.timezone)::date - 1,
         public.session_plan_horizon(p.id, g.id)
       ) AS planned
   WHERE g.id = p_group_id;
$$;


--
-- Name: FUNCTION group_upcoming_planned_sessions(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_upcoming_planned_sessions(p_group_id uuid) IS 'Internal: a group''s planned sessions (planned_group_sessions) from the day before the product-local today to session_plan_horizon for the group, as a jsonb array of {session_date, starts_at, ends_at, cancelled}, soonest first, `cancelled` true where the group has cancelled that date. The day before so a session still running past midnight is in; the horizon so an open-ended product''s list holds its first eight sessions that have not ended plus the group''s next running one. A gedu''s standing seat reads it, through gedu_assigned_products, to name the next session and to list the sessions an absence can be filed for. An empty array for a group that does not exist. Dates and the flag only: never who cancelled or why. SECURITY INVOKER, reached from inside SECURITY DEFINER readers.';


--
-- Name: FUNCTION group_upcoming_planned_sessions(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_upcoming_planned_sessions(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_upcoming_planned_sessions(p_group_id uuid) TO service_role;


