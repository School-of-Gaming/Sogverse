--
-- Name: gedu_holds_seat_at_session(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_holds_seat_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p_gedu_id IS NOT NULL
     AND p_group_id IS NOT NULL
     AND p_session_date IS NOT NULL
     -- "…they are either assigned to the group…"
     AND (
           EXISTS (
             SELECT 1
               FROM public.gedu_group_assignments a
              WHERE a.group_id = p_group_id
                AND a.gedu_id  = p_gedu_id
           )
           -- "…or hold a `substituted` request for it." No window test and no
           -- certification test, for the same reason its parent predicate makes
           -- neither: this answers WHO IS DOING THE JOB, a staffing fact, and
           -- conflating it with access would make a past session's staffing
           -- silently change fifteen days later.
           OR EXISTS (
             SELECT 1
               FROM public.session_substitution_requests r
              WHERE r.group_id     = p_group_id
                AND r.session_date = p_session_date
                AND r.substitute_id   = p_gedu_id
                AND r.status       = 'substituted'::public.substitution_request_status
           )
         );
$$;


--
-- Name: FUNCTION gedu_holds_seat_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_holds_seat_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS 'Internal predicate: does this gedu still hold a SEAT at (group, date) — assigned to the group, or the substitute_id of a live `substituted` request for it? The second half of the derivation sentence, lifted out because three callers ask it: gedu_is_expected_at_session (which is this AND holding no live request of your own), the orphan sweep (which withdraws every request whose requester no longer passes this), and approve_session_substitution_offer (which refuses to seat a sub for somebody who no longer passes it). Makes NO access-window and NO certification test, exactly as its parent does not: it answers who is DOING THE JOB, a staffing fact, where gedu_substitutes_session answers who may REACH the group. Takes the gedu as an argument rather than reading auth.uid(), because every caller asks it about somebody else. Not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_holds_seat_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_holds_seat_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_holds_seat_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) TO service_role;


