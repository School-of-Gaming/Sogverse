--
-- Name: gedu_trains_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_trains_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.gedu_group_trainees t
     WHERE t.group_id = p_group_id
       AND t.gedu_id  = (SELECT auth.uid())
  );
$$;


--
-- Name: FUNCTION gedu_trains_group(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_trains_group(p_group_id uuid) IS 'Internal predicate: does the CALLER hold a trainee seat on this group. The gate behind the trainee''s own workspace and product documents, and the trainee arm of is_voice_group_member. Deliberately NOT an arm of gedu_teaches_group or of any other staff predicate: a trainee sees the workspace with what a gamer on the group could see, and every staff gate stays closed to them. Group-scoped, where an assignment reaches the whole product''s voice rooms. Total: an unknown group is false. Not exposed to authenticated: it is called from inside SECURITY DEFINER functions.';


--
-- Name: FUNCTION gedu_trains_group(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_trains_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_trains_group(p_group_id uuid) TO service_role;


