--
-- Name: chat_caller_is_locked(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.chat_caller_is_locked(p_channel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.chat_channel_locks l
     WHERE l.channel_id = p_channel_id
       AND l.user_id    = (SELECT auth.uid())
       AND l.locked_at IS NOT NULL
  );
$$;


--
-- Name: FUNCTION chat_caller_is_locked(p_channel_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.chat_caller_is_locked(p_channel_id uuid) IS 'Internal: whether a moderator has silenced the CALLER in this channel. Asked by the send, edit and reaction RPCs, which refuse with P0024; deliberately NOT asked by hide_chat_message, because taking back your own message is the one write a lock leaves. Keyed on locked_at rather than on the row''s existence, since unlocking is an update to NULL.';


--
-- Name: FUNCTION chat_caller_is_locked(p_channel_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.chat_caller_is_locked(p_channel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.chat_caller_is_locked(p_channel_id uuid) TO service_role;


