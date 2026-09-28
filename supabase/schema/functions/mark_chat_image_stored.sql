--
-- Name: mark_chat_image_stored(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_chat_image_stored(p_id uuid) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_sender_id uuid;
  v_is_image  boolean;
  v_stored_at timestamptz;
BEGIN
  SELECT m.sender_id, m.image_width IS NOT NULL
    INTO v_sender_id, v_is_image
    FROM public.chat_messages m
   WHERE m.id = p_id;

  -- A message that does not exist and one somebody else sent answer
  -- IDENTICALLY, exactly as edit_chat_message refuses: the caller has no
  -- right to learn which it was, so this cannot be an oracle for message ids.
  IF v_sender_id IS NULL OR v_sender_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_image THEN
    RAISE EXCEPTION 'That message has no image to mark as stored'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotent by COALESCE: the first call stamps, any repeat returns the
  -- standing stamp untouched — the write side of the column's monotonicity.
  UPDATE public.chat_messages
     SET image_stored_at = COALESCE(image_stored_at, now())
   WHERE id = p_id
  RETURNING chat_messages.image_stored_at INTO v_stored_at;

  RETURN v_stored_at;
END;
$$;


--
-- Name: FUNCTION mark_chat_image_stored(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_chat_image_stored(p_id uuid) IS 'Record that the caller''s OWN image message''s object has landed, stamping image_stored_at (idempotently — a standing stamp is returned, never moved). Called by the upload route on the uploader''s own client the moment the storage write returns; the resulting realtime UPDATE is the event that tells every subscriber the picture is fetchable. Ownership is the whole guard: no membership, lock or hidden check, because this completes a send that send_chat_image_message already authorized, and none of those landing mid-upload may strand a legitimate picture as permanently blank. A missing row and somebody else''s row are refused identically with 42501; a text message with check_violation. Returns image_stored_at.';


--
-- Name: FUNCTION mark_chat_image_stored(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_chat_image_stored(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_chat_image_stored(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_chat_image_stored(p_id uuid) TO service_role;


