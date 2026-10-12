--
-- Name: group_session_date_is_holiday(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_session_date_is_holiday(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
           SELECT 1
             FROM public.product_groups g
            CROSS JOIN LATERAL public.product_holiday_breaks(
                    g.product_id, p_session_date, p_session_date
                  ) AS hb
            WHERE g.id = p_group_id
         );
$$;


--
-- Name: FUNCTION group_session_date_is_holiday(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_session_date_is_holiday(p_group_id uuid, p_session_date date) IS 'Whether the date falls in a break of a holiday calendar the group''s product follows. The holiday arm of group_session_is_cancelled, and the partner API''s way to name a stored session on a holiday. Service-role only.';


--
-- Name: FUNCTION group_session_date_is_holiday(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_session_date_is_holiday(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_date_is_holiday(p_group_id uuid, p_session_date date) TO service_role;


