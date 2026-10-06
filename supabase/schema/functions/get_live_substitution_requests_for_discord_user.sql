--
-- Name: get_live_substitution_requests_for_discord_user(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_live_substitution_requests_for_discord_user(p_discord_user_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  v_gedu_id := public.require_discord_linked_gedu(p_discord_user_id);

  RETURN public.gedu_live_substitution_requests(v_gedu_id);
END;
$$;


--
-- Name: FUNCTION get_live_substitution_requests_for_discord_user(p_discord_user_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_live_substitution_requests_for_discord_user(p_discord_user_id text) IS 'get_my_live_substitution_requests for the gedu a Discord user id acts as: require_discord_linked_gedu (P0031 when none), then gedu_live_substitution_requests for that gedu, so the requests are the very ones the web reads. The /sub command leaves those sessions out of its list. For the Discord bot, on the service-role client: granted to service_role alone.';


--
-- Name: FUNCTION get_live_substitution_requests_for_discord_user(p_discord_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_live_substitution_requests_for_discord_user(p_discord_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_live_substitution_requests_for_discord_user(p_discord_user_id text) TO service_role;


