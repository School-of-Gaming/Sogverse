--
-- Name: create_holiday_calendar(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_holiday_calendar(p_name text, p_breaks jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN public.save_holiday_calendar(NULL, p_name, p_breaks);
END;
$$;


--
-- Name: FUNCTION create_holiday_calendar(p_name text, p_breaks jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_holiday_calendar(p_name text, p_breaks jsonb) IS 'Admin-gated create of a holiday calendar with its breaks, each {id: null, start_date, end_date, names: [{locale, name}]}; returns the new calendar''s id. One of the two ways a row reaches holiday_calendars, holiday_breaks or holiday_break_translations: none carries a write grant. SECURITY DEFINER with an empty search_path, guard-first on assert_admin(), not STRICT so a NULL argument cannot skip the guard. The validation and the write are save_holiday_calendar''s; a break carrying an id is refused here, since a new calendar has no breaks of its own yet.';


--
-- Name: FUNCTION create_holiday_calendar(p_name text, p_breaks jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_holiday_calendar(p_name text, p_breaks jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_holiday_calendar(p_name text, p_breaks jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_holiday_calendar(p_name text, p_breaks jsonb) TO service_role;


