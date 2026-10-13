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
                  COALESCE(
                    -- The eighth session that has not ended and that the group
                    -- has not cancelled: an open-ended list shows the first
                    -- eight sessions that have not closed
                    -- (OPEN_ENDED_OCCURRENCE_CAP in src/lib/planned-sessions.ts),
                    -- so the span holds all of them, and skipping the group's
                    -- cancellations keeps its next running session inside. The
                    -- read starts a day back so a session still running past
                    -- midnight counts.
                    (SELECT planned.session_date
                       FROM public.planned_session_dates(
                              p.id,
                              product_local.today - 1,
                              product_local.today + 366
                            ) AS planned
                      WHERE planned.ends_at > now()
                        AND (p_group_id IS NULL
                             OR NOT EXISTS (
                                  SELECT 1
                                    FROM public.session_cancellations c
                                   WHERE c.group_id     = p_group_id
                                     AND c.session_date = planned.session_date
                                ))
                      ORDER BY planned.session_date
                     OFFSET 7
                      LIMIT 1),
                    -- Fewer than eight within the year: the year's end, so
                    -- the span holds every one there is.
                    product_local.today + 366
                  )
                )
         END
    FROM public.products p
         -- The product-local today. The search reads one year ahead of it:
         -- slots are weekly, so eight are inside unless the product starts
         -- late in that year or a year of the group's sessions is cancelled.
   CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE p.timezone)::date AS today) AS product_local
   WHERE p.id = p_product_id;
$$;


--
-- Name: FUNCTION session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date) IS 'The last date worth reading a product''s plan to. A dated product''s end_date; for an open-ended one, the date of the eighth planned session that has not ended and that p_group_id has not cancelled (every planned session when p_group_id is NULL) — an open-ended list shows the first eight sessions that have not closed (OPEN_ENDED_OCCURRENCE_CAP in src/lib/planned-sessions.ts), so the span holds all of them, and skipping the group''s cancellations keeps its next running session inside — raised to p_at_least when that is later. The search reads one year past the product-local today; when fewer than eight qualify inside it (a product starting late in that year, a year of the group''s sessions cancelled, or no slots at all) the answer is that day, product-local today + 366, so the span holds every one there is.';


--
-- Name: FUNCTION session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.session_plan_horizon(p_product_id uuid, p_group_id uuid, p_at_least date) TO service_role;


