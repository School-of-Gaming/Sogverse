--
-- Name: consume_discord_link_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_discord_link_token(p_token text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_token public.discord_link_tokens%ROWTYPE;
BEGIN
  -- An admin or a Gedu; everyone else is refused on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- Deleting first is what makes the token single-use: a concurrent second
  -- call waits on the row lock and then finds nothing. A NULL token hashes to
  -- NULL and matches no row.
  DELETE FROM public.discord_link_tokens t
   WHERE t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  RETURNING t.* INTO v_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISCORD_LINK_TOKEN_NOT_FOUND' USING ERRCODE = 'P0029';
  END IF;

  -- The raise rolls the delete back, so an expired token keeps answering
  -- "expired" until the next sweep removes it.
  IF v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'DISCORD_LINK_TOKEN_EXPIRED' USING ERRCODE = 'P0030';
  END IF;

  INSERT INTO public.discord_links (profile_id, discord_user_id, discord_username, linked_at)
  VALUES ((SELECT auth.uid()), v_token.discord_user_id, v_token.discord_username, now())
  ON CONFLICT (profile_id) DO UPDATE
     SET discord_user_id = EXCLUDED.discord_user_id,
         discord_username = EXCLUDED.discord_username,
         linked_at = EXCLUDED.linked_at;

  DELETE FROM public.discord_link_tokens WHERE expires_at <= now();

  RETURN v_token.discord_username;
END;
$$;


--
-- Name: FUNCTION consume_discord_link_token(p_token text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.consume_discord_link_token(p_token text) IS 'Links the calling admin''s or Gedu''s profile to the Discord user a /link token was minted for, and returns that Discord username. Takes the raw token and hashes it here (SHA-256, hex). The token is deleted, so it works once; the caller''s previous link, if any, is replaced, and no other profile''s link is touched. Refuses other roles with 42501, a token that is unknown or already used with P0029 (DISCORD_LINK_TOKEN_NOT_FOUND), and an expired one with P0030 (DISCORD_LINK_TOKEN_EXPIRED). SECURITY DEFINER because discord_link_tokens has no authenticated grant and discord_links no authenticated write grant: it is the write boundary for both.';


--
-- Name: FUNCTION consume_discord_link_token(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_discord_link_token(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_discord_link_token(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.consume_discord_link_token(p_token text) TO service_role;


