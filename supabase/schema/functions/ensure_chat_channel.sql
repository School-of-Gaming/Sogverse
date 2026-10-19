--
-- Name: ensure_chat_channel(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_chat_channel(p_group_id uuid) RETURNS SETOF public.chat_channels
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_opens timestamptz;
  v_ends  timestamptz;
  v_id    uuid;
BEGIN
  -- Guard first. A NULL group is refused outright rather than allowed to fall
  -- through the predicate — an admin passes is_voice_group_member(NULL), and a
  -- refusal is the only correct answer to "which group?" with no group named.
  IF p_group_id IS NULL OR NOT public.is_voice_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The earliest-opening window open now that the group has not cancelled: a
  -- cancelled session opens no chat, as it opens no voice room.
  SELECT w.opens_at, w.closes_at
    INTO v_opens, v_ends
    FROM public.group_open_session_windows(p_group_id) AS w
   WHERE NOT w.cancelled
   ORDER BY w.opens_at, w.closes_at
   LIMIT 1;

  IF v_opens IS NULL THEN
    RAISE EXCEPTION 'No session window is open for this group'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Insert-or-reselect, the established idempotent shape. Two joiners racing on
  -- mount is the normal case, not the exception.
  INSERT INTO public.chat_channels (
    type, group_id, session_opens_at, session_ends_at
  )
  VALUES (
    'group_session'::public.chat_channel_type, p_group_id, v_opens, v_ends
  )
  ON CONFLICT (group_id, session_opens_at) DO NOTHING
  RETURNING chat_channels.id INTO v_id;

  IF v_id IS NULL THEN
    SELECT c.id INTO v_id
      FROM public.chat_channels c
     WHERE c.group_id = p_group_id
       AND c.session_opens_at = v_opens;
  END IF;

  RETURN QUERY
  SELECT c.* FROM public.chat_channels c WHERE c.id = v_id;
END;
$$;


--
-- Name: FUNCTION ensure_chat_channel(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ensure_chat_channel(p_group_id uuid) IS 'The current session window''s chat channel for a group, materialized if it does not exist yet. Guarded on is_voice_group_member, so exactly the people who may join the room may open its chat. Both window instants come from group_open_session_windows — the first open window the group has not cancelled — and are never accepted from the caller: they feed the family read bound, so a client-supplied value would let a member mint an arbitrary read window over the group''s history. The voice token route reads the same function, so a room and its chat agree on the window and so on the channel, whose key is (group, opening instant). Deliberately never calls ensure_group_session and never touches group_sessions: that function is unguarded behind staff-only callers, and a participant reaching it would manufacture phantom session rows in the staff feeds. Raises P0002 when no window is open, which the container renders as its one quiet "chat unavailable" line.';


--
-- Name: FUNCTION ensure_chat_channel(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_chat_channel(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_chat_channel(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_chat_channel(p_group_id uuid) TO service_role;


