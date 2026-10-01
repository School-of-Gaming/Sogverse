--
-- Name: is_public_team_photo(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_public_team_photo(p_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.team_profiles tp
      JOIN public.profiles p ON p.id = tp.user_id
     WHERE tp.photo_path = p_name
       AND tp.approved
       AND p.role IN ('admin', 'gedu'));
$$;


--
-- Name: FUNCTION is_public_team_photo(p_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_public_team_photo(p_name text) IS 'Whether a team-photos object name is the current photo of a profile list_public_team_profiles shows: approved, of a person who is still an admin or a Gedu. A total boolean (false for NULL). The predicate of the team_photos_public_read storage policy, which anon evaluates itself, so it is SECURITY DEFINER over team tables anon holds no grant on, and answers only yes or no about a name. A photo replaced, or a profile hidden, stops answering yes at once.';


--
-- Name: FUNCTION is_public_team_photo(p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_public_team_photo(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_public_team_photo(p_name text) TO anon;
GRANT ALL ON FUNCTION public.is_public_team_photo(p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.is_public_team_photo(p_name text) TO service_role;


