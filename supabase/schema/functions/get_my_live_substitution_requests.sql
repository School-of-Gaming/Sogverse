--
-- Name: get_my_live_substitution_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_live_substitution_requests() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN public.gedu_live_substitution_requests((SELECT auth.uid()));
END;
$$;


--
-- Name: FUNCTION get_my_live_substitution_requests(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_live_substitution_requests() IS 'The calling gedu''s live substitution requests, exactly as gedu_live_substitution_requests describes them for that gedu: gedu-gated on its first statement, then that function for auth.uid(). The Substitutions page''s absence picker reads it to show the sessions the gedu has already asked a substitute for as disabled; get_live_substitution_requests_for_discord_user is the Discord bot''s way in.';


--
-- Name: FUNCTION get_my_live_substitution_requests(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_live_substitution_requests() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_live_substitution_requests() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_live_substitution_requests() TO service_role;


