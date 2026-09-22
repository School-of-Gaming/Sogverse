--
-- Name: hide_chat_message(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hide_chat_message(p_id uuid) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_channel_id uuid;
  v_sender_id  uuid;
  v_hidden_at  timestamptz;
BEGIN
  SELECT m.channel_id, m.sender_id, m.hidden_at
    INTO v_channel_id, v_sender_id, v_hidden_at
    FROM public.chat_messages m
   WHERE m.id = p_id;

  IF v_channel_id IS NULL
     OR NOT public.is_chat_channel_member(v_channel_id)
     OR NOT (
       v_sender_id IS NOT DISTINCT FROM v_uid
       OR public.is_chat_channel_moderator(v_channel_id)
     ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- capabilities.ts offers neither delete nor hide on an already-removed
  -- message, so this cannot arrive from the UI; refusing keeps the two halves
  -- in step rather than silently re-stamping who removed it.
  IF v_hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'That message has already been removed'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.chat_messages
     SET hidden_at = now(), hidden_by = v_uid
   WHERE id = p_id
  RETURNING chat_messages.hidden_at INTO v_hidden_at;

  RETURN v_hidden_at;
END;
$$;


--
-- Name: FUNCTION hide_chat_message(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.hide_chat_message(p_id uuid) IS 'Remove one message, leaving the tombstone — the SOFT delete the whole surface is built on: the row and the bytes survive, the row keeps its place in the log so nothing a reader is looking at moves, and moderators keep reading the original. Open to the SENDER (any sender, a locked one included — taking back a regretted message is the one write a lock leaves) and to any MODERATOR of the channel, symmetrically: a moderator may remove anyone''s message, a fellow gedu''s and an admin''s included, and the absence of a mod-vs-mod test here is a decision, not an oversight. Self delete and moderator removal leave the identical mark, so nothing on screen tells a room which happened; hidden_by answers that for the psql review path alone. This is also the delete control for an IMAGE: no storage action is taken, because the bucket policy reads hidden_at live.';


--
-- Name: FUNCTION hide_chat_message(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.hide_chat_message(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hide_chat_message(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.hide_chat_message(p_id uuid) TO service_role;


