--
-- Name: group_final_session_date(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_final_session_date(p_group_id uuid) RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT max(planned.session_date)
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   CROSS JOIN LATERAL public.planned_group_sessions(p.id, p.end_date - 366, p.end_date) AS planned
   WHERE g.id = p_group_id
     -- Explicit rather than relying on a NULL bound answering nothing: "an
     -- open-ended product has no final session" is a decision.
     AND p.end_date IS NOT NULL
     AND NOT (g.id = ANY (planned.cancelled_group_ids));
$$;


--
-- Name: FUNCTION group_final_session_date(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_final_session_date(p_group_id uuid) IS 'The group''s FINAL session: the last planned date on or before end_date that the group has not cancelled, so a cancelled last session hands the role to the one before it. NULL for an open-ended product and for a run that plans nothing. The search is the year ending at end_date: slots are weekly, so the answer is the run''s unless a whole year of the group''s sessions is cancelled. Its TypeScript twin is the final-session derivation in src/lib/session-occurrence.ts, and the two change together.';


--
-- Name: FUNCTION group_final_session_date(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_final_session_date(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_final_session_date(p_group_id uuid) TO service_role;


