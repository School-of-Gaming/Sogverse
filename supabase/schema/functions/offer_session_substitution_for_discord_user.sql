--
-- Name: offer_session_substitution_for_discord_user(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.offer_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN public.respond_to_session_substitution(
    public.require_discord_linked_gedu(p_discord_user_id),
    p_request_id,
    'offer'::public.substitution_offer_response
  );
END;
$$;


--
-- Name: FUNCTION offer_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.offer_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) IS 'The Offer button on a substitution DM: require_discord_linked_gedu (P0031 when no gedu account is linked), then respond_to_session_substitution for that gedu with `offer` — the same refusals and concealed document as offer_session_substitution. For the Discord bot, on the service-role client: granted to service_role alone.';


--
-- Name: FUNCTION offer_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.offer_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.offer_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) TO service_role;


