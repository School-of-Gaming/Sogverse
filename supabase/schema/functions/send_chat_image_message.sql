--
-- Name: send_chat_image_message(uuid, uuid, integer, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_chat_image_message(p_id uuid, p_channel_id uuid, p_width integer, p_height integer, p_reply_to_message_id uuid DEFAULT NULL::uuid) RETURNS timestamp with time zone
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

  -- One refusal for every implausible dimension, rather than a 23514 from the
  -- CHECK for an out-of-range value and a 23502 from NOT NULL for a missing
  -- one. The table's constraints still stand behind this and are what make the
  -- bound a guarantee rather than a convention.
  IF p_width IS NULL OR p_height IS NULL
     OR p_width  <= 0 OR p_width  > 4096
     OR p_height <= 0 OR p_height > 4096 THEN
    RAISE EXCEPTION 'Image dimensions % x % are not a plausible chat image',
      COALESCE(p_width::text, 'NULL'), COALESCE(p_height::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

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

  INSERT INTO public.chat_messages (
    id, channel_id, sender_id, image_width, image_height, reply_to_message_id
  )
  VALUES (p_id, p_channel_id, v_uid, p_width, p_height, p_reply_to_message_id)
  RETURNING chat_messages.created_at INTO v_created_at;

  RETURN v_created_at;
END;
$$;


--
-- Name: FUNCTION send_chat_image_message(p_id uuid, p_channel_id uuid, p_width integer, p_height integer, p_reply_to_message_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.send_chat_image_message(p_id uuid, p_channel_id uuid, p_width integer, p_height integer, p_reply_to_message_id uuid) IS 'Create the ROW for one chat image, ahead of its object. Called by the upload route on the UPLOADER''S OWN client — this guard is the authorization, and the admin client is used for the storage write alone — with the dimensions the route''s sharp re-encode measured, never the ones a client claimed. Same membership, lock and reply-target guards as the text send; the reply parameter matters because a burst with no text puts the reply on the first image. Implausible dimensions are refused with check_violation as one class, the column CHECKs standing behind it. Returns created_at.';


--
-- Name: FUNCTION send_chat_image_message(p_id uuid, p_channel_id uuid, p_width integer, p_height integer, p_reply_to_message_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.send_chat_image_message(p_id uuid, p_channel_id uuid, p_width integer, p_height integer, p_reply_to_message_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_chat_image_message(p_id uuid, p_channel_id uuid, p_width integer, p_height integer, p_reply_to_message_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.send_chat_image_message(p_id uuid, p_channel_id uuid, p_width integer, p_height integer, p_reply_to_message_id uuid) TO service_role;


