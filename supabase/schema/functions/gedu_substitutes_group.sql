--
-- Name: gedu_substitutes_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_substitutes_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- A temporary seat: a live substitution on any date of the group…
  SELECT EXISTS (
    SELECT 1
      FROM public.session_substitution_requests r
     WHERE r.group_id   = p_group_id
       AND r.substitute_id = (SELECT auth.uid())
       AND r.status     = 'substituted'::public.substitution_request_status
       AND public.gedu_substitutes_session(r.group_id, r.session_date)
  )
  -- …or an ended assignment still in its window.
  OR EXISTS (
    SELECT 1
      FROM public.gedu_unexpired_ended_assignment_dates((SELECT auth.uid()), p_group_id)
  );
$$;


--
-- Name: FUNCTION gedu_substitutes_group(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_substitutes_group(p_group_id uuid) IS 'Internal-by-intent predicate: does the CALLER hold a TEMPORARY seat on this group — a live substitution on ANY of its dates (an EXISTS over gedu_substitutes_session, so the access window has exactly one definition), or an ENDED assignment still in its window on any of its dates (gedu_unexpired_ended_assignment_dates, which closes on the same window end)? This is the arm added to every GROUP-WIDE gate on gedu_group_assignments — the workspace, the feed, notes, roster, member flair, the game-account editors and the site notes — on the owner''s rule that a sub sees everything the main gedu sees for as long as their window is open, and that a gedu taken off a group is treated like one. It is NOT the arm used by the two date-scoped exceptions (the voice room and the family report mail): the voice room is current-only for an ended gedu, and the report mail asks about the claimed date itself. EXPOSED TO `authenticated`, unlike the other substitution predicates, and for one reason: the gedus_read_assigned_groups policy on product_groups calls it, and an RLS policy is evaluated as the querying role, so it cannot call a private helper. Inlining the EXISTS instead would have needed a table SELECT grant AND a read policy on session_substitution_requests — strictly more Data API surface than one boolean. Self-scoping: it answers only about the caller, no argument can name a different asker, and it is total, so a USING clause is never handed a three-valued answer.';


--
-- Name: FUNCTION gedu_substitutes_group(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_substitutes_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_substitutes_group(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.gedu_substitutes_group(p_group_id uuid) TO service_role;


