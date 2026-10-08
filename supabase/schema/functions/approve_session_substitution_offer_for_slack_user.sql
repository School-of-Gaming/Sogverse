--
-- Name: approve_session_substitution_offer_for_slack_user(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_session_substitution_offer_for_slack_user(p_slack_user_id text, p_offer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN public.approve_substitution_offer_as(
    public.require_slack_linked_admin(p_slack_user_id), p_offer_id
  );
END;
$$;


--
-- Name: FUNCTION approve_session_substitution_offer_for_slack_user(p_slack_user_id text, p_offer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.approve_session_substitution_offer_for_slack_user(p_slack_user_id text, p_offer_id uuid) IS 'The Accept button on an offer in the Slack substitutions channel: require_slack_linked_admin (P0034 when no admin account is linked), then approve_substitution_offer_as for that admin — the same refusals and admin document as approve_session_substitution_offer, with approved_by naming the linked admin. For the Slack webhook, on the service-role client: granted to service_role alone.';


--
-- Name: FUNCTION approve_session_substitution_offer_for_slack_user(p_slack_user_id text, p_offer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.approve_session_substitution_offer_for_slack_user(p_slack_user_id text, p_offer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_session_substitution_offer_for_slack_user(p_slack_user_id text, p_offer_id uuid) TO service_role;


