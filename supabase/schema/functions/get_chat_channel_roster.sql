--
-- Name: get_chat_channel_roster(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_chat_channel_roster(p_channel_id uuid) RETURNS TABLE(id uuid, first_name text, role public.user_role, is_trainee boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_moderator boolean;
BEGIN
  IF NOT public.is_chat_channel_member(p_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Whether somebody is a trainee is for the room's staff to know. Everyone
  -- else is told false for everyone, so a trainee reads as the gedu their
  -- role says they are.
  v_moderator := public.is_chat_channel_moderator(p_channel_id);

  RETURN QUERY
  SELECT pr.id, pr.first_name, pr.role,
         (v_moderator AND EXISTS (
           SELECT 1
             FROM public.chat_channels c
             JOIN public.gedu_group_trainees t ON t.group_id = c.group_id
            WHERE c.id = p_channel_id
              AND t.gedu_id = pr.id
         )) AS is_trainee
    FROM public.profiles pr
   WHERE pr.id IN (
     SELECT roster.account_id
       FROM public.chat_channel_roster_ids(p_channel_id) AS roster(account_id)
   )
   ORDER BY pr.id;
END;
$$;


--
-- Name: FUNCTION get_chat_channel_roster(p_channel_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) IS 'The accounts a channel can name: the group''s active seat-holders, the product''s assigned gedus, and everyone who has a message in the channel — that last clause is what keeps a departed member''s name on the words they left behind, and how a covering gedu or an admin becomes mentionable the moment they send. First name, role and is_trainee only; nothing else about anybody. is_trainee is true for a trainee of the channel''s group when the CALLER moderates the channel, and false for everyone when they do not: a trainee''s role is gedu, and only staff are told the difference. Membership-scoped on is_chat_channel_member. Exists because `profiles` RLS correctly refuses cross-participant reads and persisted history cannot resolve names from a live call the way the old ephemeral chat did. ORDERED BY PROFILE ID and that is a contract: mention resolution settles two accounts sharing a name by list position, and the composer and the in-place editor must be handed the same array in the same order or one typed name would mean two different people.';


--
-- Name: FUNCTION get_chat_channel_roster(p_channel_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) TO service_role;


