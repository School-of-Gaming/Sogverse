--
-- Name: toggle_chat_reaction(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_chat_reaction(p_message_id uuid, p_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_channel_id uuid;
  v_hidden_at  timestamptz;
BEGIN
  SELECT m.channel_id, m.hidden_at
    INTO v_channel_id, v_hidden_at
    FROM public.chat_messages m
   WHERE m.id = p_message_id;

  IF v_channel_id IS NULL
     OR NOT public.is_chat_channel_member(v_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.chat_caller_is_locked(v_channel_id) THEN
    RAISE EXCEPTION 'You cannot react in this chat' USING ERRCODE = 'P0024';
  END IF;

  IF v_hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'That message cannot be reacted to'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.chat_reactions r
   WHERE r.message_id = p_message_id
     AND r.sender_id  = v_uid
     AND r.code       = p_code;

  IF FOUND THEN
    RETURN false;
  END IF;

  -- channel_id is stamped from the MESSAGE row, never from the caller: that is
  -- what stops a reaction being filed under a channel its message is not in,
  -- and the column exists so a postgres_changes subscription can filter on one
  -- column.
  INSERT INTO public.chat_reactions (message_id, sender_id, code, channel_id)
  VALUES (p_message_id, v_uid, p_code, v_channel_id);

  RETURN true;
END;
$$;


--
-- Name: FUNCTION toggle_chat_reaction(p_message_id uuid, p_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.toggle_chat_reaction(p_message_id uuid, p_code text) IS 'Add or take back the caller''s reaction on one message, returning whether it now stands. Guards: channel membership, not locked (P0024 — a reaction is a message with fewer characters, so a lock takes it away), and a target that has not been removed. The channel_id on the new row is stamped from the MESSAGE, never from the caller. The approved code set is not restated here: the delete runs first and the insert meets the column''s own CHECK, so there is one list in SQL and it is the one mirroring CHAT_REACTION_CODES.';


--
-- Name: FUNCTION toggle_chat_reaction(p_message_id uuid, p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.toggle_chat_reaction(p_message_id uuid, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.toggle_chat_reaction(p_message_id uuid, p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.toggle_chat_reaction(p_message_id uuid, p_code text) TO service_role;


