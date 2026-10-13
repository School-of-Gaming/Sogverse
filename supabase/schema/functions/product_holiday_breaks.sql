--
-- Name: product_holiday_breaks(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.product_holiday_breaks(p_product_id uuid, p_from date, p_to date) RETURNS TABLE(break_id uuid, calendar_id uuid, start_date date, end_date date)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT b.id, b.calendar_id, b.start_date, b.end_date
    FROM public.product_holiday_calendars phc
    JOIN public.holiday_breaks b ON b.calendar_id = phc.calendar_id
   WHERE phc.product_id = p_product_id
     AND b.start_date  <= p_to
     AND b.end_date    >= p_from
   ORDER BY b.start_date, b.id;
$$;


--
-- Name: FUNCTION product_holiday_breaks(p_product_id uuid, p_from date, p_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.product_holiday_breaks(p_product_id uuid, p_from date, p_to date) IS 'The breaks of every holiday calendar the product follows that touch [p_from, p_to], both ends inclusive, ordered by first day then id. Breaks of two calendars may overlap, and both are returned. No rows when either bound is NULL. SECURITY INVOKER over product_holiday_calendars and holiday_breaks, whose read policies admit every followed calendar''s breaks to anon and authenticated alike, so it answers every caller identically — which is what lets planned_session_dates stay INVOKER and identical too.';


--
-- Name: FUNCTION product_holiday_breaks(p_product_id uuid, p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.product_holiday_breaks(p_product_id uuid, p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.product_holiday_breaks(p_product_id uuid, p_from date, p_to date) TO anon;
GRANT ALL ON FUNCTION public.product_holiday_breaks(p_product_id uuid, p_from date, p_to date) TO authenticated;
GRANT ALL ON FUNCTION public.product_holiday_breaks(p_product_id uuid, p_from date, p_to date) TO service_role;


