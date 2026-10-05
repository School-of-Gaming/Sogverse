--
-- Name: gedu_speaks_session_language(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_speaks_session_language(p_gedu_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
           SELECT 1
             FROM public.product_groups g
             JOIN public.products p  ON p.id = g.product_id
             JOIN public.profiles pr ON pr.id = p_gedu_id
            WHERE g.id = p_group_id
              AND p.spoken_language_code = ANY (pr.spoken_languages)
         );
$$;


--
-- Name: FUNCTION gedu_speaks_session_language(p_gedu_id uuid, p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_speaks_session_language(p_gedu_id uuid, p_group_id uuid) IS 'Internal predicate: does this gedu list, among their spoken_languages, the language the product of this group is run in (spoken_language_code)? False for a gedu who has listed none, so such a gedu''s pool is empty — accepted rather than special-cased — and false for an unknown gedu or group. The sibling of gedu_holds_session_qualifications, asked on exactly the same paths for the same reasons: by get_open_substitution_requests as its exclusion and by offer_session_substitution as a refusal with its own message, and deliberately NOT by gedu_may_substitute_session, because an admin seating, approving or assigning a gedu who does not speak the language is warned in the UI and may proceed. SECURITY INVOKER and reached only from inside SECURITY DEFINER callers; not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_speaks_session_language(p_gedu_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_speaks_session_language(p_gedu_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_speaks_session_language(p_gedu_id uuid, p_group_id uuid) TO service_role;


