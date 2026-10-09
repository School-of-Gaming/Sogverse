--
-- Name: session_plan_horizon(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid DEFAULT NULL::uuid, p_at_least date DEFAULT NULL::date) RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
           WHEN p.end_date IS NOT NULL THEN p.end_date
           ELSE GREATEST(
                  p_at_least,
                  -- The ninth planned date from yesterday on that the group
                  -- has not cancelled: an open-ended list shows eight upcoming
                  -- sessions (OPEN_ENDED_OCCURRENCE_CAP), and starting a day
                  -- back keeps one still running past midnight inside the
                  -- span, so one more guarantees the next running session is.
                  (SELECT planned.session_date
                     FROM public.planned_session_dates(
                            p.id,
                            (now() AT TIME ZONE p.timezone)::date - 1,
                            (now() AT TIME ZONE p.timezone)::date - 1 + 3660
                          ) AS planned
                    WHERE p_group_id IS NULL
                       OR NOT EXISTS (
                            SELECT 1
                              FROM public.session_cancellations c
                             WHERE c.group_id     = p_group_id
                               AND c.session_date = planned.session_date
                          )
                    ORDER BY planned.session_date
                   OFFSET 8
                    LIMIT 1)
                )
         END
    FROM public.products p
   WHERE p.id = p_product_id;
$$;


--
-- Name: FUNCTION session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date) IS 'The last date worth reading a product''s plan to. A dated product''s end_date; for an open-ended one, the ninth planned date on or after product-local yesterday that p_group_id has not cancelled (every planned date when p_group_id is NULL) — eight upcoming sessions plus one, so the next session that actually runs is always inside — raised to p_at_least when that is later. NULL for an open-ended product with no slots and no p_at_least.';


--
-- Name: FUNCTION session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date) TO service_role;


