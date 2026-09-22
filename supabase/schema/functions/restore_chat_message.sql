--
-- Name: restore_chat_message(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_chat_message(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_channel_id uuid;
  v_hidden_at  timestamptz;
BEGIN
  SELECT m.channel_id, m.hidden_at
    INTO v_channel_id, v_hidden_at
    FROM public.chat_messages m
   WHERE m.id = p_id;

  IF v_channel_id IS NULL
     OR NOT public.is_chat_channel_moderator(v_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_hidden_at IS NULL THEN
    RAISE EXCEPTION 'That message has not been removed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- hidden_by is cleared with hidden_at: after a restore nothing was removed,
  -- and a stamp naming somebody for an act that no longer stands would read as
  -- an accusation in the psql review path it exists to serve.
  UPDATE public.chat_messages
     SET hidden_at = NULL, hidden_by = NULL
   WHERE id = p_id;
END;
$$;


--
-- Name: FUNCTION restore_chat_message(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.restore_chat_message(p_id uuid) IS 'Put a removed message back. MODERATORS ONLY — the one control a tombstone carries — and only on a message that is actually removed. Clears hidden_by along with hidden_at. A message that does not exist and one in a channel the caller does not moderate are refused identically with 42501.';


--
-- Name: FUNCTION restore_chat_message(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.restore_chat_message(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.restore_chat_message(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.restore_chat_message(p_id uuid) TO service_role;


