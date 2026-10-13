--
-- Name: derive_group_session_window(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) RETURNS tstzrange
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT tstzrange(planned.starts_at, planned.ends_at, '[)')
    FROM public.product_groups g
   CROSS JOIN LATERAL public.planned_session_dates(g.product_id, p_session_date, p_session_date) AS planned
   WHERE g.id = p_group_id
   ORDER BY planned.starts_at
   LIMIT 1;
$$;


--
-- Name: FUNCTION derive_group_session_window(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) IS 'A session''s scheduled instants from the CURRENT plan (planned_session_dates). NULL when the plan has no session on the date: outside the product''s term, on a weekday it has no slot for, or inside a break of a holiday calendar the product follows.';


--
-- Name: FUNCTION derive_group_session_window(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) TO service_role;


