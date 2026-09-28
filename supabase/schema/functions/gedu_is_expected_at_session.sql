--
-- Name: gedu_is_expected_at_session(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_is_expected_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p_gedu_id IS NOT NULL
     AND p_group_id IS NOT NULL
     AND p_session_date IS NOT NULL
     -- "…they hold no non-withdrawn request for it…" — an open request and a
     -- substituted one both mean the same thing about the person who FILED it: they
     -- are not coming.
     AND NOT EXISTS (
           SELECT 1
             FROM public.session_substitution_requests r
            WHERE r.group_id     = p_group_id
              AND r.session_date = p_session_date
              AND r.requested_by = p_gedu_id
              AND r.status <> 'withdrawn'::public.substitution_request_status
         )
     AND public.gedu_holds_seat_at_session(p_gedu_id, p_group_id, p_session_date);
$$;


--
-- Name: FUNCTION gedu_is_expected_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_is_expected_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS 'Internal predicate, and the derivation the whole feature rests on: a gedu is expected at (group, date) iff they hold no non-withdrawn request for it, AND they are either assigned to the group or hold a `substituted` request for it. That one sentence handles the sub-of-sub chain, an open sub-of-sub request and a cleared substitution alike, which is why nothing stores "who is running this session" anywhere. Takes the gedu as an argument rather than reading auth.uid(), because every writer asks it about somebody else. Deliberately makes NO access-window and NO certification test: it answers who is DOING THE JOB, a staffing fact, where gedu_substitutes_session answers who may REACH the group, an access fact — conflating them would make a past session''s staffing silently change fifteen days later. Where a gedu is both assigned and holds a substitution on the same group (only an admin edit can produce that), the assignment supplies the role. Not granted to `authenticated`. The second half of that sentence — "assigned to the group, or holding a substituted request for it" — is gedu_holds_seat_at_session, which this composes rather than restates: three callers ask that question, and it is written out once.';


--
-- Name: FUNCTION gedu_is_expected_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_is_expected_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_is_expected_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) TO service_role;


