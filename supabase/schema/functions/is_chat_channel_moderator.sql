--
-- Name: is_chat_channel_moderator(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_chat_channel_moderator(p_channel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE((
    SELECT
      CASE c.type
        WHEN 'group_session'::public.chat_channel_type THEN
          public.is_voice_group_moderator(c.group_id)
      END
      FROM public.chat_channels c
     WHERE c.id = p_channel_id
  ), false);
$$;


--
-- Name: FUNCTION is_chat_channel_moderator(p_channel_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_chat_channel_moderator(p_channel_id uuid) IS 'Whether the caller moderates this channel — a POSITIVE allow-list (admin, or a gedu assigned to the product), never an exclusion. The voice room learned that the expensive way: a "not a gamer" test would have handed moderation to parents the day parent seats shipped, and a parent in a chat is a participant with no moderator powers, exactly like a child. Consumed by the lock-row read policy and by the hide/restore/lock RPC guards. Total boolean.';


--
-- Name: FUNCTION is_chat_channel_moderator(p_channel_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_chat_channel_moderator(p_channel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_chat_channel_moderator(p_channel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_chat_channel_moderator(p_channel_id uuid) TO service_role;


