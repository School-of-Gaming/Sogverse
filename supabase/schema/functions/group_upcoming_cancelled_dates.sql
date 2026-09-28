--
-- Name: group_upcoming_cancelled_dates(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_upcoming_cancelled_dates(p_group_id uuid) RETURNS date[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(array_agg(c.session_date ORDER BY c.session_date), '{}'::date[])
    FROM public.session_cancellations c
    JOIN public.product_groups g ON g.id = c.group_id
    JOIN public.products p       ON p.id = g.product_id
   WHERE c.group_id = p_group_id
     AND c.session_date >= (now() AT TIME ZONE p.timezone)::date - 1
     AND public.group_session_is_cancelled(c.group_id, c.session_date);
$$;


--
-- Name: FUNCTION group_upcoming_cancelled_dates(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_upcoming_cancelled_dates(p_group_id uuid) IS 'The group''s cancelled session dates in effect (group_session_is_cancelled) from the day before product-local today onwards, ascending; empty when there are none. Dates only — no reason, stamp or author — because it feeds the gedu and family My SOG reads. The day before is kept so a session still running past local midnight is known to be cancelled. Private: called only from the SECURITY DEFINER reads that carry it.';


--
-- Name: FUNCTION group_upcoming_cancelled_dates(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_upcoming_cancelled_dates(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_upcoming_cancelled_dates(p_group_id uuid) TO service_role;


