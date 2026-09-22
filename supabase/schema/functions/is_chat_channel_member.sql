--
-- Name: is_chat_channel_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_chat_channel_member(p_channel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE((
    SELECT
      CASE c.type
        WHEN 'group_session'::public.chat_channel_type THEN
          public.is_voice_group_member(c.group_id)
          AND (
            -- Staff read without a time bound: after-the-fact review is the
            -- whole point of keeping the rows.
            public.is_voice_group_moderator(c.group_id)
            -- A family participant reads around this channel's own window.
            OR now() < c.session_ends_at + interval '1 hour'
          )
      END
      FROM public.chat_channels c
     WHERE c.id = p_channel_id
  ), false);
$$;


--
-- Name: FUNCTION is_chat_channel_member(p_channel_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_chat_channel_member(p_channel_id uuid) IS 'Who may READ this channel — the predicate every chat RLS policy and every chat RPC guard composes from, and the seam a later channel type extends by adding a branch. For a group_session channel: the voice room''s own membership predicate, plus a time bound that applies to FAMILY participants only. The bound is not belt-and-braces — postgres_changes respects RLS, so the subscriber reads these tables directly and any member''s own account can query PostgREST for them; without it that path returns every past session''s log, including chat from before that member joined the group. The one hour is chat''s own number, duplicated on purpose rather than derived from the TypeScript voice margins SQL cannot see. Total boolean: an unknown id is false, never NULL.';


--
-- Name: FUNCTION is_chat_channel_member(p_channel_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_chat_channel_member(p_channel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_chat_channel_member(p_channel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_chat_channel_member(p_channel_id uuid) TO service_role;


