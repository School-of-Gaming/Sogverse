--
-- Name: group_assignments_at(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_assignments_at(p_group_id uuid, p_at timestamp with time zone) RETURNS TABLE(gedu_id uuid, role public.gedu_assignment_role)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT a.gedu_id, a.role
    FROM public.gedu_group_assignments a
   WHERE a.group_id = p_group_id
     AND a.started_at <= p_at
     AND (a.ended_at IS NULL OR p_at < a.ended_at);
$$;


--
-- Name: FUNCTION group_assignments_at(p_group_id uuid, p_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_assignments_at(p_group_id uuid, p_at timestamp with time zone) IS 'Internal: the gedus assigned to a group at an instant, each with the role of the period that holds it — the one containment rule, started_at <= instant < ended_at (an open end for a current period). At most one row per gedu, since one gedu''s periods on a product never overlap. Asked with group_session_starts_at to mean "assigned to the group at that session". No rows for a NULL instant. Not granted to `authenticated`.';


--
-- Name: FUNCTION group_assignments_at(p_group_id uuid, p_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_assignments_at(p_group_id uuid, p_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_assignments_at(p_group_id uuid, p_at timestamp with time zone) TO service_role;


