--
-- Name: get_public_team_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_team_profile(p_user_id uuid) RETURNS TABLE(user_id uuid, role public.user_role, first_name text, last_name text, nickname text, title text, pick smallint, spoken_languages public.spoken_language[], photo_version text, translations jsonb, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT l.*
    FROM public.list_public_team_profiles() l
   WHERE l.user_id = p_user_id;
$$;


--
-- Name: FUNCTION get_public_team_profile(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_public_team_profile(p_user_id uuid) IS 'One person''s public team profile, the same row list_public_team_profiles gives them, or no row when their profile is not public, they are neither an admin nor a Gedu, or no such person exists (NULL included). SECURITY INVOKER over list_public_team_profiles, so it can answer with nothing the list would not. Answers every caller identically.';


--
-- Name: FUNCTION get_public_team_profile(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_public_team_profile(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_public_team_profile(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_public_team_profile(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_public_team_profile(p_user_id uuid) TO service_role;


