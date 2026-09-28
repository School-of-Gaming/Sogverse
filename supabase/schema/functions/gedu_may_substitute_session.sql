--
-- Name: gedu_may_substitute_session(uuid, uuid, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_may_substitute_session(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_absent_gedu_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p_gedu_id IS NOT NULL
     AND p_group_id IS NOT NULL
     AND p_session_date IS NOT NULL
     -- (1) Not the absent gedu. Also a CHECK on the table, and stated here so
     -- the refusal reads the same as the other three at every call site.
     AND p_gedu_id IS DISTINCT FROM p_absent_gedu_id
     -- (2) A CERTIFIED gedu. This is the third thing gedu_profiles.certified
     -- gates, and the only eligibility test there is: no coverage area, no
     -- language match, no schedule-clash check. Those are follow-ups.
     AND EXISTS (
           SELECT 1
             FROM public.profiles pr
             JOIN public.gedu_profiles gp ON gp.user_id = pr.id
            WHERE pr.id   = p_gedu_id
              AND pr.role = 'gedu'::public.user_role
              AND gp.certified
         )
     -- (3) NOT ALREADY EXPECTED at that session. Stops one person holding two
     -- seats on one session, which would make "who did which job" unanswerable.
     AND NOT public.gedu_is_expected_at_session(p_gedu_id, p_group_id, p_session_date)
     -- (4) Holding no non-withdrawn request of their own on that (group, date).
     -- Stops a sub substituting their own substitute — the person who said they
     -- cannot be there cannot be the answer to somebody else's absence on the
     -- same day.
     AND NOT EXISTS (
           SELECT 1
             FROM public.session_substitution_requests r
            WHERE r.group_id     = p_group_id
              AND r.session_date = p_session_date
              AND r.requested_by = p_gedu_id
              AND r.status <> 'withdrawn'::public.substitution_request_status
         );
$$;


--
-- Name: FUNCTION gedu_may_substitute_session(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_absent_gedu_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_may_substitute_session(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_absent_gedu_id uuid) IS 'Internal predicate: may this gedu be seated as the sub for this (group, date)? Four refusals, and the last two are the interesting ones: (1) not the absent gedu, (2) a certified gedu — the ONLY eligibility test there is, with coverage area, language and schedule clash all deliberately left to follow-ups, (3) not already expected at that session, and (4) holding no non-withdrawn request of their own on that (group, date). Together (3) and (4) stop a sub covering their own substitute and stop two seats collapsing onto one person, which would make "who did which job" unanswerable. Asked by offer_session_substitution, again by approve_session_substitution_offer under the request''s lock, by set_session_substitution, and by get_open_substitution_requests as its exclusion — the pool list shows a gedu exactly the requests they could actually take. Not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_may_substitute_session(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_absent_gedu_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_may_substitute_session(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_absent_gedu_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_may_substitute_session(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_absent_gedu_id uuid) TO service_role;


