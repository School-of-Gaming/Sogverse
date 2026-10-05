--
-- Name: gedu_holds_session_qualifications(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_holds_session_qualifications(p_gedu_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT p_gedu_id IS NOT NULL
     AND EXISTS (
           SELECT 1
             FROM public.product_groups g
             JOIN public.products p ON p.id = g.product_id
            WHERE g.id = p_group_id
              AND NOT EXISTS (
                    SELECT 1
                      FROM unnest(public.product_required_qualifications(p.product_type, p.tag)) AS req(qualification)
                     WHERE NOT EXISTS (
                             SELECT 1
                               FROM public.gedu_qualifications gq
                              WHERE gq.gedu_id       = p_gedu_id
                                AND gq.qualification = req.qualification
                           )
                  )
         );
$$;


--
-- Name: FUNCTION gedu_holds_session_qualifications(p_gedu_id uuid, p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_holds_session_qualifications(p_gedu_id uuid, p_group_id uuid) IS 'Internal predicate: does this gedu hold every qualification the product of this group requires (product_required_qualifications)? True for a product that requires nothing; false for an unknown group. Asked only on the paths a gedu starts on their own — get_open_substitution_requests as its exclusion and offer_session_substitution as a refusal — and deliberately NOT by gedu_may_substitute_session, which the admin writes ask too: an admin seating, approving or assigning an unqualified gedu is warned in the UI and may proceed. Approval does not re-ask it, so an offer stays approvable whatever happens to the offerer''s qualifications afterwards. SECURITY INVOKER and reached only from inside SECURITY DEFINER callers; not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_holds_session_qualifications(p_gedu_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_holds_session_qualifications(p_gedu_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_holds_session_qualifications(p_gedu_id uuid, p_group_id uuid) TO service_role;


