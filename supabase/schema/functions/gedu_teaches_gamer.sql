--
-- Name: gedu_teaches_gamer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_teaches_gamer(p_gamer_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.participations p
     WHERE p.participant_id = p_gamer_id
       AND p.group_id IS NOT NULL
       AND p.status = 'active'::public.participation_status
       AND public.gedu_teaches_group(p.group_id)
  );
$$;


--
-- Name: FUNCTION gedu_teaches_gamer(p_gamer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_teaches_gamer(p_gamer_id uuid) IS 'Internal predicate: is the CALLER a gedu on a group this gamer is actively in? Deliberately composed from the roster''s own two halves rather than computed afresh — gedu_teaches_group is the ownership test get_gedu_group_feed makes before handing over a roster at all, and the active-participation filter is the one that feed applies when deciding who is on it — so "a gedu may see this child''s photo answer" cannot drift away from "this child is on a roster that gedu may open". SECURITY DEFINER because an RLS policy evaluates its predicate as the querying role, and a gedu cannot read `participations` across families; being definer is also what lets it call gedu_teaches_group, which stays ungranted for exactly that reason. Self-scoping: it answers only about the caller, no argument can name a different asker, and it is total — an unknown gamer id is false rather than NULL, so a USING clause is never handed a three-valued answer. Exposed to `authenticated` because the gamer_photo_consents read policy is a policy and must therefore be able to call it.';


--
-- Name: FUNCTION gedu_teaches_gamer(p_gamer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_teaches_gamer(p_gamer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_teaches_gamer(p_gamer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.gedu_teaches_gamer(p_gamer_id uuid) TO service_role;


