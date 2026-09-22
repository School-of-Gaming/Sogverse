--
-- Name: participation_state(public.participation_status, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN p_status = 'waitlisted' THEN 'waitlisted'
    WHEN p_group_id IS NULL      THEN 'unassigned'
    ELSE 'assigned'
  END;
$$;


--
-- Name: FUNCTION participation_state(p_status public.participation_status, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) TO service_role;


