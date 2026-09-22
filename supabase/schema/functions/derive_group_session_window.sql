--
-- Name: derive_group_session_window(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) RETURNS tstzrange
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_timezone text;
  v_start    time;
  v_duration integer;
  v_starts   timestamptz;
BEGIN
  IF p_group_id IS NULL OR p_session_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.timezone
    INTO v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  IF v_timezone IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.start_time, s.duration_minutes
    INTO v_start, v_duration
    FROM public.product_groups g
    JOIN public.schedule_slots s ON s.product_id = g.product_id
   WHERE g.id = p_group_id
     -- schedule_slots.weekday is 0 = Monday; ISODOW is 1 = Monday.
     AND s.weekday = (EXTRACT(ISODOW FROM p_session_date)::integer - 1)
   ORDER BY s.start_time
   LIMIT 1;

  IF v_start IS NULL THEN
    RETURN NULL;
  END IF;

  -- `timestamp AT TIME ZONE zone` resolves a wall-clock time in that zone to
  -- the correct instant, so this is DST-correct without any arithmetic of our
  -- own. Adding the duration to the INSTANT (not to the wall clock) keeps a
  -- session that straddles a transition the right length.
  v_starts := (p_session_date + v_start) AT TIME ZONE v_timezone;

  RETURN tstzrange(
    v_starts,
    v_starts + make_interval(mins => v_duration),
    '[)'
  );
END;
$$;


--
-- Name: FUNCTION derive_group_session_window(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) IS 'Server-side derivation of a session''s scheduled instants from the CURRENT schedule. NULL when the date matches no slot weekday.';


--
-- Name: FUNCTION derive_group_session_window(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.derive_group_session_window(p_group_id uuid, p_session_date date) TO service_role;


