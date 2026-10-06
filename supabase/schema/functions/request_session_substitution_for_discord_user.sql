--
-- Name: request_session_substitution_for_discord_user(text, uuid, date, public.substitution_reason, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_session_substitution_for_discord_user(p_discord_user_id text, p_group_id uuid, p_session_date date, p_reason public.substitution_reason DEFAULT NULL::public.substitution_reason, p_reason_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  v_gedu_id := public.require_discord_linked_gedu(p_discord_user_id);

  RETURN public.file_session_substitution_request(
    v_gedu_id, p_group_id, p_session_date, p_reason, p_reason_note
  );
END;
$$;


--
-- Name: FUNCTION request_session_substitution_for_discord_user(p_discord_user_id text, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.request_session_substitution_for_discord_user(p_discord_user_id text, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) IS '"I cannot make this session", filed from Discord''s /sub command: require_discord_linked_gedu (P0031 when no gedu account is linked), then file_session_substitution_request for that gedu — the same checks, refusals and returned document as request_session_substitution. For the Discord bot, on the service-role client: granted to service_role alone. The reason parameters carry SQL defaults so a caller with no note omits the key.';


--
-- Name: FUNCTION request_session_substitution_for_discord_user(p_discord_user_id text, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_session_substitution_for_discord_user(p_discord_user_id text, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_session_substitution_for_discord_user(p_discord_user_id text, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) TO service_role;


