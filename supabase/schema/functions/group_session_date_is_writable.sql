--
-- Name: group_session_date_is_writable(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_session_date_is_writable(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_end_date date;
  v_timezone text;
BEGIN
  SELECT p.end_date, p.timezone
    INTO v_end_date, v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  IF NOT FOUND OR p_session_date IS NULL THEN
    RETURN false;
  END IF;

  -- Open-ended products show eight upcoming occurrences, which is eight weeks
  -- for a weekly club and eight days for a daily one. Ninety days is a
  -- comfortable superset of both and is meant to be: this is the loose bound,
  -- not a second schedule model. A dated product's horizon is its end date,
  -- which the plan already applies.
  IF v_end_date IS NULL
     AND p_session_date > (now() AT TIME ZONE v_timezone)::date + 90 THEN
    RETURN false;
  END IF;

  RETURN public.derive_group_session_window(p_group_id, p_session_date) IS NOT NULL;
END;
$$;


--
-- Name: FUNCTION group_session_date_is_writable(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_session_date_is_writable(p_group_id uuid, p_session_date date) IS 'Loose write validation for a session date: the current plan has a session on it (inside the term, on a slot weekday, outside every holiday break the product follows), and an open-ended product''s date is within ninety days of product-local today.';


--
-- Name: FUNCTION group_session_date_is_writable(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_session_date_is_writable(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_date_is_writable(p_group_id uuid, p_session_date date) TO service_role;


