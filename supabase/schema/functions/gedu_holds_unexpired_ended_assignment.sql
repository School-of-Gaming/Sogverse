--
-- Name: gedu_holds_unexpired_ended_assignment(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           -- They held the group at that session…
           EXISTS (
             SELECT 1
               FROM public.group_assignments_at(
                      p_group_id,
                      public.group_session_starts_at(p_group_id, p_session_date)
                    ) a
              WHERE a.gedu_id = p_gedu_id
           )
           -- …and hold it no longer: with no current period on the group, the
           -- period that held the session is an ended one.
           AND NOT EXISTS (
             SELECT 1
               FROM public.gedu_group_assignments ga
              WHERE ga.group_id = p_group_id
                AND ga.gedu_id  = p_gedu_id
                AND ga.ended_at IS NULL
           )
           -- Only a session they were expected at: not one they filed an
           -- absence for, whoever ran it.
           AND public.gedu_is_expected_at_session(p_gedu_id, p_group_id, p_session_date)
           AND NOT public.group_session_is_cancelled(p_group_id, p_session_date)
           -- The substitute window's END, its one definition.
           AND now() < public.group_session_access_ends_at(p_group_id, p_session_date),
           false
         );
$$;


--
-- Name: FUNCTION gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS 'Internal predicate, the sibling of gedu_holds_unexpired_substitution: does this gedu still hold this (group, date) through an ENDED assignment? True when they held the group at that session (group_assignments_at asked at group_session_starts_at) and hold no current period on it now, were expected at it (gedu_is_expected_at_session — so not a date they filed an absence for), it is not cancelled, and the substitute window has not closed (now() before group_session_access_ends_at). A gedu still current on the group is answered false: the current period already reaches everything this would. No certification test, unlike a substitution''s: the seat was a standing one. Takes the gedu as an argument because the seat reads ask it about the gedu they were handed. Not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_holds_unexpired_ended_assignment(p_gedu_id uuid, p_group_id uuid, p_session_date date) TO service_role;


