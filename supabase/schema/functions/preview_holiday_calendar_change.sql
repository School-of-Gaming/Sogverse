--
-- Name: preview_holiday_calendar_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preview_holiday_calendar_change(p_calendar_id uuid, p_breaks jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_proposed daterange[];
  v_products jsonb;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
       SELECT 1 FROM public.holiday_calendars WHERE id = p_calendar_id
     ) THEN
    RAISE EXCEPTION 'Holiday calendar not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.load_holiday_calendar_breaks(p_calendar_id, p_breaks);

  SELECT COALESCE(
           array_agg(daterange(e.start_date, e.end_date, '[]')),
           '{}'::daterange[]
         )
    INTO v_proposed
    FROM pg_temp.holiday_calendar_payload e;

  -- Per following club: before is every break of every calendar it follows;
  -- after swaps this calendar's breaks for the proposed ones.
  SELECT COALESCE(jsonb_agg(x.impact ORDER BY x.product_id), '[]'::jsonb)
    INTO v_products
    FROM (
      SELECT phc.product_id,
             public.holiday_change_impact(
               phc.product_id, before.ranges, after.ranges || v_proposed
             ) AS impact
        FROM public.product_holiday_calendars phc
       CROSS JOIN LATERAL (
             SELECT COALESCE(
                      array_agg(daterange(b.start_date, b.end_date, '[]')),
                      '{}'::daterange[]
                    ) AS ranges
               FROM public.product_holiday_calendars o
               JOIN public.holiday_breaks b ON b.calendar_id = o.calendar_id
              WHERE o.product_id = phc.product_id
             ) AS before
       CROSS JOIN LATERAL (
             SELECT COALESCE(
                      array_agg(daterange(b.start_date, b.end_date, '[]')),
                      '{}'::daterange[]
                    ) AS ranges
               FROM public.product_holiday_calendars o
               JOIN public.holiday_breaks b ON b.calendar_id = o.calendar_id
              WHERE o.product_id = phc.product_id
                AND o.calendar_id <> p_calendar_id
             ) AS after
       WHERE phc.calendar_id = p_calendar_id
    ) AS x
   WHERE x.impact IS NOT NULL;

  RETURN jsonb_build_object('products', v_products);
END;
$$;


--
-- Name: FUNCTION preview_holiday_calendar_change(p_calendar_id uuid, p_breaks jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.preview_holiday_calendar_change(p_calendar_id uuid, p_breaks jsonb) IS 'Admin-gated preview of saving a holiday calendar''s breaks as p_breaks — the payload update_holiday_calendar takes, validated by the same load_holiday_calendar_breaks, so a payload the save would refuse is refused here with the same sentence. Writes nothing. Returns {products: [...]}, one holiday_change_impact entry per club following the calendar on which something would change, ordered by product id: before is every break of every calendar the club follows, after is the other calendars'' breaks plus the proposed ones, so a date another followed calendar covers changes nothing. A calendar no club follows, or an edit that changes no club''s dates, answers an empty list. An id no calendar has raises no_data_found. SECURITY DEFINER with an empty search_path — crossing into the stored session records and substitution requests, which carry no authenticated grant — guard-first on assert_admin(), not STRICT so a NULL argument cannot skip the guard.';


--
-- Name: FUNCTION preview_holiday_calendar_change(p_calendar_id uuid, p_breaks jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.preview_holiday_calendar_change(p_calendar_id uuid, p_breaks jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.preview_holiday_calendar_change(p_calendar_id uuid, p_breaks jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.preview_holiday_calendar_change(p_calendar_id uuid, p_breaks jsonb) TO service_role;


