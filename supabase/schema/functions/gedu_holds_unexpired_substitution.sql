--
-- Name: gedu_holds_unexpired_substitution(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.session_substitution_requests r
      JOIN public.gedu_profiles gp  ON gp.user_id = r.substitute_id
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.status       = 'substituted'::public.substitution_request_status
       AND r.substitute_id   = p_gedu_id
       -- Still certified. De-certifying an educator ends their substitution access
       -- mid-window, which is the point of checking it here rather than only at
       -- approval time.
       AND gp.certified
       AND now() < public.group_session_access_ends_at(r.group_id, r.session_date)
  );
$$;


--
-- Name: FUNCTION gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS 'Internal predicate: does this gedu still hold this (group, date) substitution at all? True when they are the substitute_id of a `substituted` request for it, are still certified, and it has not EXPIRED — now() is before group_session_access_ends_at, the single definition of the window''s END (24 hours after the report was mailed, or product-local midnight 15 days after the session date). It makes NO start test, which is what separates it from gedu_substitutes_session: this one answers whether the substitution is still the gedu''s to SEE, and the gedu seat reads (gedu_assigned_products, gedu_assignment_summaries) ask it so that an accepted substitution appears on My SOG from approval rather than from the moment its workspace opens. Takes the gedu as an argument: gedu_substitutes_session asks it about the caller, and the seat reads about the gedu they were handed, who is not the caller when the Discord bot asks. Not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date) TO service_role;


