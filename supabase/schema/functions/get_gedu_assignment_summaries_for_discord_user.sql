--
-- Name: get_gedu_assignment_summaries_for_discord_user(text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gedu_assignment_summaries_for_discord_user(p_discord_user_id text, p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  v_gedu_id := public.require_discord_linked_gedu(p_discord_user_id);

  RETURN public.gedu_assignment_summaries(v_gedu_id, p_epoch_date);
END;
$$;


--
-- Name: FUNCTION get_gedu_assignment_summaries_for_discord_user(p_discord_user_id text, p_epoch_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_gedu_assignment_summaries_for_discord_user(p_discord_user_id text, p_epoch_date date) IS 'get_my_gedu_assignment_summaries for the gedu a Discord user id acts as: require_discord_linked_gedu (P0031 when none), then gedu_assignment_summaries for that gedu, so the summaries are the very ones the web reads. For the Discord bot, on the service-role client: granted to service_role alone.';


--
-- Name: FUNCTION get_gedu_assignment_summaries_for_discord_user(p_discord_user_id text, p_epoch_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_gedu_assignment_summaries_for_discord_user(p_discord_user_id text, p_epoch_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_gedu_assignment_summaries_for_discord_user(p_discord_user_id text, p_epoch_date date) TO service_role;


