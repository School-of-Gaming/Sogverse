--
-- Name: send_chat_message(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_chat_message(p_id uuid, p_channel_id uuid, p_body text, p_reply_to_message_id uuid DEFAULT NULL::uuid) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_created_at timestamptz;
BEGIN
  IF NOT public.is_chat_channel_member(p_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.chat_caller_is_locked(p_channel_id) THEN
    RAISE EXCEPTION 'You cannot send messages in this chat'
      USING ERRCODE = 'P0024';
  END IF;

  -- capabilities.ts offers reply only on a NON-HIDDEN message, and a reply
  -- across channels is not a thing the UI can express at all. A target that
  -- does not exist, one in another channel and one that has been removed are
  -- refused identically, so this cannot be used as an oracle for message ids.
  IF p_reply_to_message_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.chat_messages m
        WHERE m.id = p_reply_to_message_id
          AND m.channel_id = p_channel_id
          AND m.hidden_at IS NULL
     ) THEN
    RAISE EXCEPTION 'That message cannot be replied to'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.chat_body_mentions_are_roster(p_channel_id, p_body) THEN
    RAISE EXCEPTION 'This message mentions somebody who is not in this chat'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.chat_messages (
    id, channel_id, sender_id, body, reply_to_message_id
  )
  VALUES (p_id, p_channel_id, v_uid, p_body, p_reply_to_message_id)
  RETURNING chat_messages.created_at INTO v_created_at;

  RETURN v_created_at;
END;
$$;


--
-- Name: FUNCTION send_chat_message(p_id uuid, p_channel_id uuid, p_body text, p_reply_to_message_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.send_chat_message(p_id uuid, p_channel_id uuid, p_body text, p_reply_to_message_id uuid) IS 'Post one text message, under the caller''s own id so the optimistic echo reconciles by identity. Guards, in order: channel membership (42501), not locked (P0024 — the one named refusal, because the client must not offer a retry for it), a reply target that is a NON-HIDDEN message of the same channel, and every mention token naming somebody on the channel roster. The character cap is the COLUMN''S, measured on the display form with mention tokens flattened; this function deliberately does not re-measure, so there is no second number to drift. Returns created_at.';


--
-- Name: FUNCTION send_chat_message(p_id uuid, p_channel_id uuid, p_body text, p_reply_to_message_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.send_chat_message(p_id uuid, p_channel_id uuid, p_body text, p_reply_to_message_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_chat_message(p_id uuid, p_channel_id uuid, p_body text, p_reply_to_message_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.send_chat_message(p_id uuid, p_channel_id uuid, p_body text, p_reply_to_message_id uuid) TO service_role;


