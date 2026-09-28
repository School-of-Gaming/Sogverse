--
-- Name: set_chat_lock(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_chat_lock(p_channel_id uuid, p_user_id uuid, p_locked boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid         uuid := (SELECT auth.uid());
  v_target_role public.user_role;
BEGIN
  IF NOT public.is_chat_channel_moderator(p_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_locked IS NULL THEN
    RAISE EXCEPTION 'A lock needs a person and a direction'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT pr.role INTO v_target_role
    FROM public.profiles pr WHERE pr.id = p_user_id;

  -- A moderator target is refused, which also covers the caller themselves:
  -- every moderator holds a moderating role, so "you cannot lock yourself"
  -- needs no separate clause.
  IF v_target_role IS NULL
     OR v_target_role IN ('admin'::public.user_role, 'gedu'::public.user_role)
  THEN
    RAISE EXCEPTION 'That person cannot be locked'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.chat_channel_roster_ids(p_channel_id) AS roster(account_id)
     WHERE roster.account_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'That person is not in this chat'
      USING ERRCODE = 'check_violation';
  END IF;

  -- UNLOCK IS AN UPDATE TO NULL, NEVER A DELETE, so both directions of the
  -- switch replicate to every subscriber without this table needing REPLICA
  -- IDENTITY FULL.
  INSERT INTO public.chat_channel_locks (
    channel_id, user_id, locked_at, locked_by, updated_at
  )
  VALUES (
    p_channel_id,
    p_user_id,
    CASE WHEN p_locked THEN now() END,
    v_uid,
    now()
  )
  ON CONFLICT (channel_id, user_id) DO UPDATE
    SET locked_at  = EXCLUDED.locked_at,
        locked_by  = EXCLUDED.locked_by,
        updated_at = now();
END;
$$;


--
-- Name: FUNCTION set_chat_lock(p_channel_id uuid, p_user_id uuid, p_locked boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_chat_lock(p_channel_id uuid, p_user_id uuid, p_locked boolean) IS 'Silence one person in one channel, or lift it. MODERATORS ONLY, and the target must not be one: a lock is a judgement about a person rather than about a message, so it is the asymmetric half of the moderation principle and a moderator cannot lock a colleague. The target test reads their ROLE, mirroring capabilities.ts exactly, and refusing a moderator target also covers locking yourself. The target must additionally be on the channel roster — that is the target half of the authorization. Unlocking sets locked_at back to NULL and NEVER deletes the row, so a lock landing mid-conversation and a lock being lifted both arrive live rather than on refetch.';


--
-- Name: FUNCTION set_chat_lock(p_channel_id uuid, p_user_id uuid, p_locked boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_chat_lock(p_channel_id uuid, p_user_id uuid, p_locked boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_chat_lock(p_channel_id uuid, p_user_id uuid, p_locked boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_chat_lock(p_channel_id uuid, p_user_id uuid, p_locked boolean) TO service_role;


