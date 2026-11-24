--
-- Name: gedu_holds_live_substitution_on_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_holds_live_substitution_on_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.session_substitution_requests r
     WHERE r.group_id      = p_group_id
       AND r.substitute_id = (SELECT auth.uid())
       AND r.status        = 'substituted'::public.substitution_request_status
       AND public.gedu_substitutes_session(r.group_id, r.session_date)
  );
$$;


--
-- Name: FUNCTION gedu_holds_live_substitution_on_group(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_holds_live_substitution_on_group(p_group_id uuid) IS 'Internal predicate: does the CALLER hold a live substitution on ANY date of this group — an EXISTS over gedu_substitutes_session, so the access window and the certification test have one definition? The substitution half of gedu_substitutes_group, named on its own because the session writes and the workspace document ask it alone: a live substitution writes every session of the group (gedu_writes_group_session), where an ended assignment writes only its windowed dates. Not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_holds_live_substitution_on_group(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_holds_live_substitution_on_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_holds_live_substitution_on_group(p_group_id uuid) TO service_role;


