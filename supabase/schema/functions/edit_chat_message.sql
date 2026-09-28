--
-- Name: edit_chat_message(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.edit_chat_message(p_id uuid, p_body text) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_channel_id uuid;
  v_sender_id  uuid;
  v_hidden_at  timestamptz;
  v_has_body   boolean;
  v_edited_at  timestamptz;
BEGIN
  SELECT m.channel_id, m.sender_id, m.hidden_at, m.body IS NOT NULL
    INTO v_channel_id, v_sender_id, v_hidden_at, v_has_body
    FROM public.chat_messages m
   WHERE m.id = p_id;

  -- A message that does not exist, one somebody else sent, and one in a channel
  -- the caller may no longer read all answer IDENTICALLY. The caller has no
  -- right to learn which of the three it was.
  IF v_channel_id IS NULL
     OR v_sender_id IS DISTINCT FROM v_uid
     OR NOT public.is_chat_channel_member(v_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.chat_caller_is_locked(v_channel_id) THEN
    RAISE EXCEPTION 'You cannot edit messages in this chat'
      USING ERRCODE = 'P0024';
  END IF;

  IF v_hidden_at IS NOT NULL OR NOT v_has_body THEN
    RAISE EXCEPTION 'That message cannot be edited'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.chat_body_mentions_are_roster(v_channel_id, p_body) THEN
    RAISE EXCEPTION 'This message mentions somebody who is not in this chat'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.chat_messages
     SET body = p_body, edited_at = now()
   WHERE id = p_id
  RETURNING chat_messages.edited_at INTO v_edited_at;

  RETURN v_edited_at;
END;
$$;


--
-- Name: FUNCTION edit_chat_message(p_id uuid, p_body text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.edit_chat_message(p_id uuid, p_body text) IS 'Rewrite the caller''s OWN standing text message in place, stamping edited_at. Refuses a removed message, an image message (there is nothing to edit) and any message under a lock — capabilities.ts is the spec and a lock takes edits away, so that refusal carries P0024. A message that does not exist, one somebody else sent and one in a channel the caller may no longer read are all refused identically with 42501. Mentions are validated against the channel roster exactly as on a send: an edit is a body write, and a name typed for the first time during one becomes a mention. The character cap stays the column''s.';


--
-- Name: FUNCTION edit_chat_message(p_id uuid, p_body text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.edit_chat_message(p_id uuid, p_body text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.edit_chat_message(p_id uuid, p_body text) TO authenticated;
GRANT ALL ON FUNCTION public.edit_chat_message(p_id uuid, p_body text) TO service_role;


