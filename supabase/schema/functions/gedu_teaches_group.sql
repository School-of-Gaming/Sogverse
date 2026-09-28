--
-- Name: gedu_teaches_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_teaches_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
     WHERE ga.group_id = p_group_id
       AND ga.gedu_id  = (SELECT auth.uid())
  )
  -- The substitution branch: a live, certified substitution on this group reaches everything
  -- the group's assigned gedus reach, for as long as their access window is
  -- open. Group-wide rather than per-date on purpose — the workspace, the
  -- roster, the notes and the report are all one surface, and a sub who may
  -- write the report has to be able to open the page it is written on. The two
  -- date-scoped exceptions (the voice room and the report MAIL) do not go
  -- through this predicate; see their own bodies.
  OR public.gedu_substitutes_group(p_group_id);
$$;


--
-- Name: FUNCTION gedu_teaches_group(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_teaches_group(p_group_id uuid) IS 'Internal predicate: may the caller act as staff on this group — assigned to it, OR holding a live substitution on it (gedu_substitutes_group, which carries the certification test and the access window). The single gate behind the group workspace, the session notes and report, the register, the session photos and their delete check, and the group notes; gedu_teaches_gamer composes it too, which is why that predicate needed no edit of its own. NOT the gate behind the voice room or the family report mail — both of those are DATE-scoped and call gedu_substitutes_session directly, because a sub has no business in the group''s other sessions and the report mail is at-most-once with no resend. Not exposed to authenticated: it is called from inside the SECURITY DEFINER gedu RPCs.';


--
-- Name: FUNCTION gedu_teaches_group(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_teaches_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_teaches_group(p_group_id uuid) TO service_role;


