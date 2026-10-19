--
-- Name: planned_sessions_document(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.planned_sessions_document(p_product_id uuid, p_to date) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'session_date', planned.session_date,
               'starts_at',    planned.starts_at,
               'ends_at',      planned.ends_at
             )
             ORDER BY planned.session_date, planned.starts_at
           ),
           '[]'::jsonb
         )
    FROM public.products p
   CROSS JOIN LATERAL public.planned_session_dates(p.id, p.start_date, p_to) AS planned
   WHERE p.id = p_product_id;
$$;


--
-- Name: FUNCTION planned_sessions_document(p_product_id uuid, p_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.planned_sessions_document(p_product_id uuid, p_to date) IS 'A product''s planned sessions from its start_date to p_to (planned_session_dates), as the `planned_sessions` member every session document carries: a JSON array of {session_date, starts_at, ends_at}, soonest first, and [] when the span plans nothing — including when p_to is NULL, which session_plan_horizon answers only for a product that does not exist. Plain plan rows: cancellations are not folded in. Service role only; the documents that call it are SECURITY DEFINER.';


--
-- Name: FUNCTION planned_sessions_document(p_product_id uuid, p_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.planned_sessions_document(p_product_id uuid, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.planned_sessions_document(p_product_id uuid, p_to date) TO service_role;


