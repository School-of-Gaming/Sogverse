--
-- Name: consume_slack_link_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_slack_link_token(p_token text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_token public.slack_link_tokens%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();

  -- Deleting first is what makes the token single-use: a concurrent second
  -- call waits on the row lock and then finds nothing. A NULL token hashes to
  -- NULL and matches no row.
  DELETE FROM public.slack_link_tokens t
   WHERE t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  RETURNING t.* INTO v_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLACK_LINK_TOKEN_NOT_FOUND' USING ERRCODE = 'P0032';
  END IF;

  -- The raise rolls the delete back, so an expired token keeps answering
  -- "expired" until the next sweep removes it.
  IF v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'SLACK_LINK_TOKEN_EXPIRED' USING ERRCODE = 'P0033';
  END IF;

  INSERT INTO public.slack_links (profile_id, slack_user_id, slack_team_id, slack_username, linked_at)
  VALUES ((SELECT auth.uid()), v_token.slack_user_id, v_token.slack_team_id, v_token.slack_username, now())
  ON CONFLICT (profile_id) DO UPDATE
     SET slack_user_id = EXCLUDED.slack_user_id,
         slack_team_id = EXCLUDED.slack_team_id,
         slack_username = EXCLUDED.slack_username,
         linked_at = EXCLUDED.linked_at;

  DELETE FROM public.slack_link_tokens WHERE expires_at <= now();

  RETURN v_token.slack_username;
END;
$$;


--
-- Name: FUNCTION consume_slack_link_token(p_token text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.consume_slack_link_token(p_token text) IS 'Links the calling admin''s profile to the Slack user a link token was minted for, and returns that Slack username. Takes the raw token and hashes it here (SHA-256, hex). The token is deleted, so it works once; the caller''s previous link, if any, is replaced, and no other profile''s link is touched. Refuses every role but admin with 42501, a token that is unknown or already used with P0032 (SLACK_LINK_TOKEN_NOT_FOUND), and an expired one with P0033 (SLACK_LINK_TOKEN_EXPIRED). SECURITY DEFINER because slack_link_tokens has no authenticated grant and slack_links no authenticated write grant: it is the write boundary for both.';


--
-- Name: FUNCTION consume_slack_link_token(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_slack_link_token(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_slack_link_token(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.consume_slack_link_token(p_token text) TO service_role;


