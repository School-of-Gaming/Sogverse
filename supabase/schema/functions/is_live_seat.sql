--
-- Name: is_live_seat(public.participation_status); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_live_seat(p_status public.participation_status) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT p_status = 'active'::public.participation_status;
$$;


--
-- Name: FUNCTION is_live_seat(p_status public.participation_status); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_live_seat(p_status public.participation_status) IS 'Whether a participation in this status holds a seat now: active, and nothing else. waitlisted is a place in line, and ended held a seat once. A reader that means "who is in the club" asks this rather than listing statuses of its own.';


--
-- Name: FUNCTION is_live_seat(p_status public.participation_status); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_live_seat(p_status public.participation_status) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_live_seat(p_status public.participation_status) TO service_role;


