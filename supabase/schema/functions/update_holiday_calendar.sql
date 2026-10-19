--
-- Name: update_holiday_calendar(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- Two saves of one calendar serialize here, so each validates the breaks
  -- the other left rather than the ones it read before.
  PERFORM 1 FROM public.holiday_calendars WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Holiday calendar not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.save_holiday_calendar(p_id, p_name, p_breaks);
END;
$$;


--
-- Name: FUNCTION update_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb) IS 'Admin-gated save of a holiday calendar whole: its name and every break it holds afterwards. A break with an id is that stored break, edited (its dates only when they changed); one without is new; a stored break the payload leaves out is deleted; each break''s names are replaced. An id belonging to another calendar is refused. The edit is live: every club following the calendar gains or loses the dates at once, in past months as in future ones, and whatever is stored on a date that becomes a holiday counts as not running until the date stops being one. Locks the calendar row, so concurrent saves serialize. An id no calendar has raises no_data_found. SECURITY DEFINER, guard-first on assert_admin(), not STRICT; the validation and the write are save_holiday_calendar''s.';


--
-- Name: FUNCTION update_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.update_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb) TO service_role;


