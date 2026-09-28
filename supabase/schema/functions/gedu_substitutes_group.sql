--
-- Name: gedu_substitutes_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_substitutes_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.session_substitution_requests r
     WHERE r.group_id   = p_group_id
       AND r.substitute_id = (SELECT auth.uid())
       AND r.status     = 'substituted'::public.substitution_request_status
       AND public.gedu_substitutes_session(r.group_id, r.session_date)
  );
$$;


--
-- Name: FUNCTION gedu_substitutes_group(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_substitutes_group(p_group_id uuid) IS 'Internal-by-intent predicate: does the CALLER hold a live substitution on ANY date of this group? One EXISTS over gedu_substitutes_session, so the access window has exactly one definition. This is the arm added to every GROUP-WIDE gate on gedu_group_assignments — the workspace, the feed, notes, roster, member flair, the game-account editors and the site notes — on the owner''s rule that a sub sees everything the main gedu sees for as long as their window is open. It is NOT the arm used by the two date-scoped exceptions (the voice room and the family report mail), which call gedu_substitutes_session directly. EXPOSED TO `authenticated`, unlike the other three substitution predicates, and for one reason: the gedus_read_assigned_groups policy on product_groups calls it, and an RLS policy is evaluated as the querying role, so it cannot call a private helper. Inlining the EXISTS instead would have needed a table SELECT grant AND a read policy on session_substitution_requests — strictly more Data API surface than one boolean — which is the same trade the three sibling policies on that table already made with has_active_participation_in_group. Self-scoping: it answers only about the caller, no argument can name a different asker, and it is total, so a USING clause is never handed a three-valued answer.';


--
-- Name: FUNCTION gedu_substitutes_group(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_substitutes_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_substitutes_group(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.gedu_substitutes_group(p_group_id uuid) TO service_role;


