--
-- Name: planned_group_sessions(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.planned_group_sessions(p_product_id uuid, p_from date, p_to date) RETURNS TABLE(session_date date, starts_at timestamp with time zone, ends_at timestamp with time zone, cancelled_group_ids uuid[])
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT planned.session_date,
         planned.starts_at,
         planned.ends_at,
         COALESCE(
           (SELECT array_agg(c.group_id ORDER BY c.group_id)
              FROM public.session_cancellations c
              JOIN public.product_groups g ON g.id = c.group_id
             WHERE g.product_id   = p_product_id
               AND c.session_date = planned.session_date),
           '{}'::uuid[]
         ) AS cancelled_group_ids
    FROM public.planned_session_dates(p_product_id, p_from, p_to) AS planned
   ORDER BY planned.session_date, planned.starts_at;
$$;


--
-- Name: FUNCTION planned_group_sessions(p_product_id uuid, p_from date, p_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.planned_group_sessions(p_product_id uuid, p_from date, p_to date) IS 'planned_session_dates with, on each date, the product''s groups that have a session_cancellations row for it. Every cancellation on a planned date is in effect — group_session_is_cancelled admits it by its projected arm — so `g = ANY(cancelled_group_ids)` is exactly group_session_is_cancelled(g, date) on every row this returns. Service role only: cancellations are staff data.';


--
-- Name: FUNCTION planned_group_sessions(p_product_id uuid, p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.planned_group_sessions(p_product_id uuid, p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.planned_group_sessions(p_product_id uuid, p_from date, p_to date) TO service_role;


