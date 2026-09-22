--
-- Name: chat_body_mentions_are_roster(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.chat_body_mentions_are_roster(p_channel_id uuid, p_body text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM regexp_matches(
             COALESCE(p_body, ''),
             '@\[[^][]{1,64}\]\(([0-9a-fA-F-]{36})\)',
             'g'
           ) AS token(captures)
     WHERE lower(token.captures[1]) NOT IN (
       SELECT lower(roster.account_id::text)
         FROM public.chat_channel_roster_ids(p_channel_id) AS roster(account_id)
     )
  );
$$;


--
-- Name: FUNCTION chat_body_mentions_are_roster(p_channel_id uuid, p_body text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.chat_body_mentions_are_roster(p_channel_id uuid, p_body text) IS 'Internal: whether every `@[Name](id)` token in a body names an account on this channel''s roster. The send and edit RPCs refuse a body that fails it — an unvalidated token would render attacker-chosen text as a trusted-looking mention chip in a room of children. A body with no tokens passes trivially, which is what makes a plain sentence free.';


--
-- Name: FUNCTION chat_body_mentions_are_roster(p_channel_id uuid, p_body text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.chat_body_mentions_are_roster(p_channel_id uuid, p_body text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.chat_body_mentions_are_roster(p_channel_id uuid, p_body text) TO service_role;


